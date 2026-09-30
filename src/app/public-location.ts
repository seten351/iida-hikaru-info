"use client";

import { useSyncExternalStore } from "react";

const tabChangeEvent = "home-highlight-tab-change";

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  window.addEventListener(tabChangeEvent, callback);
  return () => {
    window.removeEventListener("hashchange", callback);
    window.removeEventListener(tabChangeEvent, callback);
  };
}

export function usePublicHash() {
  return useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
}

export function replacePublicHash(hash: string) {
  window.history.replaceState(window.history.state, "", hash);
  window.dispatchEvent(new Event(tabChangeEvent));
}

function subscribeMobile(callback: () => void) {
  const media = window.matchMedia("(max-width: 640px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export function useMobileHighlights() {
  return useSyncExternalStore(subscribeMobile, () => window.matchMedia("(max-width: 640px)").matches, () => false);
}
