import crypto from "node:crypto";
import express from "express";
import { Firestore } from "@google-cloud/firestore";
import webpush from "web-push";
import { z } from "zod";
import { buildDigestSummary, deriveRealtimeSignals, EVENT_TO_PREF, hashEndpoint } from "./dispatch.js";
import { isEventAllowed, normalizePreferences } from "./preferences.js";
import { createSubgraphClient, fetchDigestActivities, fetchRecentSignals } from "./subgraph.js";

const PUBLIC_VAPID_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE_VAPID_KEY = process.env.VAPID_PRIVATE_KEY ?? "";
const CONTACT_EMAIL = process.env.VAPID_CONTACT_EMAIL ?? "mailto:ops@indexflow.app";
const SUBGRAPH_URL = process.env.SUBGRAPH_URL ?? "";
const DISPATCH_AUTH_TOKEN = process.env.DISPATCH_AUTH_TOKEN ?? "";
const PORT = Number(process.env.PORT ?? 8080);

if (!PUBLIC_VAPID_KEY || !PRIVATE_VAPID_KEY) {
  console.warn("VAPID keys are missing; push send endpoints will fail until configured.");
}

if (PUBLIC_VAPID_KEY && PRIVATE_VAPID_KEY) {
  webpush.setVapidDetails(CONTACT_EMAIL, PUBLIC_VAPID_KEY, PRIVATE_VAPID_KEY);
}

const firestore = new Firestore();
const subgraphClient = SUBGRAPH_URL ? createSubgraphClient(SUBGRAPH_URL) : null;

const app = express();
app.use(express.json({ limit: "1mb" }));

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const subscribeSchema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  platform: z.string().max(64).optional(),
  subscription: subscriptionSchema,
});

const unsubscribeSchema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  endpoint: z.string().url().optional(),
});

const preferencesSchema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  preferences: z.object({
    masterEnabled: z.boolean().optional(),
    digestEnabled: z.boolean().optional(),
    events: z.record(z.boolean()).optional(),
  }),
});

const testSchema = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  title: z.string().min(1).max(80).optional(),
  body: z.string().min(1).max(240).optional(),
  href: z.string().optional(),
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS = 30;
const rateLimitBuckets = new Map();

function rateLimitKey(req) {
  const ip = req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() ?? req.ip ?? "unknown";
  return `${req.path}:${ip}`;
}

function checkRateLimit(req) {
  const key = rateLimitKey(req);
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key) ?? { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  bucket.count += 1;
  rateLimitBuckets.set(key, bucket);
  return bucket.count <= RATE_LIMIT_REQUESTS;
}

