import { useState } from "react";
import { api } from "../services/api";
import { Button } from "./ui";
import { useToast } from "./Toast";
import { errorMessage } from "../lib/format";

/** "Clear history" with an iOS-style confirmation alert. Deletes finished jobs only. */
export function ClearHistoryButton({ onCleared }: { onCleared?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { showToast } = useToast();

  const confirm = async () => {
    setBusy(true);
    try {
      const { deleted } = await api.clearFinishedJobs();
      showToast(deleted ? `Removed ${deleted} finished job${deleted === 1 ? "" : "s"}` : "No finished jobs to remove", "success");
      onCleared?.();
      setOpen(false);
    } catch (e) {
      showToast(errorMessage(e, "Could not clear history"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="destructive" icon="trash" onClick={() => setOpen(true)}>
        Clear history
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6 backdrop-blur-[2px]" onClick={() => !busy && setOpen(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="banner-in w-full max-w-[290px] overflow-hidden rounded-[16px] bg-glass text-center shadow-[0_20px_60px_rgba(0,0,0,0.25)] backdrop-blur-2xl backdrop-saturate-150"
          >
            <div className="px-5 pb-4 pt-5">
              <p className="text-[17px] font-semibold text-label">Clear job history?</p>
              <p className="mt-1 text-[13px] leading-snug text-label">
                Completed, dead-lettered and cancelled jobs will be permanently deleted. Jobs that are queued, running or retrying are kept.
              </p>
            </div>
            <div className="grid grid-cols-2 border-t border-separator text-[17px]">
              <button disabled={busy} onClick={() => setOpen(false)} className="border-r border-separator py-3 text-sys-blue hover:bg-fill/60">
                Cancel
              </button>
              <button disabled={busy} onClick={confirm} className="py-3 font-semibold text-sys-red hover:bg-fill/60 disabled:opacity-50">
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
