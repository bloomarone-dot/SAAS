import { useEffect } from "react";

export function useAutoClearMessage(message, setMessage, delayMs = 4500) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = window.setTimeout(() => setMessage(""), delayMs);
    return () => window.clearTimeout(timer);
  }, [message, setMessage, delayMs]);
}
