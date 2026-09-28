import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useToast } from "../components/Toast";
import { Button, Icon, IconBadge, PageHeader, Section, Stepper, Toggle } from "../components/ui";
import { JOB_TYPE_META, TONE, jobTypeMeta } from "../lib/meta";
import { errorMessage, formatSeconds } from "../lib/format";
import type { SystemInfo } from "../types/job";

type PathStep =
  | { kind: "attempt"; n: number; result: "ok" | "fail" | "maybe"; note?: string }
  | { kind: "wait"; secs: number }
  | { kind: "end"; result: "COMPLETED" | "DEAD_LETTER" | "EITHER" };

function backoff(sys: SystemInfo, failureCount: number) {
  return Math.min(sys.initialDelaySeconds * Math.pow(sys.backoffMultiplier, failureCount - 1), sys.maxDelaySeconds);
}

/** Mirrors JobService.RecordFailureAsync + RetryPolicy so users see what will happen before submitting. */
function predictPath(jobType: string, maxAttempts: number, failures: number, delay: number, sys: SystemInfo): PathStep[] {
  const steps: PathStep[] = [];
  if (jobType === "RandomFailureJob") {
    for (let n = 1; n <= Math.min(maxAttempts, 4); n++) {
      steps.push({ kind: "attempt", n, result: "maybe" });
      if (n < maxAttempts && n < 4) steps.push({ kind: "wait", secs: backoff(sys, n) });
    }
    steps.push({ kind: "end", result: "EITHER" });
    return steps;
  }
  const failFirst = jobType === "AlwaysFailJob" ? Infinity : jobType === "FlakyJob" ? failures : 0;
  for (let n = 1; n <= maxAttempts; n++) {
    if (n <= failFirst) {
      steps.push({ kind: "attempt", n, result: "fail" });
      if (n < maxAttempts) steps.push({ kind: "wait", secs: backoff(sys, n) });
      else steps.push({ kind: "end", result: "DEAD_LETTER" });
    } else {
      steps.push({ kind: "attempt", n, result: "ok", note: jobType === "DelayedJob" ? `${delay}s` : undefined });
      steps.push({ kind: "end", result: "COMPLETED" });
      break;
    }
  }
  return steps;
}

function PathPreview({ steps }: { steps: PathStep[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
      {steps.map((s, i) => {
        let node: ReactNode;
        if (s.kind === "attempt") {
          const tone = s.result === "ok" ? "green" : s.result === "fail" ? "red" : "purple";
          node = (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${TONE[tone].soft} ${TONE[tone].text}`}>
              <Icon name={s.result === "ok" ? "check" : s.result === "fail" ? "xmark" : "dice"} className="size-3.5" strokeWidth={2.8} />
              Attempt {s.n}
              {s.note && <span className="font-medium opacity-75">· {s.note}</span>}
            </span>
          );
        } else if (s.kind === "wait") {
          node = (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-sys-orange">
              <Icon name="clock" className="size-3.5" strokeWidth={2.4} />
              {formatSeconds(s.secs)}
            </span>
          );
        } else {
          const cfg =
            s.result === "COMPLETED"
              ? { label: "Completed", cls: "bg-sys-green text-white", icon: "check" as const }
              : s.result === "DEAD_LETTER"
                ? { label: "Dead letter", cls: "bg-sys-red text-white", icon: "archive" as const }
                : { label: "Completed or dead letter", cls: "bg-fill-2 text-label", icon: "dice" as const };
          node = (
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${cfg.cls}`}>
              <Icon name={cfg.icon} className="size-3.5" strokeWidth={2.6} />
              {cfg.label}
            </span>
          );
        }
        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            {i > 0 && <Icon name="chevronRight" className="size-3 text-label-3" strokeWidth={2.6} />}
            {node}
          </span>
        );
      })}
    </div>
  );
}

