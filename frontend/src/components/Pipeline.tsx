import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import { Icon, IconBadge, type IconName } from "./ui";
import { TONE, jobTypeMeta, type Tone } from "../lib/meta";
import { formatDuration, formatSeconds, formatTime, shortId } from "../lib/format";
import type { LogEvent, PipelineState, Stage } from "../hooks/usePipeline";
import type { JobSummary, SystemInfo, WorkerSlot } from "../types/job";

const ACTIVE_MS = 1400;
const LINGER_MS = 3500;

function isActive(pulses: PipelineState["pulses"], stage: Stage, now: number) {
  const at = pulses[stage];
  return at != null && now - at < ACTIVE_MS;
}

function StageCard({
  step,
  title,
  where,
  icon,
  tone,
  active,
  children,
  innerRef,
  className = "",
}: {
  step?: number;
  title: string;
  where: string;
  icon: IconName;
  tone: Tone;
  active: boolean;
  children: ReactNode;
  innerRef?: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  return (
    <div
      ref={innerRef}
      className={`relative rounded-2xl bg-surface p-4 shadow-card ring-2 transition-all duration-500 ${
        active ? `${TONE[tone].ring} shadow-[0_8px_30px_-8px_currentColor] ${TONE[tone].text}` : "ring-transparent"
      } ${className}`}
    >
      <div className="flex items-start gap-3 text-label">
        <IconBadge icon={icon} tone={tone} solid={active} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-semibold leading-tight">
            {step != null && <span className="text-label-3 tabular">{step}.</span>}
            {title}
          </p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-label-2">{where}</p>
        </div>
      </div>
      <div className="mt-3 text-label">{children}</div>
    </div>
  );
}

function BigNumber({ value, caption, tone }: { value: number | string; caption: string; tone?: Tone }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className={`tabular text-[30px] font-bold leading-none tracking-tight ${tone ? TONE[tone].text : "text-label"}`}>{value}</span>
      <span className="text-[13px] text-label-2">{caption}</span>
    </div>
  );
}

