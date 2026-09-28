import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { useLiveUpdates } from "./useLiveUpdates";
import { jobTypeMeta, type Tone } from "../lib/meta";
import { shortId } from "../lib/format";
import type { IconName } from "../components/ui/Icon";
import type { JobSummary, JobSummaryEvent, Stats, SystemInfo, WorkersSnapshot } from "../types/job";

export type Stage = "api" | "queue" | "workers" | "done" | "retry" | "dead";

export interface LogEvent {
  id: number;
  at: number;
  stage: Stage;
  tone: Tone;
  icon: IconName;
  title: string;
  detail?: string;
  jobId?: string;
  jobType?: string;
}

let nextEventId = 1;

function label(jobType: string | null | undefined, id: string | null | undefined) {
  return `${jobTypeMeta(jobType).title} ${shortId(id)}`;
}

/**
 * Everything the live pipeline view needs: static config from /api/system, worker activity
 * pushed over SignalR, list snapshots for the queue and retry stages, and a human-readable
 * activity log derived from the event stream.
 */
export function usePipeline() {
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [activity, setActivity] = useState<WorkersSnapshot | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [queued, setQueued] = useState<JobSummary[]>([]);
  const [retrying, setRetrying] = useState<JobSummary[]>([]);
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [pulses, setPulses] = useState<Partial<Record<Stage, number>>>({});
  const [error, setError] = useState<string | null>(null);
  const prevActivity = useRef<WorkersSnapshot | null>(null);
  const refreshTimer = useRef<number | null>(null);

  const pulse = useCallback((...stages: Stage[]) => {
    const at = Date.now();
    setPulses((p) => ({ ...p, ...Object.fromEntries(stages.map((s) => [s, at])) }));
  }, []);

  const log = useCallback((e: Omit<LogEvent, "id" | "at">) => {
    setEvents((prev) => [{ ...e, id: nextEventId++, at: Date.now() }, ...prev].slice(0, 80));
  }, []);

  const refreshLists = useCallback(async () => {
    try {
      const [s, q, r] = await Promise.all([
        api.getStats(),
        api.listJobs({ status: "QUEUED", pageSize: 12 }),
        api.listJobs({ status: "RETRYING", pageSize: 12 }),
      ]);
      setStats(s);
      setQueued(q.items);
      setRetrying(r.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backend unreachable");
    }
  }, []);

  // Job events arrive in bursts; coalesce list refreshes.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current != null) return;
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      refreshLists();
    }, 120);
  }, [refreshLists]);

  const refreshAll = useCallback(async () => {
    try {
      const sys = await api.getSystem();
      setSystem(sys);
      setActivity(sys.activity);
      prevActivity.current = sys.activity;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backend unreachable");
    }
    await refreshLists();
  }, [refreshLists]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const onJobChanged = useCallback(
    (evt: JobSummaryEvent) => {
      scheduleRefresh();
      const name = label(evt.jobType, evt.id);
      if (evt.eventType === "Created") {
        pulse("api", "queue");
        log({ stage: "api", tone: "blue", icon: "arrowDown", title: `${name} submitted`, detail: "Saved to SQLite as QUEUED, then pushed onto the in-memory Channel.", jobId: evt.id, jobType: evt.jobType });
        return;
      }
      switch (evt.status) {
        case "COMPLETED":
          pulse("done");
          log({ stage: "done", tone: "green", icon: "check", title: `${name} completed`, detail: `Succeeded on attempt ${evt.retryCount + 1}.`, jobId: evt.id });
          break;
        case "RETRYING": {
          pulse("retry");
          const secs = evt.nextRetryAt ? Math.max(0, (new Date(evt.nextRetryAt).getTime() - Date.now()) / 1000) : 0;
          log({
            stage: "retry",
            tone: "orange",
            icon: "retry",
            title: `${name} attempt ${evt.retryCount} failed — retry in ${secs.toFixed(1)}s`,
            detail: evt.lastError ?? undefined,
            jobId: evt.id,
          });
          break;
        }
        case "DEAD_LETTER":
          pulse("dead");
          log({
            stage: "dead",
            tone: "red",
            icon: "archive",
            title: `${name} moved to dead letters`,
            detail: `All ${evt.maxRetries} attempts failed. Copied to the DeadLetterJobs table for inspection or requeue.`,
            jobId: evt.id,
          });
          break;
        case "CANCELLED":
          log({ stage: "queue", tone: "gray", icon: "stop", title: `${name} cancelled`, detail: "Removed before a worker ran it.", jobId: evt.id });
          break;
      }
    },
    [log, pulse, scheduleRefresh],
  );

  const onWorkersChanged = useCallback(
    (snap: WorkersSnapshot) => {
      const prev = prevActivity.current;
      snap.workers.forEach((w) => {
        const before = prev?.workers[w.workerIndex];
        if (w.state === "RUNNING" && w.jobId && before?.jobId !== w.jobId) {
          pulse("queue", "workers");
          log({
            stage: "workers",
            tone: "indigo",
            icon: "cpu",
            title: `Worker ${w.workerIndex + 1} picked up ${label(w.jobType, w.jobId)}`,
            detail: `Attempt ${w.attemptNumber}. Claimed in the database (QUEUED → PROCESSING) so no other worker can take it.`,
            jobId: w.jobId,
          });
        }
      });
      if (snap.lastRetryEnqueueAt && snap.lastRetryEnqueueAt !== prev?.lastRetryEnqueueAt) {
        pulse("retry", "queue");
        log({
          stage: "retry",
          tone: "teal",
          icon: "retry",
          title: `Retry scanner re-queued ${snap.lastRetryScanEnqueued} job${snap.lastRetryScanEnqueued === 1 ? "" : "s"}`,
          detail: "Their backoff delay elapsed, so they go back on the queue for another attempt.",
        });
      }
      prevActivity.current = snap;
      setActivity(snap);
    },
    [log, pulse],
  );

  useLiveUpdates({
    onJobChanged,
    onStatsChanged: scheduleRefresh,
    onWorkersChanged,
    onPoll: refreshAll,
  });

  return { system, activity, stats, queued, retrying, events, pulses, error, clearEvents: () => setEvents([]) };
}

export type PipelineState = ReturnType<typeof usePipeline>;
