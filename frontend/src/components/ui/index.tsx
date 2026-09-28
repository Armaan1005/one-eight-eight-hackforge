import { useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon, type IconName } from "./Icon";
import { TONE, type Tone } from "../../lib/meta";

export { Icon, type IconName };

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: { to: string; label: string };
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-7">
      {back && (
        <Link
          to={back.to}
          className="-ml-1.5 mb-2 inline-flex items-center gap-0.5 rounded-md px-1 text-[15px] text-sys-blue hover:opacity-70"
        >
          <Icon name="chevronLeft" className="size-[18px]" strokeWidth={2.4} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <div className="mb-1.5">{eyebrow}</div>}
          <h1 className="text-[28px] font-bold leading-tight tracking-[-0.022em] text-label md:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-1 max-w-2xl text-[15px] text-label-2">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cx("rounded-2xl bg-surface shadow-card", padded && "p-5", className)}>{children}</div>;
}

/** iOS "inset grouped" section: a small header, a rounded card, an optional footnote. */
export function Section({
  title,
  action,
  footer,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {(title || action) && (
        <div className="mb-2 flex items-end justify-between px-4">
          {title && <h2 className="text-[13px] font-medium uppercase tracking-[0.04em] text-label-2">{title}</h2>}
          {action}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card">{children}</div>
      {footer && <p className="mt-2 px-4 text-[13px] leading-snug text-label-2">{footer}</p>}
    </section>
  );
}

export function ListRow({
  to,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
  chevron = !!to,
  className,
}: {
  to?: string;
  onClick?: () => void;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="flex min-w-0 flex-1 items-center gap-3 border-b border-separator py-3 pr-4 group-last:border-b-0">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] text-label">{title}</div>
          {subtitle && <div className="mt-0.5 truncate text-[13px] text-label-2">{subtitle}</div>}
        </div>
        {trailing && <div className="flex shrink-0 items-center gap-2 text-[15px] text-label-2">{trailing}</div>}
        {chevron && <Icon name="chevronRight" className="size-4 shrink-0 text-label-3" strokeWidth={2.4} />}
      </div>
    </>
  );
  const base = cx("group flex items-center gap-3 pl-4", (to || onClick) && "transition-colors hover:bg-fill/60 active:bg-fill", className);
  if (to) {
    return (
      <Link to={to} className={base}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx(base, "w-full text-left")}>
        {body}
      </button>
    );
  }
  return <div className={base}>{body}</div>;
}

/** Rounded-square tinted glyph, like the icons in iOS Settings. */
export function IconBadge({ icon, tone, size = "md", solid = false }: { icon: IconName; tone: Tone; size?: "sm" | "md" | "lg"; solid?: boolean }) {
  const dims = size === "sm" ? "size-7 rounded-[8px]" : size === "lg" ? "size-11 rounded-[12px]" : "size-8 rounded-[9px]";
  const glyph = size === "sm" ? "size-4" : size === "lg" ? "size-6" : "size-[18px]";
  return (
    <span className={cx("inline-flex items-center justify-center", dims, solid ? cx(TONE[tone].bg, "text-white") : cx(TONE[tone].soft, TONE[tone].text))}>
      <Icon name={icon} className={glyph} strokeWidth={2.1} />
    </span>
  );
}

type ButtonVariant = "filled" | "tinted" | "gray" | "plain" | "destructive";

