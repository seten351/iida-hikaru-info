"use client";

import { useSyncExternalStore } from "react";

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => {
    window.removeEventListener("hashchange", callback);
  };
}

export function usePublicHash() {
  return useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
}
