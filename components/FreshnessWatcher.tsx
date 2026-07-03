"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps a long-open tab current. The page is statically built with the data
 * baked in, so a browser that cached an older build won't show new results until
 * it reloads. This polls a tiny no-store marker (regenerated on every deploy)
 * and reloads once, automatically, when the data has changed — no hard refresh.
 */
export default function FreshnessWatcher({
  asOf,
  played,
}: {
  asOf: string;
  played: number;
}) {
  const reloaded = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (reloaded.current || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/version.json", { cache: "no-store" });
        if (!res.ok) return;
        const v = (await res.json()) as { asOf?: string; played?: number };
        if (cancelled) return;
        const changed =
          (v.asOf && v.asOf !== asOf) ||
          (typeof v.played === "number" && v.played !== played);
        if (changed) {
          reloaded.current = true;
          location.reload();
        }
      } catch {
        // offline / transient — try again next tick
      }
    };

    const id = setInterval(check, 5 * 60 * 1000); // every 5 minutes
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [asOf, played]);

  return null;
}
