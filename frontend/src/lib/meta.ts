import type { IconName } from "../components/ui/Icon";
import type { JobStatusWire } from "../types/job";

export type Tone = "blue" | "green" | "orange" | "red" | "purple" | "indigo" | "teal" | "gray" | "pink";

/** Tailwind classes per tone. Spelled out in full so Tailwind's scanner picks them up. */
export const TONE: Record<Tone, { text: string; bg: string; soft: string; ring: string; dot: string }> = {
  blue: { text: "text-sys-blue", bg: "bg-sys-blue", soft: "bg-sys-blue/12", ring: "ring-sys-blue/35", dot: "bg-sys-blue" },
  green: { text: "text-sys-green", bg: "bg-sys-green", soft: "bg-sys-green/14", ring: "ring-sys-green/35", dot: "bg-sys-green" },
  orange: { text: "text-sys-orange", bg: "bg-sys-orange", soft: "bg-sys-orange/14", ring: "ring-sys-orange/35", dot: "bg-sys-orange" },
  red: { text: "text-sys-red", bg: "bg-sys-red", soft: "bg-sys-red/12", ring: "ring-sys-red/35", dot: "bg-sys-red" },
  purple: { text: "text-sys-purple", bg: "bg-sys-purple", soft: "bg-sys-purple/12", ring: "ring-sys-purple/35", dot: "bg-sys-purple" },
  indigo: { text: "text-sys-indigo", bg: "bg-sys-indigo", soft: "bg-sys-indigo/12", ring: "ring-sys-indigo/35", dot: "bg-sys-indigo" },
  teal: { text: "text-sys-teal", bg: "bg-sys-teal", soft: "bg-sys-teal/14", ring: "ring-sys-teal/35", dot: "bg-sys-teal" },
  pink: { text: "text-sys-pink", bg: "bg-sys-pink", soft: "bg-sys-pink/12", ring: "ring-sys-pink/35", dot: "bg-sys-pink" },
  gray: { text: "text-sys-gray", bg: "bg-sys-gray", soft: "bg-fill", ring: "ring-sys-gray/35", dot: "bg-sys-gray" },
};

export const STATUS_META: Record<JobStatusWire, { label: string; tone: Tone; icon: IconName }> = {
  QUEUED: { label: "Queued", tone: "gray", icon: "tray" },
  PROCESSING: { label: "Processing", tone: "blue", icon: "gear" },
  RETRYING: { label: "Retrying", tone: "orange", icon: "retry" },
  COMPLETED: { label: "Completed", tone: "green", icon: "check" },
  FAILED: { label: "Failed", tone: "red", icon: "xmark" },
  DEAD_LETTER: { label: "Dead Letter", tone: "red", icon: "archive" },
  CANCELLED: { label: "Cancelled", tone: "gray", icon: "stop" },
};

export const JOB_TYPE_META: Record<string, { title: string; blurb: string; demonstrates: string; icon: IconName; tone: Tone }> = {
  SuccessfulJob: {
    title: "Successful",
    blurb: "Runs for half a second and always succeeds.",
    demonstrates: "Happy path",
    icon: "check",
    tone: "green",
  },
  FlakyJob: {
    title: "Flaky",
    blurb: "Fails its first N attempts, then succeeds.",
    demonstrates: "Automatic recovery via retries",
    icon: "bolt",
    tone: "orange",
  },
  RandomFailureJob: {
    title: "Random Failure",
    blurb: "Fails at random, based on a failure rate.",
    demonstrates: "Unpredictable real-world failures",
    icon: "dice",
    tone: "purple",
  },
  AlwaysFailJob: {
    title: "Always Fails",
    blurb: "Never succeeds, so it exhausts every retry.",
    demonstrates: "Retry → dead-letter path",
    icon: "warning",
    tone: "red",
  },
  DelayedJob: {
    title: "Long Running",
    blurb: "Sleeps for a configurable number of seconds.",
    demonstrates: "Busy workers & concurrency",
    icon: "hourglass",
    tone: "indigo",
  },
};

export function jobTypeMeta(jobType: string | null | undefined) {
  return (jobType && JOB_TYPE_META[jobType]) || { title: jobType ?? "Job", blurb: "", demonstrates: "", icon: "cube" as IconName, tone: "gray" as Tone };
}
