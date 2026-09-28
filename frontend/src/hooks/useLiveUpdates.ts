import { useEffect, useRef, useState } from "react";
import { ensureJobsHubStarted, getJobsHubConnection } from "../services/signalr";
import type { JobSummaryEvent, WorkersSnapshot } from "../types/job";

interface Options {
  onJobChanged?: (evt: JobSummaryEvent) => void;
  onStatsChanged?: () => void;
  onWorkersChanged?: (snapshot: WorkersSnapshot) => void;
  /** Fallback re-fetch on a timer in case the SignalR connection is down. Set to 0 to disable. */
  pollMs?: number;
  onPoll?: () => void;
}

/**
 * Subscribes a page to real-time job/stat/worker updates over the shared SignalR
 * connection, with a polling fallback so the UI stays correct if the socket never connects.
 */
export function useLiveUpdates({ onJobChanged, onStatsChanged, onWorkersChanged, pollMs = 5000, onPoll }: Options) {
  const onJobChangedRef = useRef(onJobChanged);
  const onStatsChangedRef = useRef(onStatsChanged);
  const onWorkersChangedRef = useRef(onWorkersChanged);
  const onPollRef = useRef(onPoll);
  onJobChangedRef.current = onJobChanged;
  onStatsChangedRef.current = onStatsChanged;
  onWorkersChangedRef.current = onWorkersChanged;
  onPollRef.current = onPoll;

  useEffect(() => {
    const connection = getJobsHubConnection();

    const jobHandler = (evt: JobSummaryEvent) => onJobChangedRef.current?.(evt);
    const statsHandler = () => onStatsChangedRef.current?.();
    const workersHandler = (snap: WorkersSnapshot) => onWorkersChangedRef.current?.(snap);

    connection.on("jobChanged", jobHandler);
    connection.on("statsChanged", statsHandler);
    connection.on("workersChanged", workersHandler);

    ensureJobsHubStarted().catch(() => {});

    return () => {
      connection.off("jobChanged", jobHandler);
      connection.off("statsChanged", statsHandler);
      connection.off("workersChanged", workersHandler);
    };
  }, []);

  useEffect(() => {
    if (!pollMs) return;
    const interval = setInterval(() => onPollRef.current?.(), pollMs);
    return () => clearInterval(interval);
  }, [pollMs]);
}

/** Re-renders on an interval so countdowns and elapsed timers tick. */
export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
