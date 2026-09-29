import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useLiveUpdates, useNow } from "../hooks/useLiveUpdates";
import { Button, Icon, PageHeader, SegmentedControl, Spinner, type IconName } from "../components/ui";
import { useToast } from "../components/Toast";
import { TONE, type Tone } from "../lib/meta";
import { errorMessage, formatDuration, shortId } from "../lib/format";
import type { JobStatusWire, WorkersSnapshot } from "../types/job";

type Mode = "normal" | "hiccup" | "outage";

interface StepDef {
  key: string;
  title: string;
  detail: string;
  icon: IconName;
  tone: Tone;
  critical: boolean;
  failText: string;
  job: { jobType: string; payload?: Record<string, unknown>; maxRetries?: number };
}

type StepStatus = "waiting" | "queued" | "running" | "retrying" | "done" | "failed" | "skipped";

interface StepState {
  status: StepStatus;
  jobId?: string;
  failures: number;
  maxAttempts: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  worker?: number | null;
  startedAt?: number;
  finishedAt?: number;
}

const MODES: { value: Mode; label: string; blurb: string }[] = [
  { value: "normal", label: "Normal day", blurb: "Everything works. The bank blips once and the system quietly retries." },
  { value: "hiccup", label: "Bank hiccup", blurb: "The bank's server times out twice. Watch the system wait 2s, then 4s, and recover on its own." },
  { value: "outage", label: "Bank outage", blurb: "The bank is down. After 3 attempts the payment fails safely: it's set aside and the money is refunded automatically." },
];

function stepsFor(mode: Mode): StepDef[] {
  const bankJob =
    mode === "outage"
      ? { jobType: "AlwaysFailJob", maxRetries: 3 }
      : { jobType: "FlakyJob", payload: { failuresBeforeSuccess: mode === "hiccup" ? 2 : 1 } };
  return [
    {
      key: "validate",
      title: "Validate UPI request",
      detail: "Check the UPI PIN, the payer's VPA and the amount.",
      icon: "lock",
      tone: "blue",
      critical: true,
      failText: "Request could not be validated",
      job: { jobType: "SuccessfulJob" },
    },
    {
      key: "fraud",
      title: "Fraud & risk check",
      detail: "Score the transaction against fraud rules. Slow work, so it runs off the request path.",
      icon: "shield",
      tone: "purple",
      critical: true,
      failText: "Risk engine unavailable",
      job: { jobType: "DelayedJob", payload: { delaySeconds: 3 } },
    },
    {
      key: "bank",
      title: "Transfer via bank (NPCI)",
      detail: "Debit the payer's bank and send the money through the UPI network.",
      icon: "bank",
      tone: "indigo",
      critical: true,
      failText: "Bank server did not respond (timeout)",
      job: bankJob,
    },
    {
      key: "merchant",
      title: "Credit merchant & update ledger",
      detail: "Record the payment in the merchant's account and the transaction ledger.",
      icon: "store",
      tone: "teal",
      critical: true,
      failText: "Ledger write failed",
      job: { jobType: "SuccessfulJob" },
    },
    {
      key: "receipt",
      title: "Send receipt SMS",
      detail: "Text the customer a receipt. Nice to have: if it fails, the payment still stands.",
      icon: "message",
      tone: "green",
      critical: false,
      failText: "SMS gateway busy",
      job: { jobType: "RandomFailureJob", payload: { failureRate: mode === "hiccup" ? 0.5 : 0.25 } },
    },
  ];
}

const REFUND: StepDef = {
  key: "refund",
  title: "Refund payer & alert support",
  detail: "Compensating action: return the money and open a support ticket for the dead-lettered payment.",
  icon: "retry",
  tone: "orange",
  critical: false,
  failText: "Refund failed",
  job: { jobType: "SuccessfulJob" },
};

const initialState = (): StepState => ({ status: "waiting", failures: 0, maxAttempts: 0 });

function wireToStatus(s: JobStatusWire): StepStatus | null {
  switch (s) {
    case "QUEUED":
      return "queued";
    case "PROCESSING":
      return "running";
    case "RETRYING":
    case "FAILED":
      return "retrying";
    case "COMPLETED":
      return "done";
    case "DEAD_LETTER":
    case "CANCELLED":
      return "failed";
    default:
      return null;
  }
}

