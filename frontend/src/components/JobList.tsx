import { Link } from "react-router-dom";
import { Icon, IconBadge } from "./ui";
import { StatusBadge } from "./StatusBadge";
import { jobTypeMeta } from "../lib/meta";
import { relativeTime, shortId } from "../lib/format";
import { useNow } from "../hooks/useLiveUpdates";
import type { JobSummary } from "../types/job";

// retryCount is the number of failed attempts so far.
export function jobSubtitle(job: JobSummary, now: number) {
  const ago = relativeTime(job.createdAt, now);
  switch (job.status) {
    case "QUEUED":
      return `Waiting for a worker · ${ago}`;
    case "PROCESSING":
      return `Running attempt ${job.retryCount + 1} of ${job.maxRetries}`;
    case "RETRYING": {
      const secs = job.nextRetryAt ? Math.max(0, Math.ceil((new Date(job.nextRetryAt).getTime() - now) / 1000)) : 0;
      return secs > 0 ? `Attempt ${job.retryCount + 1} of ${job.maxRetries} in ${secs}s` : `Attempt ${job.retryCount + 1} of ${job.maxRetries} due now`;
    }
    case "COMPLETED":
      return `Succeeded on attempt ${job.retryCount + 1} · ${ago}`;
    case "DEAD_LETTER":
      return `Failed all ${job.retryCount} attempts · ${ago}`;
    case "CANCELLED":
      return `Cancelled after ${job.retryCount} attempt${job.retryCount === 1 ? "" : "s"} · ${ago}`;
    default:
      return `Attempt ${job.retryCount} failed · ${ago}`;
  }
}

export function JobList({ jobs, onCancel }: { jobs: JobSummary[]; onCancel?: (id: string) => void }) {
  const now = useNow(1000);
  return (
    <div>
      {jobs.map((job) => {
        const meta = jobTypeMeta(job.jobType);
        const cancellable = (job.status === "QUEUED" || job.status === "RETRYING") && onCancel;
        return (
          <div key={job.id} className="group flex items-center transition-colors hover:bg-fill/60">
            <Link to={`/jobs/${job.id}`} className="flex min-w-0 flex-1 items-center gap-3 pl-4">
              <IconBadge icon={meta.icon} tone={meta.tone} />
              <div className="flex min-w-0 flex-1 items-center gap-3 border-b border-separator py-3 pr-2 group-last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-[15px] font-medium text-label">{meta.title}</span>
                    <span className="font-mono text-[12px] text-label-3">{shortId(job.id)}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[13px] text-label-2 tabular">{jobSubtitle(job, now)}</div>
                </div>
                <StatusBadge status={job.status} />
                {!cancellable && <Icon name="chevronRight" className="mr-2 size-4 shrink-0 text-label-3" strokeWidth={2.4} />}
              </div>
            </Link>
            {cancellable && (
              <div className="flex self-stretch items-center border-b border-separator pr-3 group-last:border-b-0">
                <button
                  onClick={() => onCancel(job.id)}
                  className="rounded-full px-2.5 py-1 text-[13px] font-semibold text-sys-red transition-colors hover:bg-sys-red/10"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
