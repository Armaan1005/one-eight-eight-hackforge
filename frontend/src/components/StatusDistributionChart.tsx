import { Link } from "react-router-dom";
import { Icon } from "./ui";
import { STATUS_META, TONE } from "../lib/meta";
import type { JobStatusWire, Stats } from "../types/job";

const SEGMENTS: { key: keyof Stats; status: JobStatusWire }[] = [
  { key: "completed", status: "COMPLETED" },
  { key: "processing", status: "PROCESSING" },
  { key: "retrying", status: "RETRYING" },
  { key: "queued", status: "QUEUED" },
  { key: "deadLetter", status: "DEAD_LETTER" },
  { key: "cancelled", status: "CANCELLED" },
];

export function StatusDistributionChart({ stats }: { stats: Stats }) {
  const total = stats.total || 1;

  return (
    <div className="rounded-2xl bg-surface p-5 shadow-card">
      <div className="flex items-baseline justify-between">
        <p className="text-[17px] font-semibold text-label">Status breakdown</p>
        <p className="tabular text-[13px] text-label-2">{stats.total} jobs</p>
      </div>
      <div className="mt-4 flex h-3 w-full gap-[3px] overflow-hidden rounded-full bg-fill">
        {SEGMENTS.map((seg) => {
          const value = stats[seg.key] as number;
          if (value <= 0) return null;
          const meta = STATUS_META[seg.status];
          return (
            <div
              key={seg.key}
              className={`${TONE[meta.tone].bg} h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full ${
                seg.status === "CANCELLED" ? "opacity-40" : ""
              }`}
              style={{ width: `${(value / total) * 100}%` }}
              title={`${meta.label}: ${value}`}
            />
          );
        })}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-6">
        {SEGMENTS.map((seg) => {
          const meta = STATUS_META[seg.status];
          const value = stats[seg.key] as number;
          return (
            <Link
              key={seg.key}
              to={`/jobs?status=${seg.status}`}
              className="group -mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-fill/70"
            >
              <span className={`flex size-6 items-center justify-center rounded-full ${TONE[meta.tone].soft} ${TONE[meta.tone].text}`}>
                <Icon name={meta.icon} className="size-3.5" strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-label-2">{meta.label}</span>
              <span className="tabular text-[15px] font-semibold text-label">{value}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
