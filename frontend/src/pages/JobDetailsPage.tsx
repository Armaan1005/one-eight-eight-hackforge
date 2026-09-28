import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../services/api";
import { useLiveUpdates, useNow } from "../hooks/useLiveUpdates";
import { StatusBadge } from "../components/StatusBadge";
import { AttemptTimeline } from "../components/AttemptTimeline";
import { Button, CodeBlock, EmptyState, Icon, IconBadge, KeyValue, LoadingState, PageHeader, Section } from "../components/ui";
import { useToast } from "../components/Toast";
import { TONE, jobTypeMeta, type Tone } from "../lib/meta";
import { errorMessage, formatDateTime, prettyJson } from "../lib/format";
import type { JobDetail } from "../types/job";

/** Horizontal Queued → Running → outcome track, like a delivery-status tracker. */
function ProgressTrack({ job, now }: { job: JobDetail; now: number }) {
  const s = job.status;
  const outcome: { label: string; tone: Tone; icon: "check" | "archive" | "stop" | "retry" | "cube" } =
    s === "COMPLETED"
      ? { label: "Completed", tone: "green", icon: "check" }
      : s === "DEAD_LETTER"
        ? { label: "Dead letter", tone: "red", icon: "archive" }
        : s === "CANCELLED"
          ? { label: "Cancelled", tone: "gray", icon: "stop" }
          : { label: "Done", tone: "gray", icon: "cube" };
  const reachedRun = s !== "QUEUED" && !(s === "CANCELLED" && job.retryCount === 0);
  const done = s === "COMPLETED" || s === "DEAD_LETTER" || s === "CANCELLED";
  const retrySecs = s === "RETRYING" && job.nextRetryAt ? Math.max(0, (new Date(job.nextRetryAt).getTime() - now) / 1000) : null;

  const steps: { label: string; sub?: string; tone: Tone; icon: "tray" | "gear" | "retry" | typeof outcome.icon; state: "done" | "current" | "todo" }[] = [
    { label: "Queued", tone: "teal", icon: "tray", state: s === "QUEUED" ? "current" : "done" },
    {
      label: s === "RETRYING" ? "Backing off" : "Running",
      sub:
        s === "RETRYING"
          ? retrySecs && retrySecs > 0
            ? `attempt ${job.retryCount + 1} in ${retrySecs.toFixed(1)}s`
            : `attempt ${job.retryCount + 1} due`
          : s === "PROCESSING"
            ? `attempt ${job.retryCount + 1}`
            : undefined,
      tone: s === "RETRYING" ? "orange" : "blue",
      icon: s === "RETRYING" ? "retry" : "gear",
      state: s === "PROCESSING" || s === "RETRYING" ? "current" : reachedRun ? "done" : "todo",
    },
    { label: outcome.label, tone: outcome.tone, icon: outcome.icon, state: done ? "current" : "todo" },
  ];

  return (
    <div className="flex items-start">
      {steps.map((step, i) => (
        <div key={i} className="flex flex-1 items-start last:flex-none">
          <div className="flex w-24 flex-col items-center text-center">
            <span
              className={`flex size-10 items-center justify-center rounded-full transition-colors ${
                step.state === "todo"
                  ? "bg-fill text-label-3"
                  : step.state === "current"
                    ? `${TONE[step.tone].bg} text-white ${s === "PROCESSING" || s === "RETRYING" ? "pulse-dot" : ""} ${TONE[step.tone].text}`
                    : `${TONE[step.tone].soft} ${TONE[step.tone].text}`
              }`}
            >
              <Icon name={step.icon} className={`size-5 ${step.state === "current" ? "text-white" : ""}`} strokeWidth={2.3} />
            </span>
            <p className={`mt-2 text-[13px] font-semibold ${step.state === "todo" ? "text-label-3" : "text-label"}`}>{step.label}</p>
            {step.sub && <p className="tabular text-[11.5px] text-label-2">{step.sub}</p>}
          </div>
          {i < steps.length - 1 && (
            <div className={`mt-5 h-0.5 flex-1 rounded-full ${steps[i + 1].state !== "todo" ? "bg-sys-blue/50" : "bg-fill-2"}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export function JobDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const { showToast } = useToast();
  const now = useNow(200);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      setJob(await api.getJob(id));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useLiveUpdates({
    onJobChanged: (evt) => {
      if (evt.id === id) refresh();
    },
    onPoll: refresh,
  });

  const handleCancel = async () => {
    if (!id) return;
    try {
      await api.cancelJob(id);
      showToast("Job cancelled", "success");
      refresh();
    } catch (e) {
      showToast(errorMessage(e, "Failed to cancel job"), "error");
    }
  };

  if (loading) return <LoadingState label="Loading job…" />;
  if (notFound || !job) {
    return <EmptyState icon="cube" title="Job not found" description="It may have been removed, or the link is wrong." />;
  }

  const meta = jobTypeMeta(job.jobType);

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ to: "/jobs", label: "Jobs" }}
        title={
          <span className="flex items-center gap-3">
            <IconBadge icon={meta.icon} tone={meta.tone} size="lg" solid />
            {meta.title}
          </span>
        }
        subtitle={<span className="font-mono text-[13px]">{job.id}</span>}
        actions={
          <>
            <StatusBadge status={job.status} size="md" />
            {(job.status === "QUEUED" || job.status === "RETRYING") && (
              <Button variant="destructive" icon="stop" size="sm" onClick={handleCancel}>
                Cancel job
              </Button>
            )}
          </>
        }
      />

      <div className="rounded-2xl bg-surface px-4 py-6 shadow-card sm:px-8">
        <ProgressTrack job={job} now={now} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Section title={`Attempts · ${job.attempts.length} of ${job.maxRetries} allowed`} footer="Orange gaps are the exponential backoff delays between retries.">
          <AttemptTimeline attempts={job.attempts} />
        </Section>

        <div className="space-y-8">
          <Section title="Details">
            <div className="pl-4">
              <KeyValue label="Job type" value={job.jobType} mono />
              <KeyValue label="Failed attempts" value={`${job.retryCount} / ${job.maxRetries}`} />
              <KeyValue label="Created" value={formatDateTime(job.createdAt)} />
              <KeyValue label="Started" value={formatDateTime(job.startedAt)} />
              <KeyValue label="Last attempt" value={formatDateTime(job.lastAttemptAt)} />
              {job.nextRetryAt && <KeyValue label="Next retry" value={formatDateTime(job.nextRetryAt)} />}
              <KeyValue label="Completed" value={formatDateTime(job.completedAt)} />
              {job.failureReason && <KeyValue label="Failure reason" value={job.failureReason} />}
            </div>
          </Section>

          <Section title="Payload">
            <div className="p-3">
              <CodeBlock className="max-h-56">{prettyJson(job.payload)}</CodeBlock>
            </div>
          </Section>

          {job.lastError && (
            <Section title="Last error">
              <p className="p-4 font-mono text-[12.5px] leading-relaxed text-sys-red">{job.lastError}</p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
