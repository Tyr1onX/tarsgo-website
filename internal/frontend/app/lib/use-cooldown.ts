import { useCallback, useEffect, useState } from "react";

export function useCooldown() {
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (remainingSeconds <= 0) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setRemainingSeconds((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [remainingSeconds]);

  const start = useCallback((seconds: number) => {
    setRemainingSeconds(seconds);
  }, []);

  return {
    remainingSeconds,
    isCoolingDown: remainingSeconds > 0,
    start,
  };
}
