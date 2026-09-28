import type { ReactNode } from "react";
import { IconBadge, type IconName } from "./ui";
import { TONE, type Tone } from "../lib/meta";

export function StatCard({
  label,
  value,
  icon,
  tone,
  footnote,
  accessory,
}: {
  label: string;
  value: ReactNode;
  icon: IconName;
  tone: Tone;
  footnote?: ReactNode;
  accessory?: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between">
        <IconBadge icon={icon} tone={tone} />
        {accessory}
      </div>
      <p className="mt-3 text-[13px] font-medium text-label-2">{label}</p>
      <p className="tabular mt-0.5 text-[28px] font-bold leading-tight tracking-tight text-label">{value}</p>
      {footnote && <p className="mt-0.5 text-[12px] text-label-2">{footnote}</p>}
    </div>
  );
}

export function Ring({ value, tone = "green", size = 44 }: { value: number; tone?: Tone; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={`-rotate-90 ${TONE[tone].text}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" strokeOpacity={0.16} strokeWidth={6} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="currentColor"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
  );
}
