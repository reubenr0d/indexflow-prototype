// Signal freshness for the trade-timing layer (does not modify matrix.js scoring).

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const MATERIAL_EVENT_TYPES = new Set([
  "drill",
  "drilling",
  "drill_result",
  "drill_results",
  "resource",
  "resource_update",
  "mre",
  "study",
  "feasibility",
  "pea",
  "pfs",
  "dfs",
  "raise",
  "capital_raise",
  "financing",
  "permit",
  "permitting",
  "offtake",
  "construction",
  "production",
  "announcement",
]);

const DRILL_TITLE_HINTS = [
  "drill",
  "intercept",
  "assay",
  "hole",
  "mineralization",
  "mineralisation",
];

export function parseIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  const str = String(value).trim();
  if (!str) return null;
  const t = Date.parse(str);
  return Number.isFinite(t) ? t : null;
}

export function daysBetween(nowMs, thenMs) {
  if (!Number.isFinite(nowMs) || !Number.isFinite(thenMs)) return null;
  return Math.max(0, Math.floor((nowMs - thenMs) / MS_PER_DAY));
}

function eventTimestamp(event) {
  return parseIsoDate(
    event?.date ||
      event?.published_at ||
      event?.publishedAt ||
      event?.announcement_date ||
      event?.event_date,
  );
}

function isMaterialEvent(event) {
  const type = String(event?.type || event?.category || "").toLowerCase();
  if (MATERIAL_EVENT_TYPES.has(type)) return true;
  const title = `${event?.title || event?.headline || ""} ${event?.summary || ""}`.toLowerCase();
  return DRILL_TITLE_HINTS.some((h) => title.includes(h));
}

function interceptGt(drill) {
  const length = Number(
    drill?.intercept_m ?? drill?.intercept_length_m ?? drill?.intercept_length ?? drill?.width_m ?? 0,
  );
  const grade = Number(drill?.grade ?? 0);
  if (!Number.isFinite(length) || length <= 0) return null;
  if (!Number.isFinite(grade) || grade <= 0) return null;
  return length * grade;
}

/**
 * Best length×grade intercept within `withinDays` of `nowMs`, or null.
 */
export function pickFreshIntercept(drills, { withinDays, nowMs = Date.now() } = {}) {
  if (!Array.isArray(drills) || drills.length === 0) return null;
  const cutoff = nowMs - withinDays * MS_PER_DAY;
  let best = null;
  let bestGt = -Infinity;
  for (const d of drills) {
    const gt = interceptGt(d);
    if (gt === null) continue;
    const drillMs = parseIsoDate(d.date);
    if (drillMs !== null && drillMs < cutoff) continue;
    if (gt > bestGt) {
      bestGt = gt;
      const length = Number(
        d.intercept_m ?? d.intercept_length_m ?? d.intercept_length ?? d.width_m ?? 0,
      );
      const grade = Number(d.grade ?? 0);
      best = {
        gt,
        lengthM: length,
        grade,
        holeId: d.hole_id ?? null,
        project: d.project ?? null,
        date: d.date ?? null,
        withinDays,
      };
    }
  }
  return best;
}

/** Best-ever intercept (mirrors matrix.js pickPrimaryIntercept semantics). */
export function pickStaleIntercept(drills) {
  if (!Array.isArray(drills) || drills.length === 0) return null;
  let best = null;
  let bestGt = -Infinity;
  for (const d of drills) {
    const gt = interceptGt(d);
    if (gt === null) continue;
    if (gt > bestGt) {
      bestGt = gt;
      const length = Number(
        d.intercept_m ?? d.intercept_length_m ?? d.intercept_length ?? d.width_m ?? 0,
      );
      const grade = Number(d.grade ?? 0);
      best = {
        gt,
        lengthM: length,
        grade,
        holeId: d.hole_id ?? null,
        project: d.project ?? null,
        date: d.date ?? null,
      };
    }
  }
  return best;
}

export function freshnessMultiplierFromAge(days, { halfLifeDays = 90, floor = 0.4 } = {}) {
  if (days === null || days === undefined) return floor;
  const d = Number(days);
  if (!Number.isFinite(d) || d < 0) return floor;
  if (d <= 30) return 1.0;
  const hl = Math.max(1, Number(halfLifeDays) || 90);
  const mult = Math.exp(-Math.LN2 * (d - 30) / hl);
  return Math.max(floor, Math.min(1, mult));
}

/**
 * @param {object} ctx - buildCompanyContext output
 * @param {object} [config] - timing-calibration fields
 */
export function computeSignalFreshness(ctx = {}, config = {}) {
  const nowMs = Date.now();
  const profile = ctx.profile || {};
  const drills =
    Array.isArray(ctx.drills) && ctx.drills.length > 0
      ? ctx.drills
      : Array.isArray(profile.drill_results)
        ? profile.drill_results
        : [];
  const events = Array.isArray(ctx.events) ? ctx.events : [];

  let lastDrillMs = null;
  for (const d of drills) {
    const t = parseIsoDate(d.date);
    if (t !== null && (lastDrillMs === null || t > lastDrillMs)) lastDrillMs = t;
  }

  let lastMaterialMs = lastDrillMs;
  for (const e of events) {
    if (!isMaterialEvent(e)) continue;
    const t = eventTimestamp(e);
    if (t !== null && (lastMaterialMs === null || t > lastMaterialMs)) lastMaterialMs = t;
  }

  const daysSinceLastDrillRelease = daysBetween(nowMs, lastDrillMs);
  const daysSinceLastMaterialEvent = daysBetween(nowMs, lastMaterialMs);

  const freshWindow = Number(config.freshInterceptWindowDays ?? 90);
  const fallbackWindow = Number(config.freshInterceptFallbackDays ?? 180);
  let freshIntercept = pickFreshIntercept(drills, { withinDays: freshWindow, nowMs });
  if (!freshIntercept) {
    freshIntercept = pickFreshIntercept(drills, { withinDays: fallbackWindow, nowMs });
    if (freshIntercept) freshIntercept.usedFallbackWindow = true;
  }
  const staleIntercept = pickStaleIntercept(drills);

  let freshnessGap = null;
  if (staleIntercept?.gt && freshIntercept?.gt && staleIntercept.gt > 0) {
    freshnessGap = (staleIntercept.gt - freshIntercept.gt) / staleIntercept.gt;
  } else if (staleIntercept?.gt && !freshIntercept?.gt) {
    freshnessGap = 1;
  }

  const ageForMultiplier =
    daysSinceLastMaterialEvent ?? daysSinceLastDrillRelease ?? 365;
  const freshnessMultiplier = freshnessMultiplierFromAge(ageForMultiplier, {
    halfLifeDays: config.recencyHalfLifeDays ?? 90,
    floor: config.freshnessMultiplierFloor ?? 0.4,
  });

  return {
    daysSinceLastDrillRelease,
    daysSinceLastMaterialEvent,
    freshIntercept,
    staleIntercept,
    freshnessGap,
    freshnessMultiplier,
    lastDrillDate: lastDrillMs ? new Date(lastDrillMs).toISOString().slice(0, 10) : null,
    lastMaterialEventDate: lastMaterialMs
      ? new Date(lastMaterialMs).toISOString().slice(0, 10)
      : null,
  };
}
