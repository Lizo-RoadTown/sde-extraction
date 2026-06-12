import { useSyncExternalStore } from "react";

// Preview mode — an explicit, opt-in dev toggle that shows clearly-labeled SAMPLE data so the
// filled UI is visible before any real extraction has run. Production default is OFF (real data
// only). Persisted in localStorage; components re-render when it flips.

const KEY = "sde.preview";
const listeners = new Set<() => void>();

export function isPreview(): boolean {
  return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
}

export function setPreview(on: boolean): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, on ? "1" : "0");
  listeners.forEach((l) => l());
}

export function usePreview(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    isPreview,
    () => false,
  );
}
