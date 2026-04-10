"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import {
  browserSupportsPush,
  defaultPushPreferences,
  detectPushPlatform,
  getPushServiceBaseUrl,
  getPushStorageKey,
  normalizePushPreferences,
  type PushEventKey,
  type PushPreferences,
} from "@/lib/push";

interface SaveResult {
  source: "cloud" | "local";
}

function decodeBase64Url(input: string): Uint8Array {
  const base64 = (input + "=".repeat((4 - (input.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePushPreferences() {
  const { address } = useAccount();
  const chainId = useChainId();
  const [preferences, setPreferences] = useState<PushPreferences>(defaultPushPreferences());
  const [loading, setLoading] = useState(false);
  const [saveSource, setSaveSource] = useState<"cloud" | "local" | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [isSubscribed, setIsSubscribed] = useState(false);

  const wallet = address?.toLowerCase();
  const pushSupported = browserSupportsPush();
  const serviceBaseUrl = getPushServiceBaseUrl();

  const storageKey = useMemo(() => {
    if (!wallet) return null;
    return getPushStorageKey(wallet, chainId);
  }, [wallet, chainId]);

  const saveLocal = useCallback(
    (next: PushPreferences) => {
      if (!storageKey) return;
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaveSource("local");
    },
    [storageKey]
  );

  const fetchCloud = useCallback(async (): Promise<PushPreferences | null> => {
    if (!wallet || !serviceBaseUrl) return null;
    const res = await fetch(`${serviceBaseUrl}/v1/push/preferences?wallet=${wallet}`);
    if (!res.ok) return null;
    const json = (await res.json()) as { preferences?: unknown };
    if (!json.preferences) return null;
    setSaveSource("cloud");
    return normalizePushPreferences(json.preferences);
  }, [wallet, serviceBaseUrl]);

  const load = useCallback(async () => {
    if (!wallet || !storageKey) return;
    setLoading(true);

    try {
      const cloud = await fetchCloud();
      if (cloud) {
        setPreferences(cloud);
        localStorage.setItem(storageKey, JSON.stringify(cloud));
        return;
      }

      const localRaw = localStorage.getItem(storageKey);
      if (localRaw) {
        setPreferences(normalizePushPreferences(JSON.parse(localRaw)));
        setSaveSource("local");
      } else {
        setPreferences(defaultPushPreferences());
      }
    } catch {
      const localRaw = localStorage.getItem(storageKey);
      if (localRaw) {
        setPreferences(normalizePushPreferences(JSON.parse(localRaw)));
        setSaveSource("local");
      }
    } finally {
      setLoading(false);
    }
  }, [wallet, storageKey, fetchCloud]);

  useEffect(() => {
    if (!pushSupported) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);

    if (!wallet || !storageKey) return;
    void load();
  }, [wallet, storageKey, load, pushSupported]);

  const syncSubscriptionState = useCallback(async () => {
    if (!pushSupported) {
      setIsSubscribed(false);
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      setIsSubscribed(Boolean(sub));
    } catch {
      setIsSubscribed(false);
    }
  }, [pushSupported]);

  useEffect(() => {
    void syncSubscriptionState();
  }, [syncSubscriptionState]);

  const saveCloud = useCallback(
    async (next: PushPreferences): Promise<boolean> => {
      if (!wallet || !serviceBaseUrl) return false;
      const res = await fetch(`${serviceBaseUrl}/v1/push/preferences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, preferences: next }),
      });
      if (!res.ok) return false;
      setSaveSource("cloud");
      return true;
    },
    [wallet, serviceBaseUrl]
  );

  const savePreferences = useCallback(
    async (next: PushPreferences): Promise<SaveResult> => {
      setPreferences(next);
      const cloudSaved = await saveCloud(next);
      if (cloudSaved) {
        if (storageKey) localStorage.setItem(storageKey, JSON.stringify(next));
        return { source: "cloud" };
      }

      saveLocal(next);
      return { source: "local" };
    },
    [saveCloud, saveLocal, storageKey]
  );

  const setMasterEnabled = useCallback(
    async (enabled: boolean) => {
      await savePreferences({ ...preferences, masterEnabled: enabled });
    },
    [preferences, savePreferences]
  );

  const setDigestEnabled = useCallback(
    async (enabled: boolean) => {
      await savePreferences({ ...preferences, digestEnabled: enabled });
    },
    [preferences, savePreferences]
  );

  const setEventEnabled = useCallback(
    async (event: PushEventKey, enabled: boolean) => {
      await savePreferences({
        ...preferences,
        events: {
          ...preferences.events,
          [event]: enabled,
        },
      });
    },
    [preferences, savePreferences]
  );

  const requestPermission = useCallback(async (): Promise<NotificationPermission | "unsupported"> => {
    if (!pushSupported) return "unsupported";
    const next = await Notification.requestPermission();
    setPermission(next);
    return next;
  }, [pushSupported]);

  const ensureRegistration = useCallback(async () => {
    if (!pushSupported) return null;
    return navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  }, [pushSupported]);

  const subscribe = useCallback(async (): Promise<SaveResult> => {
    if (!wallet || !pushSupported) return { source: "local" };
    const permissionResult = await requestPermission();
    if (permissionResult !== "granted") return { source: "local" };

    const registration = await ensureRegistration();
    if (!registration) return { source: "local" };

    const keyResponse = serviceBaseUrl ? await fetch(`${serviceBaseUrl}/v1/push/public-key`) : null;
    if (!keyResponse?.ok) return { source: "local" };
    const keyJson = (await keyResponse.json()) as { publicKey?: string };
    if (!keyJson.publicKey) return { source: "local" };

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeBase64Url(keyJson.publicKey) as unknown as BufferSource,
    });

    const body = {
      wallet,
      platform: detectPushPlatform(),
      subscription: JSON.parse(JSON.stringify(subscription)) as PushSubscriptionJSON,
    };

    if (!serviceBaseUrl) {
      setIsSubscribed(true);
      return { source: "local" };
    }

    const res = await fetch(`${serviceBaseUrl}/v1/push/subscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    setIsSubscribed(res.ok);
    return { source: res.ok ? "cloud" : "local" };
  }, [wallet, pushSupported, requestPermission, ensureRegistration, serviceBaseUrl]);

  const unsubscribe = useCallback(async (): Promise<SaveResult> => {
    if (!wallet || !pushSupported) return { source: "local" };

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    const endpoint = subscription?.endpoint;

    if (subscription) {
      await subscription.unsubscribe();
    }

    let source: SaveResult["source"] = "local";
    if (serviceBaseUrl) {
      const res = await fetch(`${serviceBaseUrl}/v1/push/unsubscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet, endpoint }),
      });
      source = res.ok ? "cloud" : "local";
    }

    setIsSubscribed(false);
    return { source };
  }, [wallet, pushSupported, serviceBaseUrl]);

  const sendTest = useCallback(async (): Promise<boolean> => {
    if (!wallet || !serviceBaseUrl) return false;
    const res = await fetch(`${serviceBaseUrl}/v1/push/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    return res.ok;
  }, [wallet, serviceBaseUrl]);

  return {
    wallet,
    loading,
    pushSupported,
    preferences,
    permission,
    saveSource,
    isSubscribed,
    setMasterEnabled,
    setDigestEnabled,
    setEventEnabled,
    requestPermission,
    subscribe,
    unsubscribe,
    sendTest,
    reload: load,
  };
}