function Connector({ active, tone = "blue" }: { active: boolean; tone?: Tone }) {
  return (
    <div className={`flex items-center justify-center py-1 lg:py-0 ${active ? TONE[tone].text : "text-label-3"} transition-colors duration-500`}>
      <svg viewBox="0 0 40 16" className="hidden h-4 w-10 lg:block" fill="none">
        <path d="M2 8h30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={active ? "flow-dash" : ""} />
        <path d="M28 3l6 5-6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <svg viewBox="0 0 16 32" className="h-6 w-4 lg:hidden" fill="none">
        <path d="M8 2v22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={active ? "flow-dash" : ""} />
        <path d="M3 20l5 6 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function JobChip({ jobType, id }: { jobType: string; id: string }) {
  const meta = jobTypeMeta(jobType);
  return (
    <Link
      to={`/jobs/${id}`}
      className={`rise-in inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${TONE[meta.tone].soft} ${TONE[meta.tone].text} hover:opacity-80`}
    >
      <Icon name={meta.icon} className="size-3" strokeWidth={2.6} />
      <span className="font-mono font-medium">{shortId(id)}</span>
    </Link>
  );
}

export function WorkerLane({ slot, now }: { slot: WorkerSlot; now: number }) {
  const running = slot.state === "RUNNING" && slot.jobId;
  const lingering = !running && slot.lastFinishedAt && now - new Date(slot.lastFinishedAt).getTime() < LINGER_MS;
  const meta = jobTypeMeta(running ? slot.jobType : slot.lastJobType);
  const ok = slot.lastOutcome === "COMPLETED";

  return (
    <div
      className={`rounded-xl p-3 transition-colors duration-300 ${
        running ? "bg-sys-blue/8" : lingering ? (ok ? "bg-sys-green/8" : "bg-sys-red/8") : "bg-fill/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-label">
          <span className={`size-2 rounded-full ${running ? "pulse-dot bg-sys-blue text-sys-blue" : "bg-sys-gray/60"}`} />
          Worker {slot.workerIndex + 1}
        </span>
        <span className="tabular text-[11.5px] text-label-2">{slot.processedCount} run{slot.processedCount === 1 ? "" : "s"}</span>
      </div>

      <div className="mt-2 flex min-h-[38px] items-center gap-2.5">
        {running ? (
          <>
            <IconBadge icon={meta.icon} tone={meta.tone} size="sm" />
            <div className="min-w-0 flex-1">
              <Link to={`/jobs/${slot.jobId}`} className="block truncate text-[13px] font-medium text-label hover:underline">
                {meta.title} <span className="font-mono text-label-2">{shortId(slot.jobId)}</span>
              </Link>
              <div className="mt-1 flex items-center gap-2">
                <div className="shimmer relative h-1 flex-1 overflow-hidden rounded-full bg-sys-blue/25">
                  <div className="absolute inset-0 bg-sys-blue/60" />
                </div>
                <span className="tabular text-[11px] text-label-2">
                  #{slot.attemptNumber} · {formatDuration(slot.startedAt ? now - new Date(slot.startedAt).getTime() : null)}
                </span>
              </div>
            </div>
          </>
        ) : lingering ? (
          <>
            <span className={`flex size-7 items-center justify-center rounded-full text-white ${ok ? "bg-sys-green" : "bg-sys-red"}`}>
              <Icon name={ok ? "check" : "xmark"} className="size-4" strokeWidth={2.8} />
            </span>
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="truncate font-medium text-label">
                {meta.title} <span className="font-mono text-label-2">{shortId(slot.lastJobId)}</span>
              </p>
              <p className={`text-[11.5px] ${ok ? "text-sys-green" : "text-sys-red"}`}>
                Attempt {slot.lastAttemptNumber} {ok ? "succeeded" : "failed"} in {formatDuration(slot.lastDurationMs)}
              </p>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-label-3">Idle — waiting on the queue</p>
        )}
      </div>
    </div>
  );
}

function RetryRow({ job, system, now }: { job: JobSummary; system: SystemInfo | null; now: number }) {
  const meta = jobTypeMeta(job.jobType);
  const due = job.nextRetryAt ? new Date(job.nextRetryAt).getTime() : now;
  const remaining = Math.max(0, due - now);
  const total = (system?.backoffScheduleSeconds[job.retryCount - 1] ?? remaining / 1000) * 1000 || 1;
  const progress = Math.min(1, Math.max(0, 1 - remaining / total));
  return (
    <Link to={`/jobs/${job.id}`} className="rise-in block rounded-lg px-1 py-1 hover:bg-fill/60">
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-label">
          <Icon name={meta.icon} className={`size-3.5 ${TONE[meta.tone].text}`} strokeWidth={2.4} />
          <span className="font-medium">{meta.title}</span>
          <span className="font-mono text-label-2">{shortId(job.id)}</span>
        </span>
        <span className="tabular shrink-0 font-semibold text-sys-orange">
          {remaining > 0 ? `#${job.retryCount + 1} in ${(remaining / 1000).toFixed(1)}s` : `#${job.retryCount + 1} due`}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-sys-orange/18">
        <div className="h-full rounded-full bg-sys-orange transition-[width] duration-300 ease-linear" style={{ width: `${progress * 100}%` }} />
      </div>
    </Link>
  );
}

/** Dashed, animated path from the retry stage back to the queue — the "retry loop". */
function RetryLoop({
  container,
  from,
  to,
  active,
}: {
  container: RefObject<HTMLDivElement | null>;
  from: RefObject<HTMLDivElement | null>;
  to: RefObject<HTMLDivElement | null>;
  active: boolean;
}) {
  const [geo, setGeo] = useState<{ d: string; w: number; h: number; lx: number; ly: number; arrow: string } | null>(null);

  // Passive effect, not layout: the container ref belongs to an ancestor, which React attaches
  // only after this child's layout effects have run.
  useEffect(() => {
    const measure = () => {
      const c = container.current?.getBoundingClientRect();
      const a = from.current?.getBoundingClientRect();
      const b = to.current?.getBoundingClientRect();
      if (!c || !a || !b) return;
      const side = a.left > b.right; // horizontal layout: retry card is to the right of the queue card
      if (side) {
        const x1 = a.left - c.left + a.width / 2;
        const y1 = a.bottom - c.top;
        const x2 = b.left - c.left + b.width / 2;
        const y2 = b.bottom - c.top;
        const yLow = Math.max(y1, y2) + 26;
        setGeo({
          d: `M${x1} ${y1 + 2} V${yLow - 10} Q${x1} ${yLow} ${x1 - 10} ${yLow} H${x2 + 10} Q${x2} ${yLow} ${x2} ${yLow - 10} V${y2 + 8}`,
          arrow: `M${x2 - 5} ${y2 + 14} L${x2} ${y2 + 6} L${x2 + 5} ${y2 + 14}`,
          w: c.width,
          h: yLow + 24,
          lx: (x1 + x2) / 2,
          ly: yLow + 16,
        });
      } else {
        // Stacked layout: loop up the right-hand gutter.
        const xr = c.width - 4;
        const y1 = a.top - c.top + a.height / 2;
        const y2 = b.top - c.top + b.height / 2;
        const ax = a.right - c.left;
        const bx = b.right - c.left;
        setGeo({
          d: `M${ax + 2} ${y1} H${xr - 10} Q${xr} ${y1} ${xr} ${y1 - 10} V${y2 + 10} Q${xr} ${y2} ${xr - 10} ${y2} H${bx + 8}`,
          arrow: `M${bx + 14} ${y2 - 5} L${bx + 6} ${y2} L${bx + 14} ${y2 + 5}`,
          w: c.width,
          h: c.height,
          lx: -1,
          ly: -1,
        });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    [container.current, from.current, to.current].forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [container, from, to]);

  if (!geo) return null;
  return (
    <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={geo.w} height={geo.h} fill="none">
      <path
        d={geo.d}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className={`${active ? "flow-dash text-sys-teal" : "text-sys-orange/50"} transition-colors duration-500`}
        strokeDasharray="4 5"
      />
      <path d={geo.arrow} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={active ? "text-sys-teal" : "text-sys-orange/60"} />
      {geo.lx >= 0 && (
        <text x={geo.lx} y={geo.ly} textAnchor="middle" className="fill-label-2 text-[11.5px] font-medium">
          ↺ Retry scanner re-queues the job once its backoff delay has passed
        </text>
      )}
    </svg>
  );
}

export function PipelineDiagram({ state, now }: { state: PipelineState; now: number }) {
  const { system, activity, stats, queued, retrying, events, pulses } = state;
  const containerRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<HTMLDivElement>(null);
  const recentCreated = events.filter((e) => e.stage === "api" && e.jobId && e.jobType).slice(0, 4);
  const scanAgo = activity?.lastRetryScanAt ? (now - new Date(activity.lastRetryScanAt).getTime()) / 1000 : null;
  const workers = activity?.workers ?? [];
  const busy = workers.filter((w) => w.state === "RUNNING").length;

  return (
    <div ref={containerRef} className="relative pb-10 pr-5 lg:pr-0">
      <div className="grid grid-cols-1 items-stretch lg:grid-cols-[minmax(0,0.9fr)_40px_minmax(0,1fr)_40px_minmax(0,1.5fr)_40px_minmax(0,1.25fr)]">
        <StageCard step={1} title="Submit" where="JobsController · POST /api/jobs" icon="arrowDown" tone="blue" active={isActive(pulses, "api", now)}>
          <BigNumber value={stats?.total ?? "–"} caption="jobs received" />
          <p className="mt-2 text-[12.5px] leading-snug text-label-2">Validated, saved to SQLite as QUEUED, then handed to the queue.</p>
          {recentCreated.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {recentCreated.map((e) => (
                <JobChip key={e.id} jobType={e.jobType!} id={e.jobId!} />
              ))}
            </div>
          )}
        </StageCard>

        <Connector active={isActive(pulses, "queue", now)} />

        <StageCard
          step={2}
          title="Queue"
          where="BackgroundJobQueue · Channel<Guid>"
          icon="tray"
          tone="teal"
          active={isActive(pulses, "queue", now)}
          innerRef={queueRef}
        >
          <BigNumber value={activity?.queueDepth ?? "–"} caption="waiting for a worker" />
          <p className="mt-2 text-[12.5px] leading-snug text-label-2">In-memory, thread-safe. Tracks in-flight IDs so a job is never queued twice.</p>
          <div className="mt-2.5 flex flex-wrap gap-1">
            {queued.slice(0, 6).map((j) => (
              <JobChip key={j.id} jobType={j.jobType} id={j.id} />
            ))}
            {queued.length > 6 && <span className="text-[11.5px] text-label-2">+{queued.length - 6} more</span>}
          </div>
        </StageCard>

        <Connector active={isActive(pulses, "workers", now)} tone="indigo" />

        <StageCard
          step={3}
          title="Worker pool"
          where={`JobWorker · ${system?.workerCount ?? 3} concurrent consumers`}
          icon="cpu"
          tone="indigo"
          active={busy > 0 || isActive(pulses, "workers", now)}
        >
          <div className="mb-2 flex items-baseline justify-between">
            <BigNumber value={`${busy}/${workers.length || system?.workerCount || 3}`} caption="busy" tone={busy ? "indigo" : undefined} />
          </div>
          <div className="space-y-2">
            {workers.map((w) => (
              <WorkerLane key={w.workerIndex} slot={w} now={now} />
            ))}
          </div>
        </StageCard>

        <Connector active={isActive(pulses, "done", now) || isActive(pulses, "retry", now) || isActive(pulses, "dead", now)} tone="green" />

        <div className="flex flex-col gap-3">
          <StageCard step={4} title="Completed" where="JobService.RecordSuccessAsync" icon="check" tone="green" active={isActive(pulses, "done", now)}>
            <BigNumber value={stats?.completed ?? "–"} caption="succeeded" tone="green" />
          </StageCard>
          <StageCard title="Dead letter" where="DeadLetterJobs table" icon="archive" tone="red" active={isActive(pulses, "dead", now)}>
            <div className="flex items-center justify-between">
              <BigNumber value={stats?.deadLetter ?? "–"} caption="gave up" tone={stats?.deadLetter ? "red" : undefined} />
              <Link to="/dead-letters" className="text-[13px] font-medium text-sys-blue hover:opacity-70">
                Inspect
              </Link>
            </div>
          </StageCard>
          <StageCard
            title="Retry scheduled"
            where="RetryPolicy + RetryScannerService"
            icon="retry"
            tone="orange"
            active={isActive(pulses, "retry", now)}
            innerRef={retryRef}
          >
            <BigNumber value={stats?.retrying ?? "–"} caption="backing off" tone={stats?.retrying ? "orange" : undefined} />
            {retrying.length > 0 && (
              <div className="mt-2 space-y-1">
                {retrying.slice(0, 4).map((j) => (
                  <RetryRow key={j.id} job={j} system={system} now={now} />
                ))}
              </div>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-label-2">
              <span className={`size-1.5 rounded-full bg-sys-teal ${scanAgo != null && scanAgo < 1.2 ? "opacity-100" : "opacity-40"} transition-opacity`} />
              Scans every {system?.retryScanIntervalSeconds ?? 1}s{scanAgo != null ? ` · last ${scanAgo.toFixed(1)}s ago` : ""}
            </p>
          </StageCard>
        </div>
      </div>

      <RetryLoop container={containerRef} from={retryRef} to={queueRef} active={isActive(pulses, "retry", now)} />
    </div>
  );
}

export function ActivityLog({ events, now }: { events: LogEvent[]; now: number }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-12 text-center">
        <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-fill text-label-3">
          <Icon name="antenna" className="size-6" strokeWidth={1.8} />
        </div>
        <p className="text-[15px] font-semibold text-label">Listening for events</p>
        <p className="mt-1 max-w-xs text-[13px] text-label-2">Press “Run demo” or create a job — every step the backend takes will show up here as it happens.</p>
      </div>
    );
  }
  return (
    <ol className="max-h-[520px] overflow-y-auto">
      {events.map((e) => {
        const fresh = now - e.at < 1500;
        const body = (
          <div className={`flex gap-3 py-2.5 pr-4 transition-colors duration-700 ${fresh ? "bg-sys-blue/5" : ""}`}>
            <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${TONE[e.tone].soft} ${TONE[e.tone].text}`}>
              <Icon name={e.icon} className="size-3.5" strokeWidth={2.6} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13.5px] font-medium leading-snug text-label">{e.title}</p>
                <span className="tabular shrink-0 text-[11.5px] text-label-3">{formatTime(e.at)}</span>
              </div>
              {e.detail && <p className="mt-0.5 text-[12.5px] leading-snug text-label-2">{e.detail}</p>}
            </div>
          </div>
        );
        return (
          <li key={e.id} className="rise-in border-b border-separator pl-4 last:border-b-0">
            {e.jobId ? (
              <Link to={`/jobs/${e.jobId}`} className="block hover:opacity-80">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function BackoffChart({ system }: { system: SystemInfo }) {
  const schedule = system.backoffScheduleSeconds;
  const max = Math.max(...schedule, 1);
  return (
    <div className="p-4">
      <p className="rounded-lg bg-fill/70 px-3 py-2 text-center font-mono text-[12.5px] text-label">
        delay = {system.initialDelaySeconds}s × {system.backoffMultiplier}
        <sup>(n−1)</sup>, capped at {system.maxDelaySeconds}s
      </p>
      <div className="mt-4 space-y-2">
        {schedule.map((s, i) => (
          <div key={i} className="flex items-center gap-3 text-[12.5px]">
            <span className="w-24 shrink-0 text-label-2">
              After fail {i + 1}
            </span>
            <div className="h-5 flex-1 overflow-hidden rounded-md bg-fill/60">
              <div
                className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-sys-orange/70 to-sys-orange pr-2 text-[11px] font-semibold text-white"
                style={{ width: `${Math.max(12, (s / max) * 100)}%` }}
              >
                {formatSeconds(s)}
              </div>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3 text-[12.5px]">
          <span className="w-24 shrink-0 text-label-2">After fail {schedule.length + 1}</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-sys-red/12 px-2 py-0.5 font-semibold text-sys-red">
            <Icon name="archive" className="size-3.5" strokeWidth={2.4} /> Dead letter
          </span>
        </div>
      </div>
      <p className="mt-3 text-[12px] text-label-2">
        {system.defaultMaxRetries} attempts max by default (overridable per job) · jitter {system.useJitter ? "on (±20%)" : "off"}
      </p>
    </div>
  );
}

export const HOW_IT_WORKS: { icon: IconName; tone: Tone; title: string; body: string; file: string }[] = [
  {
    icon: "arrowDown",
    tone: "blue",
    title: "Submit",
    body: "The API validates the request, writes the job to SQLite with status QUEUED, and pushes its ID onto the queue. Saving first means nothing is lost if the app crashes.",
    file: "Controllers/JobsController.cs → Services/JobService.cs",
  },
  {
    icon: "tray",
    tone: "gray",
    title: "Queue",
    body: "An in-memory System.Threading.Channels queue. It also tracks which job IDs are already queued or running, so the same job can never be handed out twice.",
    file: "Queue/BackgroundJobQueue.cs",
  },
  {
    icon: "cpu",
    tone: "indigo",
    title: "Workers",
    body: "A hosted BackgroundService runs 3 worker loops that compete for jobs. A worker first claims the job in the database (QUEUED → PROCESSING), then runs its handler.",
    file: "Workers/JobWorker.cs",
  },
  {
    icon: "check",
    tone: "green",
    title: "Success",
    body: "The attempt is recorded with its duration and the job becomes COMPLETED. Every attempt, successful or not, is stored for the history view.",
    file: "Services/JobService.cs · RecordSuccessAsync",
  },
  {
    icon: "retry",
    tone: "orange",
    title: "Failure → exponential backoff",
    body: "On an exception the attempt is recorded with its error. If attempts remain, the job becomes RETRYING with NextRetryAt = now + 2s, 4s, 8s… It is NOT re-queued immediately.",
    file: "Services/RetryPolicy.cs · JobService.RecordFailureAsync",
  },
  {
    icon: "clock",
    tone: "teal",
    title: "Retry scanner",
    body: "A second background service checks every second for RETRYING jobs whose delay has passed and puts them back on the queue. On startup it also recovers jobs interrupted by a crash.",
    file: "Workers/RetryScannerService.cs",
  },
  {
    icon: "archive",
    tone: "red",
    title: "Dead letter",
    body: "When the last allowed attempt fails, the job becomes DEAD_LETTER and a copy goes to a separate table, so it can be inspected or requeued as a fresh job.",
    file: "Models/DeadLetterJob.cs · DeadLettersController.cs",
  },
  {
    icon: "antenna",
    tone: "purple",
    title: "Live updates",
    body: "Every state change is broadcast over a SignalR WebSocket, which is what drives this page. If the socket drops, every page falls back to polling every 5 seconds.",
    file: "Hubs/JobsHub.cs · Services/JobEventNotifier.cs",
  },
];
