import { Icon } from "./ui";
import { formatDuration, formatTime } from "../lib/format";
import type { JobAttempt } from "../types/job";

/** Vertical timeline of attempts, with the backoff gap shown between consecutive attempts. */
export function AttemptTimeline({ attempts }: { attempts: JobAttempt[] }) {
  if (attempts.length === 0) {
    return <p className="px-4 py-5 text-[15px] text-label-2">No attempts yet — the job is waiting for a worker.</p>;
  }

  return (
    <ol className="px-4 py-2">
      {attempts.map((a, i) => {
        const ok = a.outcome === "COMPLETED";
        const prev = attempts[i - 1];
        const gapMs = prev?.completedAt ? new Date(a.startedAt).getTime() - new Date(prev.completedAt).getTime() : null;
        return (
          <li key={a.id}>
            {gapMs != null && gapMs > 250 && (
              <div className="flex items-center gap-3 py-1 pl-[11px]">
                <span className="h-6 border-l-2 border-dashed border-sys-orange/50" />
                <span className="ml-3 inline-flex items-center gap-1 rounded-full bg-sys-orange/12 px-2 py-0.5 text-[11.5px] font-semibold text-sys-orange">
                  <Icon name="clock" className="size-3" strokeWidth={2.4} />
                  waited {formatDuration(gapMs)} (backoff)
                </span>
              </div>
            )}
            <div className="flex gap-3 py-2.5">
              <span
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-white ${ok ? "bg-sys-green" : "bg-sys-red"}`}
              >
                <Icon name={ok ? "check" : "xmark"} className="size-3.5" strokeWidth={3} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-[15px] font-semibold text-label">
                    Attempt {a.attemptNumber} <span className={`font-medium ${ok ? "text-sys-green" : "text-sys-red"}`}>· {ok ? "Succeeded" : "Failed"}</span>
                  </p>
                  <p className="tabular text-[13px] text-label-2">
                    {formatTime(a.startedAt)} · {formatDuration(a.durationMs)}
                  </p>
                </div>
                {a.errorMessage && (
                  <p className="mt-1 break-words rounded-lg bg-sys-red/8 px-2.5 py-1.5 font-mono text-[12px] leading-snug text-sys-red">
                    {a.errorMessage}
                  </p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
