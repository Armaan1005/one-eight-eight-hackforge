import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "./ui";
import { API_BASE_URL } from "../services/api";

export const NAV: { to: string; label: string; short: string; icon: IconName; tone: string }[] = [
  { to: "/", label: "Overview", short: "Overview", icon: "gauge", tone: "bg-sys-blue" },
  { to: "/pipeline", label: "Live Pipeline", short: "Pipeline", icon: "flow", tone: "bg-sys-purple" },
  { to: "/jobs", label: "Jobs", short: "Jobs", icon: "list", tone: "bg-sys-indigo" },
  { to: "/dead-letters", label: "Dead Letters", short: "Dead", icon: "archive", tone: "bg-sys-red" },
  { to: "/create", label: "New Job", short: "New", icon: "plusCircle", tone: "bg-sys-green" },
  { to: "/real-world", label: "Real-World Demo", short: "Payment", icon: "creditCard", tone: "bg-sys-orange" },
];

export function AppMark({ className = "size-9" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[10px] bg-gradient-to-br from-[#5e5ce6] via-[#0a84ff] to-[#30b0c7] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_6px_rgba(10,132,255,0.35)] ${className}`}
    >
      <Icon name="bolt" className="size-[55%]" strokeWidth={2.3} />
    </span>
  );
}

/** macOS-style translucent source list. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-separator bg-glass backdrop-blur-2xl backdrop-saturate-150 md:flex">
      <div className="flex items-center gap-3 px-5 pb-6 pt-6">
        <AppMark />
        <div>
          <p className="text-[15px] font-semibold leading-tight text-label">Job Processor</p>
          <p className="text-[12px] text-label-2">Background execution</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-[9px] px-2.5 py-[7px] text-[14px] font-medium transition-colors ${
                isActive ? "bg-sys-blue/14 text-label" : "text-label hover:bg-fill"
              }`
            }
          >
            <span className={`inline-flex size-6 items-center justify-center rounded-[7px] text-white ${link.tone}`}>
              <Icon name={link.icon} className="size-[15px]" strokeWidth={2.3} />
            </span>
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="m-3 rounded-xl bg-fill/70 p-3">
        <span className="text-[12px] font-medium text-label-2">Backend</span>
        <p className="mt-1 truncate font-mono text-[11px] text-label-3">{API_BASE_URL.replace(/^https?:\/\//, "")}</p>
      </div>
    </aside>
  );
}

/** iOS tab bar for narrow screens. */
export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-separator bg-glass pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl backdrop-saturate-150 md:hidden">
      {NAV.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === "/"}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium ${isActive ? "text-sys-blue" : "text-sys-gray"}`
          }
        >
          <Icon name={link.icon} className="size-6" strokeWidth={2} />
          {link.short}
        </NavLink>
      ))}
    </nav>
  );
}
