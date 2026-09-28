import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import { useLiveUpdates } from "../hooks/useLiveUpdates";
import { EmptyState, Icon, IconBadge, LoadingState, PageHeader, Section } from "../components/ui";
import { useToast } from "../components/Toast";
import { jobTypeMeta } from "../lib/meta";
import { errorMessage, relativeTime, shortId } from "../lib/format";
import type { DeadLetter } from "../types/job";

export function DeadLettersPage() {
  const [items, setItems] = useState<DeadLetter[] | null>(null);
  const { showToast } = useToast();

  const refresh = useCallback(async () => {
    try {
      const res = await api.listDeadLetters({ page: 1, pageSize: 50 });
      setItems(res.items);
    } catch (e) {
      showToast(errorMessage(e, "Failed to load dead letters"), "error");
      setItems((prev) => prev ?? []);
    }
  }, [showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useLiveUpdates({ onJobChanged: refresh, onPoll: refresh });

  const handleRequeue = async (id: string) => {
    try {
      await api.requeueDeadLetter(id);
      showToast("Requeued as a new job", "success");
      refresh();
    } catch (e) {
      showToast(errorMessage(e, "Failed to requeue"), "error");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dead Letters"
        subtitle="Jobs that failed every allowed attempt. They're kept here, out of the active pipeline, so you can inspect what went wrong and requeue them."
      />

      <Section title={items ? `${items.length} dead-lettered` : undefined}>
        {items == null ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState icon="archive" title="Nothing here" description="Jobs appear here once they exceed their maximum retry count. Try an “Always Fails” job." />
        ) : (
          items.map((d) => {
            const meta = jobTypeMeta(d.jobType);
            return (
              <div key={d.id} className="group flex items-center transition-colors hover:bg-fill/60">
                <Link to={`/dead-letters/${d.id}`} className="flex min-w-0 flex-1 items-center gap-3 pl-4">
                  <IconBadge icon={meta.icon} tone={meta.tone} />
                  <div className="min-w-0 flex-1 border-b border-separator py-3 pr-2 group-last:border-b-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[15px] font-medium text-label">{meta.title}</span>
                      <span className="font-mono text-[12px] text-label-3">{shortId(d.originalJobId)}</span>
                      <span className="ml-auto shrink-0 text-[12px] text-label-2">{relativeTime(d.deadLetteredAt)}</span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[12px] text-sys-red">{d.finalError ?? d.failureReason}</p>
                  </div>
                </Link>
                <div className="flex items-center self-stretch border-b border-separator pr-3 group-last:border-b-0">
                  <button
                    onClick={() => handleRequeue(d.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-sys-blue/12 px-3 py-1 text-[13px] font-semibold text-sys-blue transition-colors hover:bg-sys-blue/20"
                  >
                    <Icon name="retry" className="size-3.5" strokeWidth={2.6} />
                    Requeue
                  </button>
                </div>
              </div>
            );
          })
        )}
      </Section>
    </div>
  );
}
