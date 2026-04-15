const ANVIL_STORAGE_KEY = "indexflow:dev-anvil";

export function isAnvilEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ANVIL_STORAGE_KEY) === "1";
}

export function registerDevCommands(): void {
  if (typeof window === "undefined") return;

  Object.assign(window, {
    __enableAnvil() {
      localStorage.setItem(ANVIL_STORAGE_KEY, "1");
      console.log("[IndexFlow] Anvil enabled — reloading…");
      window.location.reload();
    },
    __disableAnvil() {
      localStorage.removeItem(ANVIL_STORAGE_KEY);
      console.log("[IndexFlow] Anvil disabled — reloading…");
      window.location.reload();
    },
  });
}
