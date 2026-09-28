import { STATUS_META, TONE } from "../lib/meta";
import type { JobStatusWire } from "../types/job";

export function StatusBadge({ status, size = "sm" }: { status: JobStatusWire; size?: "sm" | "md" }) {
  const meta = STATUS_META[status] ?? STATUS_META.QUEUED;
  const tone = TONE[meta.tone];
  const live = status === "PROCESSING" || status === "RETRYING";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold ${tone.soft} ${tone.text} ${
        size === "md" ? "px-3 py-1 text-[13px]" : "px-2 py-0.5 text-[12px]"
      }`}
    >
      <span className={`size-1.5 rounded-full ${tone.dot} ${live ? "pulse-dot" : ""}`} />
      {meta.label}
    </span>
  );
}
