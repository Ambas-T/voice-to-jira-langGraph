import { useState, useEffect, useCallback } from "react";
import type { Status } from "../types";

export function useStopwatch(status: Status) {
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const isRunning =
    startTime !== null &&
    status !== "idle" &&
    status !== "done" &&
    status !== "error";

  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime!) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, isRunning]);

  const start = useCallback(() => {
    const now = Date.now();
    setStartTime(now);
    setElapsedTime(0);
  }, []);

  const reset = useCallback(() => {
    setStartTime(null);
    setElapsedTime(0);
  }, []);

  const getDuration = useCallback((): number => {
    if (!startTime) return 0;
    return Math.floor((Date.now() - startTime) / 1000);
  }, [startTime]);

  const showStopwatch = startTime !== null && status !== "idle";

  return {
    startTime,
    elapsedTime,
    start,
    reset,
    getDuration,
    showStopwatch,
  };
}