const ACTIVE: StepStatus[] = ["queued", "running", "retrying"];

export function RealWorldPage() {
  const [mode, setMode] = useState<Mode>("hiccup");
  const [defs, setDefs] = useState<StepDef[]>(() => stepsFor("hiccup"));
  const [steps, setSteps] = useState<StepState[]>(() => stepsFor("hiccup").map(initialState));
  const [run, setRun] = useState<{ startedAt: number; apiMs: number | null; endedAt?: number } | null>(null);
  const jobIndex = useRef(new Map<string, number>());
  const handled = useRef(new Set<number>());
  const now = useNow(100);
  const { showToast } = useToast();

  const submit = useCallback(
    async (i: number, def: StepDef, measure = false) => {
      const t0 = performance.now();
      try {
        const job = await api.createJob(def.job);
        const apiMs = Math.round(performance.now() - t0);
        jobIndex.current.set(job.id, i);
        if (measure) setRun((r) => (r ? { ...r, apiMs } : r));
        setSteps((prev) =>
          prev.map((s, j) =>
            // A fast job's events can arrive before this response; don't overwrite a later status.
            j === i && s.status === "waiting" ? { ...s, status: "queued", jobId: job.id, maxAttempts: job.maxRetries, startedAt: Date.now() } : j === i ? { ...s, jobId: job.id, maxAttempts: job.maxRetries } : s,
          ),
        );
      } catch (e) {
        showToast(errorMessage(e, "Could not reach the backend"), "error");
        setRun(null);
      }
    },
    [showToast],
  );

  const reset = (m: Mode = mode) => {
    const d = stepsFor(m);
    setDefs(d);
    setSteps(d.map(initialState));
    setRun(null);
    jobIndex.current.clear();
    handled.current.clear();
  };

  const pay = () => {
    const d = stepsFor(mode);
    setDefs(d);
    setSteps(d.map(initialState));
    jobIndex.current.clear();
    handled.current.clear();
    setRun({ startedAt: Date.now(), apiMs: null });
    submit(0, d[0], true);
  };

  const applyStatus = useCallback(
    (id: string, status: JobStatusWire, retryCount: number, nextRetryAt: string | null, lastError: string | null) => {
      const i = jobIndex.current.get(id);
      if (i == null) return;
      const mapped = wireToStatus(status);
      if (!mapped) return;
      setSteps((prev) =>
        prev.map((s, j) => {
          if (j !== i || s.status === "done" || s.status === "failed") return s;
          return {
            ...s,
            status: mapped,
            failures: retryCount,
            nextRetryAt,
            lastError: lastError ?? s.lastError,
            jobId: id,
            finishedAt: mapped === "done" || mapped === "failed" ? Date.now() : s.finishedAt,
          };
        }),
      );
    },
    [],
  );

  const onWorkersChanged = useCallback((snap: WorkersSnapshot) => {
    snap.workers.forEach((w) => {
      if (w.state !== "RUNNING" || !w.jobId) return;
      const i = jobIndex.current.get(w.jobId);
      if (i == null) return;
      setSteps((prev) =>
        prev.map((s, j) => (j === i && s.status !== "done" && s.status !== "failed" ? { ...s, status: "running", worker: w.workerIndex } : s)),
      );
    });
  }, []);

  // Fallback in case a SignalR event is missed.
  const poll = useCallback(async () => {
    const active = steps.map((s, i) => ({ s, i })).filter(({ s }) => s.jobId && ACTIVE.includes(s.status));
    for (const { s } of active) {
      try {
        const job = await api.getJob(s.jobId!);
        applyStatus(job.id, job.status, job.retryCount, job.nextRetryAt, job.lastError);
      } catch {
        // ignore, next tick retries
      }
    }
  }, [steps, applyStatus]);

  useLiveUpdates({
    onJobChanged: (e) => applyStatus(e.id, e.status, e.retryCount, e.nextRetryAt, e.lastError),
    onWorkersChanged,
    onPoll: poll,
    pollMs: run && !run.endedAt ? 1500 : 0,
  });

  // Orchestrator: run steps in order, and compensate (refund) if a critical step fails for good.
  useEffect(() => {
    if (!run || run.endedAt) return;
    steps.forEach((s, i) => {
      if (handled.current.has(i) || (s.status !== "done" && s.status !== "failed")) return;
      handled.current.add(i);
      const def = defs[i];
      const next = i + 1;
      if (def.key === "refund") {
        setRun((r) => (r ? { ...r, endedAt: Date.now() } : r));
        return;
      }
      if (s.status === "failed" && def.critical) {
        setSteps((prev) => [...prev.map((p, j) => (j > i ? { ...p, status: "skipped" as StepStatus } : p)), { ...initialState() }]);
        setDefs((prev) => [...prev, REFUND]);
        submit(defs.length, REFUND);
        return;
      }
      if (next < defs.length) submit(next, defs[next]);
      else setRun((r) => (r ? { ...r, endedAt: Date.now() } : r));
    });
  }, [steps, defs, run, submit]);

  const bankIdx = defs.findIndex((d) => d.key === "bank");
  const refundIdx = defs.findIndex((d) => d.key === "refund");
  const phase: "idle" | "running" | "success" | "failed" = !run
    ? "idle"
    : !run.endedAt
      ? "running"
      : refundIdx >= 0 || steps[bankIdx]?.status === "failed"
        ? "failed"
        : "success";
  const elapsed = run ? (run.endedAt ?? now) - run.startedAt : 0;
  const totalAttempts = steps.reduce((n, s) => n + (s.status === "done" ? s.failures + 1 : s.failures), 0);
  const totalRetries = steps.reduce((n, s) => n + (s.status === "done" ? s.failures : Math.max(0, s.failures - (s.status === "failed" ? 1 : 0))), 0);
  const receipt = steps[defs.findIndex((d) => d.key === "receipt")];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sys-orange/14 px-2.5 py-1 text-[12px] font-semibold text-sys-orange">
            <Icon name="sparkles" className="size-3.5" strokeWidth={2.4} />
            Real-world scenario
          </span>
        }
        title="UPI Payment"
        subtitle="The customer taps Pay and gets an answer instantly. Behind the scenes, five background jobs move the money: each one queued, run by a worker, and retried when the bank misbehaves."
      />

      <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-surface p-4 shadow-card">
        <SegmentedControl
          options={MODES.map((m) => ({ value: m.value, label: m.label }))}
          value={mode}
          onChange={(m) => {
            setMode(m);
            if (!run || run.endedAt) reset(m);
          }}
        />
        <p className="min-w-[16rem] flex-1 text-[13.5px] leading-snug text-label-2">{MODES.find((m) => m.value === mode)!.blurb}</p>
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-8">
          <Phone
            phase={phase}
            steps={steps}
            defs={defs}
            elapsed={elapsed}
            apiMs={run?.apiMs ?? null}
            receiptFailed={receipt?.status === "failed"}
            refundDone={refundIdx >= 0 && steps[refundIdx]?.status === "done"}
            onPay={pay}
            onDone={() => reset()}
          />
        </div>

        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[22px] font-bold tracking-tight text-label">Behind the scenes</h2>
              <p className="text-[14px] text-label-2">Each step is a real job on the backend, run in order.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Metric icon="timer" label="Elapsed" value={run ? formatDuration(elapsed) : "—"} />
              <Metric icon="bolt" label="API reply" value={run?.apiMs != null ? `${run.apiMs} ms` : "—"} tone="blue" />
              <Metric icon="gear" label="Attempts" value={run ? String(totalAttempts) : "—"} />
              <Metric icon="retry" label="Retries" value={run ? String(totalRetries) : "—"} tone={totalRetries ? "orange" : undefined} />
            </div>
          </div>

          <ol className="relative">
            {defs.map((def, i) => (
              <StepRow key={def.key} def={def} state={steps[i]} index={i} last={i === defs.length - 1} now={now} />
            ))}
          </ol>
        </div>
      </div>

      <Takeaways phase={phase} run={run} steps={steps} defs={defs} />
    </div>
  );
}