function FormRow({ label, hint, children, last }: { label: string; hint?: string; children: ReactNode; last?: boolean }) {
  return (
    <div className="pl-4">
      <div className={`flex items-center justify-between gap-4 py-3 pr-4 ${last ? "" : "border-b border-separator"}`}>
        <div className="min-w-0">
          <p className="text-[15px] text-label">{label}</p>
          {hint && <p className="text-[12.5px] text-label-2">{hint}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function CreateJobPage() {
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [jobType, setJobType] = useState("");
  const [failuresBeforeSuccess, setFailuresBeforeSuccess] = useState(2);
  const [failureRate, setFailureRate] = useState(0.5);
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [overrideRetries, setOverrideRetries] = useState(false);
  const [maxRetries, setMaxRetries] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    api
      .getJobTypes()
      .then((types) => {
        const order = Object.keys(JOB_TYPE_META);
        const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : order.length);
        const sorted = [...types].sort((a, b) => rank(a) - rank(b));
        setJobTypes(sorted);
        if (sorted.length > 0) setJobType(sorted.includes("FlakyJob") ? "FlakyJob" : sorted[0]);
      })
      .catch(() => {});
    api
      .getSystem()
      .then((s) => {
        setSystem(s);
        setMaxRetries(s.defaultMaxRetries);
      })
      .catch(() => {});
  }, []);

  const effectiveMax = overrideRetries ? maxRetries : (system?.defaultMaxRetries ?? 5);
  const selected = jobTypeMeta(jobType);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!jobType) return;

    let payload: Record<string, unknown> | undefined;
    if (jobType === "FlakyJob") payload = { failuresBeforeSuccess };
    else if (jobType === "RandomFailureJob") payload = { failureRate };
    else if (jobType === "DelayedJob") payload = { delaySeconds };

    setSubmitting(true);
    try {
      const job = await api.createJob({ jobType, payload, maxRetries: overrideRetries ? maxRetries : undefined });
      showToast(`${selected.title} job submitted`, "success");
      navigate(`/jobs/${job.id}`);
    } catch (err) {
      showToast(errorMessage(err, "Failed to create job"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <PageHeader
        back={{ to: "/jobs", label: "Jobs" }}
        title="New Job"
        subtitle="Pick a demo job type. Each one is designed to exercise a different path through the pipeline."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobTypes.map((t) => {
          const m = jobTypeMeta(t);
          const active = t === jobType;
          return (
            <button
              type="button"
              key={t}
              onClick={() => setJobType(t)}
              aria-pressed={active}
              className={`relative rounded-2xl bg-surface p-4 text-left shadow-card ring-2 transition-all duration-200 active:scale-[0.985] ${
                active ? "ring-sys-blue" : "ring-transparent hover:ring-separator"
              }`}
            >
              <div className="flex items-start justify-between">
                <IconBadge icon={m.icon} tone={m.tone} size="lg" solid={active} />
                <span
                  className={`flex size-6 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-sys-blue text-white" : "border-2 border-fill-2"
                  }`}
                >
                  {active && <Icon name="check" className="size-3.5" strokeWidth={3} />}
                </span>
              </div>
              <p className="mt-3 text-[17px] font-semibold text-label">{m.title}</p>
              <p className="mt-0.5 text-[13px] leading-snug text-label-2">{m.blurb}</p>
              {m.demonstrates && (
                <p className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${TONE[m.tone].soft} ${TONE[m.tone].text}`}>
                  {m.demonstrates}
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="Configuration" footer="Max attempts is the total number of tries, including the first.">
          {jobType === "FlakyJob" && (
            <FormRow label="Failures before success" hint="The first N attempts throw an exception">
              <Stepper value={failuresBeforeSuccess} onChange={setFailuresBeforeSuccess} min={0} max={10} />
            </FormRow>
          )}
          {jobType === "RandomFailureJob" && (
            <FormRow label="Failure rate" hint="Chance each attempt fails">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={failureRate}
                  onChange={(e) => setFailureRate(Number(e.target.value))}
                  className="w-36"
                />
                <span className="tabular w-10 text-right text-[15px] font-medium text-label">{Math.round(failureRate * 100)}%</span>
              </div>
            </FormRow>
          )}
          {jobType === "DelayedJob" && (
            <FormRow label="Run time" hint="How long the worker stays busy">
              <Stepper value={delaySeconds} onChange={setDelaySeconds} min={1} max={120} format={(v) => `${v}s`} />
            </FormRow>
          )}
          <FormRow label="Custom max attempts" hint={overrideRetries ? undefined : `Using server default (${system?.defaultMaxRetries ?? 5})`} last={!overrideRetries}>
            <Toggle checked={overrideRetries} onChange={setOverrideRetries} label="Custom max attempts" />
          </FormRow>
          {overrideRetries && (
            <FormRow label="Max attempts" last>
              <Stepper value={maxRetries} onChange={setMaxRetries} min={1} max={20} />
            </FormRow>
          )}
        </Section>

        <Section
          title="What will happen"
          footer={
            jobType === "RandomFailureJob"
              ? `Each attempt is a coin flip. Chance of ending in dead letter: ${(Math.pow(failureRate, effectiveMax) * 100).toFixed(1)}%.`
              : "Predicted from the job settings and the server's retry policy."
          }
        >
          <div className="p-4">
            {system && jobType ? (
              <PathPreview steps={predictPath(jobType, effectiveMax, failuresBeforeSuccess, delaySeconds, system)} />
            ) : (
              <p className="text-[13px] text-label-2">Loading retry policy…</p>
            )}
          </div>
        </Section>
      </div>

      <div className="mx-auto max-w-sm">
        <Button type="submit" size="lg" loading={submitting} disabled={!jobType}>
          Submit {selected.title} Job
        </Button>
      </div>
    </form>
  );
}
