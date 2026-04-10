export const EVENT_KEYS = [
  "depositConfirmed",
  "redeemConfirmed",
  "reserveBelowTarget",
  "basketPaused",
  "openInterestNearCap",
  "oracleStale",
  "largeRealizedPnl",
  "riskConfigChanged",
];

export function defaultPreferences() {
  return {
    masterEnabled: true,
    digestEnabled: true,
    events: {
      depositConfirmed: true,
      redeemConfirmed: true,
      reserveBelowTarget: true,
      basketPaused: true,
      openInterestNearCap: true,
      oracleStale: true,
      largeRealizedPnl: true,
      riskConfigChanged: true,
    },
  };
}

export function normalizePreferences(input) {
  const defaults = defaultPreferences();
  if (!input || typeof input !== "object") return defaults;

  const merged = {
    masterEnabled: input.masterEnabled ?? defaults.masterEnabled,
    digestEnabled: input.digestEnabled ?? defaults.digestEnabled,
    events: {
      ...defaults.events,
      ...(input.events && typeof input.events === "object" ? input.events : {}),
    },
  };

  merged.masterEnabled = Boolean(merged.masterEnabled);
  merged.digestEnabled = Boolean(merged.digestEnabled);

  for (const key of EVENT_KEYS) {
    merged.events[key] = Boolean(merged.events[key]);
  }

  return merged;
}

export function isEventAllowed(preferences, eventKey) {
  const normalized = normalizePreferences(preferences);
  if (!normalized.masterEnabled) return false;
  if (!EVENT_KEYS.includes(eventKey)) return false;
  return Boolean(normalized.events[eventKey]);
}
