import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(QUERY).matches;
}

// The `reducedMotion` prop, when defined, wins over the media query.
export function useReducedMotion(override?: boolean): boolean {
  const media = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return override ?? media;
}
