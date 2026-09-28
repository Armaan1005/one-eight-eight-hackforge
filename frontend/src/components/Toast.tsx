import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "./ui/Icon";

interface ToastItem {
  id: number;
  message: string;
  variant: "success" | "error" | "info";
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastItem["variant"]) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT = {
  success: { icon: "check" as const, className: "bg-sys-green" },
  error: { icon: "warning" as const, className: "bg-sys-red" },
  info: { icon: "info" as const, className: "bg-sys-blue" },
};

/** Notification banners that drop in from the top, like iOS system banners. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, variant: ToastItem["variant"] = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-2), { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="banner-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border border-separator bg-glass px-3.5 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.14)] backdrop-blur-2xl backdrop-saturate-150"
          >
            <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-white ${VARIANT[t.variant].className}`}>
              <Icon name={VARIANT[t.variant].icon} className="size-4" strokeWidth={2.6} />
            </span>
            <p className="text-[14px] font-medium leading-snug text-label">{t.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