function requireDispatchAuth(req, res, next) {
  if (!DISPATCH_AUTH_TOKEN) {
    res.status(500).json({ error: "DISPATCH_AUTH_TOKEN is not configured" });
    return;
  }
  const header = req.headers.authorization ?? "";
  if (header !== `Bearer ${DISPATCH_AUTH_TOKEN}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function docIdFromWalletEndpoint(wallet, endpoint) {
  return `${wallet.toLowerCase()}_${hashEndpoint(endpoint).slice(0, 24)}`;
}

function nowIso() {
  return new Date().toISOString();
}

async function getPreferences(wallet) {
  const doc = await firestore.collection("preferences").doc(wallet.toLowerCase()).get();
  return normalizePreferences(doc.exists ? doc.data()?.preferences : null);
}

async function getEnabledSubscriptionsByWallet() {
  const snap = await firestore.collection("subscriptions").where("enabled", "==", true).get();
  const map = new Map();
  for (const doc of snap.docs) {
    const row = doc.data();
    const wallet = row.wallet?.toLowerCase();
    if (!wallet || !row.subscription?.endpoint) continue;
    const list = map.get(wallet) ?? [];
    list.push({ id: doc.id, ...row });
    map.set(wallet, list);
  }
  return map;
}

async function sendToSubscriptions(subscriptions, payload) {
  let sent = 0;
  let removed = 0;
  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
      sent += 1;
    } catch (err) {
      const statusCode = err?.statusCode ?? 0;
      if (statusCode === 404 || statusCode === 410) {
        await firestore.collection("subscriptions").doc(sub.id).delete();
        removed += 1;
      }
    }
  }
  return { sent, removed };
}

async function shouldDispatch(wallet, signal) {
  const dedupeId = crypto.createHash("sha1").update(`${wallet}:${signal.eventId}`).digest("hex");
  const docRef = firestore.collection("dispatch_log").doc(dedupeId);
  const doc = await docRef.get();
  if (!doc.exists) return { allowed: true, dedupeId };

  const existing = doc.data();
  const sentAt = Date.parse(existing?.sentAt ?? "1970-01-01T00:00:00.000Z");
  const cooldownMs = Number(signal.cooldownMs ?? 0);
  if (!cooldownMs) return { allowed: false, dedupeId };
  return { allowed: Date.now() - sentAt >= cooldownMs, dedupeId };
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, now: nowIso() });
});

app.get("/v1/push/public-key", (_req, res) => {
  res.json({ publicKey: PUBLIC_VAPID_KEY });
});

app.post("/v1/push/subscribe", async (req, res) => {
  if (!checkRateLimit(req)) return res.status(429).json({ error: "Too many requests" });

  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const wallet = parsed.data.wallet.toLowerCase();
  const endpoint = parsed.data.subscription.endpoint;
  const docId = docIdFromWalletEndpoint(wallet, endpoint);

  await firestore.collection("subscriptions").doc(docId).set(
    {
      wallet,
      platform: parsed.data.platform ?? "unknown",
      endpoint,
      endpointHash: hashEndpoint(endpoint),
      subscription: parsed.data.subscription,
      enabled: true,
      updatedAt: nowIso(),
      createdAt: nowIso(),
    },
    { merge: true }
  );

  res.json({ ok: true, id: docId });
});

app.post("/v1/push/unsubscribe", async (req, res) => {
  if (!checkRateLimit(req)) return res.status(429).json({ error: "Too many requests" });

  const parsed = unsubscribeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const wallet = parsed.data.wallet.toLowerCase();

  if (parsed.data.endpoint) {
    const docId = docIdFromWalletEndpoint(wallet, parsed.data.endpoint);
    await firestore.collection("subscriptions").doc(docId).delete();
    return res.json({ ok: true, removed: 1 });
  }

  const snap = await firestore.collection("subscriptions").where("wallet", "==", wallet).get();
  if (snap.empty) return res.json({ ok: true, removed: 0 });
  const batch = firestore.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
  res.json({ ok: true, removed: snap.size });
});

app.get("/v1/push/preferences", async (req, res) => {
  const walletRaw = req.query.wallet?.toString();
  if (!walletRaw || !/^0x[a-fA-F0-9]{40}$/.test(walletRaw)) {
    return res.status(400).json({ error: "wallet query param is required" });
  }
  const preferences = await getPreferences(walletRaw.toLowerCase());
  res.json({ wallet: walletRaw.toLowerCase(), preferences, source: "cloud" });
});

app.post("/v1/push/preferences", async (req, res) => {
  if (!checkRateLimit(req)) return res.status(429).json({ error: "Too many requests" });

  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const wallet = parsed.data.wallet.toLowerCase();
  const existing = await getPreferences(wallet);
  const merged = normalizePreferences({
    ...existing,
    ...parsed.data.preferences,
    events: {
      ...existing.events,
      ...(parsed.data.preferences.events ?? {}),
    },
  });

  await firestore.collection("preferences").doc(wallet).set(
    {
      wallet,
      preferences: merged,
      updatedAt: nowIso(),
    },
    { merge: true }
  );

  res.json({ ok: true, preferences: merged });
});

app.post("/v1/push/test", async (req, res) => {
  if (!checkRateLimit(req)) return res.status(429).json({ error: "Too many requests" });

  const parsed = testSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const wallet = parsed.data.wallet.toLowerCase();
  const subs = await firestore.collection("subscriptions").where("wallet", "==", wallet).where("enabled", "==", true).get();
  if (subs.empty) return res.status(404).json({ error: "No active subscriptions for wallet" });

  const payload = {
    title: parsed.data.title ?? "IndexFlow test",
    body: parsed.data.body ?? "Push pipeline is connected",
    url: parsed.data.href ?? "/settings",
    tag: "indexflow-test",
    eventType: "test",
  };

  const sendResult = await sendToSubscriptions(
    subs.docs.map((d) => ({ id: d.id, ...d.data() })),
    payload
  );

  res.json({ ok: true, ...sendResult });
});

app.post("/v1/push/dispatch", requireDispatchAuth, async (req, res) => {
  if (!subgraphClient) {
    return res.status(500).json({ error: "SUBGRAPH_URL is not configured" });
  }

  const mode = String(req.query.mode ?? "all").toLowerCase();
  const runRealtime = mode === "all" || mode === "realtime";
  const runDigest = mode === "all" || mode === "digest";

  const stateRef = firestore.collection("dispatch_state").doc("global");
  const stateDoc = await stateRef.get();
  const state = stateDoc.exists ? stateDoc.data() : {};

  const results = {
    realtimeSignals: 0,
    realtimeSent: 0,
    digestSent: 0,
  };

  if (runRealtime) {
    const minTimestamp = Number(state?.realtimeCursor ?? 0);
    const payload = await fetchRecentSignals(subgraphClient, minTimestamp, 500);
    const signals = deriveRealtimeSignals(payload);
    results.realtimeSignals = signals.length;

    const subscriptionsByWallet = await getEnabledSubscriptionsByWallet();
    for (const signal of signals) {
      const prefKey = EVENT_TO_PREF[signal.eventType];
      const targetWallets = signal.wallet ? [signal.wallet] : Array.from(subscriptionsByWallet.keys());

      for (const wallet of targetWallets) {
        const subs = subscriptionsByWallet.get(wallet) ?? [];
        if (!subs.length) continue;

        const preferences = await getPreferences(wallet);
        if (!prefKey || !isEventAllowed(preferences, prefKey)) continue;

        const dedupe = await shouldDispatch(wallet, signal);
        if (!dedupe.allowed) continue;

        const payload = {
          title: signal.title,
          body: signal.body,
          url: signal.href,
          tag: `indexflow-${signal.eventType}`,
          eventType: signal.eventType,
        };

        const sendResult = await sendToSubscriptions(subs, payload);
        if (sendResult.sent > 0) {
          results.realtimeSent += sendResult.sent;
          await firestore.collection("dispatch_log").doc(dedupe.dedupeId).set({
            wallet,
            eventType: signal.eventType,
            eventId: signal.eventId,
            sentAt: nowIso(),
            sentCount: sendResult.sent,
          });
        }
      }
    }

    const activities = Array.isArray(payload?.basketActivities) ? payload.basketActivities : [];
    const nextCursor = activities.reduce((max, row) => Math.max(max, Number(row.timestamp ?? 0)), minTimestamp);
    await stateRef.set({ realtimeCursor: nextCursor, updatedAt: nowIso() }, { merge: true });
  }

  if (runDigest) {
    const minTimestamp = Number(state?.digestCursor ?? 0);
    const payload = await fetchDigestActivities(subgraphClient, minTimestamp, 1000);
    const activities = Array.isArray(payload?.basketActivities) ? payload.basketActivities : [];
    const summaries = buildDigestSummary(activities);

    const subscriptionsByWallet = await getEnabledSubscriptionsByWallet();

    for (const summary of summaries) {
      const subs = subscriptionsByWallet.get(summary.wallet) ?? [];
      if (!subs.length) continue;

      const prefs = await getPreferences(summary.wallet);
      if (!prefs.masterEnabled || !prefs.digestEnabled) continue;

      const sendResult = await sendToSubscriptions(subs, {
        title: summary.title,
        body: summary.body,
        url: summary.href,
        tag: "indexflow-digest",
        eventType: "digest",
      });

      results.digestSent += sendResult.sent;
    }

    const nextCursor = activities.reduce((max, row) => Math.max(max, Number(row.timestamp ?? 0)), minTimestamp);
    await stateRef.set({ digestCursor: nextCursor, updatedAt: nowIso() }, { merge: true });
  }

  res.json({ ok: true, ...results, mode });
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "indexflow-push-worker", now: nowIso() });
});

export function startServer() {
  return app.listen(PORT, () => {
    console.log(`push-worker listening on :${PORT}`);
  });
}

export default app;
