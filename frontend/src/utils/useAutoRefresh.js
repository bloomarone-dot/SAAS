import { useEffect } from "react";
import { shouldPreferLocalData } from "@/utils/network";

export function useAutoRefresh(callback, intervalMs, dependencies = []) {
  useEffect(() => {
    if (!intervalMs || intervalMs <= 0) return undefined;

    let cancelled = false;

    async function refresh() {
      if (cancelled || document.hidden || shouldPreferLocalData()) return;
      await callback();
    }

    const interval = window.setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, dependencies);
}
