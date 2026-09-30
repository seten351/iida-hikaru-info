"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const DeadlineClock = createContext<string | null>(null);

/** A shared server-seeded clock keeps every deadline badge in sync. */
export function DeadlineClockProvider({ now, children }: { now: string; children: ReactNode }) {
  const [currentTime, setCurrentTime] = useState(now);
  useEffect(() => {
    const serverBase = Date.parse(now);
    const monotonicBase = performance.now();
    const wallBase = Date.now();
    // Preserve server time even when the visitor's clock is in another timezone or skewed.
    // The wall-clock delta also accounts for sleep on platforms that pause performance.now().
    const update = () => setCurrentTime(new Date(serverBase + Math.max(performance.now() - monotonicBase, Date.now() - wallBase)).toISOString());
    const onVisibility = () => { if (document.visibilityState === "visible") update(); };
    update();
    const interval = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [now]);
  return <DeadlineClock.Provider value={currentTime}>{children}</DeadlineClock.Provider>;
}

export function useDeadlineNow(fallback: string) {
  return new Date(useContext(DeadlineClock) ?? fallback);
}