function Metric({ icon, label, value, tone }: { icon: IconName; label: string; value: string; tone?: Tone }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 shadow-card">
      <Icon name={icon} className={`size-4 ${tone ? TONE[tone].text : "text-label-2"}`} strokeWidth={2.2} />
      <div className="leading-tight">
        <p className="text-[10.5px] font-medium uppercase tracking-wide text-label-2">{label}</p>
        <p className={`tabular text-[15px] font-semibold ${tone ? TONE[tone].text : "text-label"}`}>{value}</p>
      </div>
    </div>
  );
}

const STATUS_UI: Record<StepStatus, { label: string; tone: Tone }> = {
  waiting: { label: "Waiting", tone: "gray" },
  queued: { label: "In queue", tone: "teal" },
  running: { label: "Running", tone: "blue" },
  retrying: { label: "Retrying", tone: "orange" },
  done: { label: "Done", tone: "green" },
  failed: { label: "Dead letter", tone: "red" },
  skipped: { label: "Skipped", tone: "gray" },
};

function StepRow({ def, state, index, last, now }: { def: StepDef; state: StepState; index: number; last: boolean; now: number }) {
  const ui = STATUS_UI[state.status];
  const active = ACTIVE.includes(state.status);
  const dim = state.status === "waiting" || state.status === "skipped";
  const isRefund = def.key === "refund";
  const retryIn = state.status === "retrying" && state.nextRetryAt ? Math.max(0, new Date(state.nextRetryAt).getTime() - now) : 0;
  const backoffTotal = 2000 * Math.pow(2, Math.max(0, state.failures - 1));
  const attempts = state.status === "done" ? state.failures + 1 : state.status === "running" ? state.failures + 1 : state.failures;

  return (
    <li className={`relative flex gap-4 ${isRefund ? "rise-in" : ""}`}>
      <div className="flex flex-col items-center">
        <span
          className={`relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full transition-all duration-500 ${
            state.status === "done"
              ? "bg-sys-green text-white"
              : state.status === "failed"
                ? "bg-sys-red text-white"
                : active
                  ? `${TONE[ui.tone].bg} text-white ring-4 ${TONE[ui.tone].ring}`
                  : "bg-fill text-label-3"
          }`}
        >
          {state.status === "done" ? (
            <Icon name="check" className="size-5 text-white" strokeWidth={3} />
          ) : state.status === "failed" ? (
            <Icon name="xmark" className="size-5 text-white" strokeWidth={3} />
          ) : (
            <Icon name={def.icon} className={`size-5 ${active ? "text-white" : ""}`} strokeWidth={2.2} />
          )}
          {state.status === "running" && <span className="pulse-dot absolute inset-0 rounded-full text-sys-blue" />}
        </span>
        {!last && (
          <span className="relative my-1 w-0.5 flex-1 overflow-hidden rounded-full bg-fill-2">
            <span
              className={`absolute inset-x-0 top-0 rounded-full bg-sys-green transition-all duration-700 ease-out ${state.status === "done" ? "h-full" : "h-0"}`}
            />
          </span>
        )}
      </div>

      <div
        className={`mb-4 min-w-0 flex-1 rounded-2xl bg-surface p-4 shadow-card ring-2 transition-all duration-500 ${
          active ? `${TONE[ui.tone].ring}` : state.status === "failed" ? "ring-sys-red/30" : "ring-transparent"
        } ${dim ? "opacity-55" : ""}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[15.5px] font-semibold text-label">
              <span className="mr-1.5 text-label-3 tabular">{isRefund ? "↺" : `${index + 1}.`}</span>
              {def.title}
              {!def.critical && !isRefund && <span className="ml-2 rounded-full bg-fill px-2 py-0.5 align-middle text-[10.5px] font-semibold text-label-2">non-critical</span>}
            </p>
            <p className="mt-0.5 text-[13px] leading-snug text-label-2">{def.detail}</p>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${TONE[ui.tone].soft} ${TONE[ui.tone].text}`}>
            {state.status === "running" ? <Spinner className="size-3" /> : <span className={`size-1.5 rounded-full ${TONE[ui.tone].dot}`} />}
            {state.status === "running" && state.worker != null ? `Worker ${state.worker + 1}` : ui.label}
          </span>
        </div>

        {state.status === "retrying" && (
          <div className="mt-3 rounded-xl bg-sys-orange/10 p-3">
            <div className="flex items-center justify-between gap-2 text-[12.5px]">
              <span className="flex items-center gap-1.5 font-semibold text-sys-orange">
                <Icon name="warning" className="size-4" strokeWidth={2.4} />
                {def.failText}
              </span>
              <span className="tabular font-semibold text-sys-orange">{retryIn > 0 ? `retry in ${(retryIn / 1000).toFixed(1)}s` : "retrying now"}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sys-orange/20">
              <div
                className="h-full rounded-full bg-sys-orange transition-[width] duration-100 ease-linear"
                style={{ width: `${Math.min(100, (1 - retryIn / backoffTotal) * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11.5px] text-label-2">Exponential backoff: waits {backoffTotal / 1000}s before attempt {state.failures + 1} of {state.maxAttempts}.</p>
          </div>
        )}

        {state.status === "failed" && (
          <div className="mt-3 rounded-xl bg-sys-red/8 p-3 text-[12.5px] leading-snug">
            <p className="font-semibold text-sys-red">
              {def.failText} — all {state.maxAttempts} attempts failed.
            </p>
            <p className="mt-0.5 text-label-2">
              {def.critical ? "Moved to the dead-letter table. Nothing is lost: the payment is refunded automatically." : "Moved to dead letters for support to resend. The payment itself is unaffected."}
            </p>
          </div>
        )}

        {state.jobId && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-separator pt-3 text-[11.5px]">
            <span className="rounded-md bg-fill px-2 py-0.5 font-mono text-label-2">{def.job.jobType}</span>
            <Link to={`/jobs/${state.jobId}`} className="font-mono text-sys-blue hover:underline">
              job {shortId(state.jobId)}
            </Link>
            {state.maxAttempts > 0 && (
              <span className="ml-auto flex items-center gap-1" title="Attempts">
                {Array.from({ length: state.maxAttempts }).map((_, k) => {
                  const failed = k < state.failures;
                  const ok = state.status === "done" && k === state.failures;
                  const current = state.status === "running" && k === state.failures;
                  return (
                    <span
                      key={k}
                      className={`size-2 rounded-full transition-colors ${
                        failed ? "bg-sys-red" : ok ? "bg-sys-green" : current ? "pulse-dot bg-sys-blue text-sys-blue" : "bg-fill-2"
                      }`}
                    />
                  );
                })}
                <span className="ml-1 tabular text-label-2">
                  {attempts}/{state.maxAttempts}
                </span>
              </span>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function Phone({
  phase,
  steps,
  defs,
  elapsed,
  apiMs,
  receiptFailed,
  refundDone,
  onPay,
  onDone,
}: {
  phase: "idle" | "running" | "success" | "failed";
  steps: StepState[];
  defs: StepDef[];
  elapsed: number;
  apiMs: number | null;
  receiptFailed: boolean;
  refundDone: boolean;
  onPay: () => void;
  onDone: () => void;
}) {
  const doneCount = steps.filter((s, i) => defs[i]?.key !== "refund" && s.status === "done").length;
  const total = defs.filter((d) => d.key !== "refund").length;
  const [txn] = useState(() => `UPI${Math.floor(100000000 + Math.random() * 899999999)}`);

  return (
    <div className="mx-auto w-[320px] rounded-[52px] bg-[#1c1c1e] p-[11px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45),inset_0_0_0_2px_#3a3a3c]">
      <div className="relative h-[640px] overflow-hidden rounded-[42px] bg-[#f2f2f7]">
        <div className="flex items-center justify-between px-7 pt-3.5 text-[13px] font-semibold text-black">
          <span>9:41</span>
          <span className="absolute left-1/2 top-2.5 h-[30px] w-[100px] -translate-x-1/2 rounded-full bg-black" />
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 18 12" className="h-3 w-4" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="2.5" width="3" height="9.5" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
            <span className="relative ml-0.5 inline-block h-3 w-6 rounded-[4px] border border-black/40 p-[1.5px]"><span className="block h-full w-4/5 rounded-[2px] bg-black" /></span>
          </span>
        </div>

        <div className="flex h-[calc(100%-40px)] flex-col px-5 pb-6 pt-6">
          {phase === "idle" && (
            <>
              <p className="text-center text-[13px] font-medium text-black/50">Paying</p>
              <div className="mt-4 flex flex-col items-center">
                <span className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-[#ff9500] to-[#ff5e3a] text-[26px] font-bold text-white shadow-lg">S</span>
                <p className="mt-3 text-[19px] font-semibold text-black">Swiggy</p>
                <p className="text-[12.5px] text-black/50">swiggy@axisbank · Order #4821</p>
              </div>
              <p className="mt-8 text-center text-[52px] font-bold tracking-tight text-black">
                <span className="align-top text-[30px]">₹</span>499
              </p>
              <div className="mt-6 space-y-2 rounded-2xl bg-white p-3.5 text-[13px]">
                <Row l="From" r="HDFC Bank ••4821" />
                <Row l="Method" r="UPI" />
                <Row l="Note" r="Dinner 🍕" />
              </div>
              <button
                onClick={onPay}
                className="mt-auto flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#007aff] text-[17px] font-semibold text-white shadow-[0_8px_20px_-6px_rgba(0,122,255,0.6)] transition-transform active:scale-[0.97]"
              >
                <Icon name="lock" className="size-5" strokeWidth={2.3} />
                Pay ₹499
              </button>
            </>
          )}

          {phase === "running" && (
            <div className="flex flex-1 flex-col items-center">
              <div className="relative mt-6 flex size-28 items-center justify-center">
                <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                  <circle cx="50" cy="50" r="44" stroke="rgba(0,122,255,0.15)" strokeWidth="8" fill="none" />
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    stroke="#007aff"
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={276.5}
                    strokeDashoffset={276.5 * (1 - doneCount / total)}
                    className="transition-[stroke-dashoffset] duration-700"
                  />
                </svg>
                <span className="text-[26px] font-bold text-black">₹499</span>
              </div>
              <p className="mt-4 text-[18px] font-semibold text-black">Processing payment</p>
              <p className="mt-1 text-center text-[12.5px] text-black/55">
                {apiMs != null ? `Accepted in ${apiMs} ms · ` : ""}confirming with your bank
              </p>
              <div className="mt-6 w-full space-y-1.5 rounded-2xl bg-white p-3">
                {defs.map((d, i) => {
                  const s = steps[i];
                  return (
                    <div key={d.key} className="flex items-center gap-2.5 py-1 text-[12.5px]">
                      <span className="flex size-5 items-center justify-center">
                        {s.status === "done" ? (
                          <span className="flex size-5 items-center justify-center rounded-full bg-[#34c759] text-white"><Icon name="check" className="size-3" strokeWidth={3.2} /></span>
                        ) : s.status === "failed" ? (
                          <span className="flex size-5 items-center justify-center rounded-full bg-[#ff3b30] text-white"><Icon name="xmark" className="size-3" strokeWidth={3.2} /></span>
                        ) : s.status === "retrying" ? (
                          <Icon name="retry" className="size-4 animate-spin text-[#ff9500] [animation-duration:1.6s]" strokeWidth={2.4} />
                        ) : ACTIVE.includes(s.status) ? (
                          <Spinner className="size-4 text-black/60" />
                        ) : (
                          <span className="size-2 rounded-full bg-black/15" />
                        )}
                      </span>
                      <span className={s.status === "waiting" || s.status === "skipped" ? "text-black/35" : "text-black"}>{d.title}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-auto tabular text-[12px] text-black/40">{formatDuration(elapsed)}</p>
            </div>
          )}

          {phase === "success" && (
            <div className="rise-in flex flex-1 flex-col items-center">
              <span className="mt-10 flex size-24 items-center justify-center rounded-full bg-[#34c759] text-white shadow-[0_12px_30px_-8px_rgba(52,199,89,0.7)]">
                <Icon name="check" className="size-12" strokeWidth={3} />
              </span>
              <p className="mt-6 text-[15px] font-medium text-black/55">Paid to Swiggy</p>
              <p className="text-[44px] font-bold tracking-tight text-black">₹499</p>
              <div className="mt-5 w-full space-y-2 rounded-2xl bg-white p-3.5 text-[12.5px]">
                <Row l="Transaction ID" r={txn} />
                <Row l="Completed in" r={formatDuration(elapsed)} />
                <Row l="Status" r="Successful" />
              </div>
              {receiptFailed && (
                <p className="mt-3 rounded-xl bg-[#ff9500]/12 px-3 py-2 text-center text-[11.5px] text-[#c46e00]">
                  Receipt SMS couldn't be sent. Support will resend it — your payment is safe.
                </p>
              )}
              <button onClick={onDone} className="mt-auto h-12 w-full rounded-2xl bg-black/5 text-[16px] font-semibold text-[#007aff]">
                Done
              </button>
            </div>
          )}

          {phase === "failed" && (
            <div className="rise-in flex flex-1 flex-col items-center">
              <span className="mt-10 flex size-24 items-center justify-center rounded-full bg-[#ff3b30] text-white shadow-[0_12px_30px_-8px_rgba(255,59,48,0.7)]">
                <Icon name="xmark" className="size-12" strokeWidth={3} />
              </span>
              <p className="mt-6 text-[20px] font-bold text-black">Payment failed</p>
              <p className="mt-1 px-2 text-center text-[13px] text-black/55">Your bank isn't responding right now.</p>
              <div className="mt-5 flex w-full items-center gap-3 rounded-2xl bg-white p-3.5">
                <span className={`flex size-9 items-center justify-center rounded-full ${refundDone ? "bg-[#34c759]" : "bg-[#ff9500]"} text-white`}>
                  <Icon name={refundDone ? "check" : "retry"} className="size-5" strokeWidth={2.6} />
                </span>
                <div className="text-[12.5px] leading-snug">
                  <p className="font-semibold text-black">{refundDone ? "₹499 refunded" : "Refunding ₹499…"}</p>
                  <p className="text-black/55">No money was lost. Support has been notified.</p>
                </div>
              </div>
              <button onClick={onDone} className="mt-auto h-12 w-full rounded-2xl bg-black/5 text-[16px] font-semibold text-[#007aff]">
                Try again
              </button>
            </div>
          )}
        </div>
        <span className="absolute bottom-2 left-1/2 h-[5px] w-[120px] -translate-x-1/2 rounded-full bg-black/80" />
      </div>
    </div>
  );
}

function Row({ l, r }: { l: string; r: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-black/50">{l}</span>
      <span className="truncate font-medium text-black">{r}</span>
    </div>
  );
}

function Takeaways({
  phase,
  run,
  steps,
  defs,
}: {
  phase: "idle" | "running" | "success" | "failed";
  run: { apiMs: number | null } | null;
  steps: StepState[];
  defs: StepDef[];
}) {
  const bank = steps[defs.findIndex((d) => d.key === "bank")];
  const cards: { icon: IconName; tone: Tone; title: string; body: string }[] = [
    {
      icon: "bolt",
      tone: "blue",
      title: "Instant for the customer",
      body: run?.apiMs != null
        ? `The API answered in ${run.apiMs} ms. The slow work (fraud check, bank transfer) happened in the background, so the app never froze.`
        : "The API answers in milliseconds. Slow work like fraud checks and bank calls happens in the background, so the app never freezes.",
    },
    {
      icon: "retry",
      tone: "orange",
      title: "Heals itself",
      body: bank && bank.failures > 0 && bank.status === "done"
        ? `The bank timed out ${bank.failures} time${bank.failures === 1 ? "" : "s"}. The job waited longer each time and succeeded without anyone doing anything.`
        : "When the bank times out, the job waits 2s, then 4s, and tries again automatically. No human needed.",
    },
    {
      icon: "shield",
      tone: "green",
      title: "Never loses money",
      body: phase === "failed"
        ? "The bank never recovered, so the payment went to dead letters and a refund job ran automatically. Every attempt is on record."
        : "Every job is saved before it runs. If the bank stays down, the payment is set aside and refunded automatically — nothing is lost.",
    },
  ];
  return (
    <section>
      <h2 className="mb-3 px-1 text-[13px] font-medium uppercase tracking-[0.04em] text-label-2">What this shows</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.title} className="rounded-2xl bg-surface p-5 shadow-card">
            <span className={`flex size-10 items-center justify-center rounded-[11px] ${TONE[c.tone].soft} ${TONE[c.tone].text}`}>
              <Icon name={c.icon} className="size-5" strokeWidth={2.2} />
            </span>
            <p className="mt-3 text-[16px] font-semibold text-label">{c.title}</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-label-2">{c.body}</p>
          </div>
        ))}
      </div>
      {phase !== "idle" && phase !== "running" && (
        <div className="mt-5 flex justify-center">
          <Link to="/pipeline">
            <Button variant="tinted" icon="flow">See it in the Live Pipeline</Button>
          </Link>
        </div>
      )}
    </section>
  );
}