export function Button({
  variant = "filled",
  size = "md",
  icon,
  loading,
  children,
  className,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" | "lg"; icon?: IconName; loading?: boolean }) {
  const variants: Record<ButtonVariant, string> = {
    filled: "bg-sys-blue text-white hover:brightness-110",
    tinted: "bg-sys-blue/14 text-sys-blue hover:bg-sys-blue/20",
    gray: "bg-fill text-label hover:bg-fill-2",
    plain: "text-sys-blue hover:bg-sys-blue/10",
    destructive: "bg-sys-red/12 text-sys-red hover:bg-sys-red/18",
  };
  const sizes = {
    sm: "h-8 px-3 text-[13px] gap-1.5 rounded-full",
    md: "h-10 px-4 text-[15px] gap-2 rounded-full",
    lg: "h-12 px-6 text-[17px] gap-2 rounded-[14px] w-full",
  };
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center font-semibold transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {loading ? <Spinner className={size === "sm" ? "size-3.5" : "size-4"} /> : icon && <Icon name={icon} className={size === "sm" ? "size-4" : "size-[18px]"} strokeWidth={2.2} />}
      {children}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const refs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const el = refs.current.get(value);
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options.length]);

  return (
    <div className={cx("no-scrollbar max-w-full overflow-x-auto", className)}>
      <div role="tablist" className="relative inline-flex rounded-[10px] bg-fill p-0.5">
        {thumb && (
          <span
            className="absolute top-0.5 bottom-0.5 rounded-[8px] bg-surface shadow-[0_3px_8px_rgba(0,0,0,0.12),0_1px_1px_rgba(0,0,0,0.04)] transition-all duration-300 ease-[cubic-bezier(0.3,0.9,0.3,1)]"
            style={{ left: thumb.left, width: thumb.width }}
          />
        )}
        {options.map((o) => (
          <button
            key={o.value}
            role="tab"
            aria-selected={o.value === value}
            ref={(el) => {
              if (el) refs.current.set(o.value, el);
            }}
            onClick={() => onChange(o.value)}
            className={cx(
              "relative z-10 whitespace-nowrap rounded-[8px] px-3.5 py-1.5 text-[13px] transition-colors",
              o.value === value ? "font-semibold text-label" : "font-medium text-label-2 hover:text-label",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center gap-3">
      <span className="tabular min-w-[3.5rem] text-right text-[15px] font-medium text-label">{format(value)}</span>
      <div className="inline-flex items-center rounded-[9px] bg-fill">
        <button
          type="button"
          aria-label="Decrease"
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
          className="flex h-8 w-11 items-center justify-center text-label transition-opacity disabled:opacity-30"
        >
          <Icon name="minus" className="size-4" strokeWidth={2.4} />
        </button>
        <span className="h-4 w-px bg-separator" />
        <button
          type="button"
          aria-label="Increase"
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
          className="flex h-8 w-11 items-center justify-center text-label transition-opacity disabled:opacity-30"
        >
          <Icon name="plus" className="size-4" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200",
        checked ? "bg-sys-green" : "bg-fill-2",
      )}
    >
      <span
        className={cx(
          "absolute top-[2px] left-[2px] size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_3px_1px_rgba(0,0,0,0.06)] transition-transform duration-200 ease-[cubic-bezier(0.3,0.9,0.3,1.2)]",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

/** Native select dressed as a macOS pop-up button. */
export function PopUpButton({
  value,
  onChange,
  children,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("relative inline-flex", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full cursor-pointer appearance-none rounded-[9px] bg-fill pl-3 pr-8 text-[13px] font-medium text-label outline-none transition-colors hover:bg-fill-2 focus-visible:ring-2 focus-visible:ring-sys-blue/50"
      >
        {children}
      </select>
      <Icon name="chevronDown" className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-label-2" strokeWidth={2.6} />
    </div>
  );
}

/** Apple-style activity indicator (8 fading spokes). */
export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("animate-spin [animation-duration:0.9s] [animation-timing-function:steps(8)]", className)} aria-label="Loading">
      {Array.from({ length: 8 }).map((_, i) => (
        <rect
          key={i}
          x="11"
          y="2"
          width="2"
          height="6"
          rx="1"
          fill="currentColor"
          opacity={0.25 + (i / 8) * 0.75}
          transform={`rotate(${i * 45} 12 12)`}
        />
      ))}
    </svg>
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-24 text-[15px] text-label-2">
      <Spinner />
      {label}
    </div>
  );
}

export function EmptyState({ icon = "tray", title, description, action }: { icon?: IconName; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-14 items-center justify-center rounded-full bg-fill text-label-3">
        <Icon name={icon} className="size-7" strokeWidth={1.7} />
      </div>
      <p className="text-[17px] font-semibold text-label">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[15px] text-label-2">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function CodeBlock({ children, className }: { children: string; className?: string }) {
  return (
    <pre className={cx("overflow-auto rounded-xl bg-code p-4 font-mono text-[12.5px] leading-relaxed text-[#e5e5ea]", className)}>
      {children}
    </pre>
  );
}

export function KeyValue({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-separator py-3 pr-4 last:border-b-0">
      <span className="shrink-0 text-[15px] text-label">{label}</span>
      <span className={cx("min-w-0 truncate text-right text-[15px] text-label-2", mono && "font-mono text-[13px]")}>{value}</span>
    </div>
  );
}
