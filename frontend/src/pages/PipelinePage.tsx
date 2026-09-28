import { useState } from "react";
import { Button, Card, Icon, IconBadge, PageHeader, Section, Spinner } from "../components/ui";
import { ActivityLog, BackoffChart, HOW_IT_WORKS, PipelineDiagram } from "../components/Pipeline";
import { useToast } from "../components/Toast";
import { useNow } from "../hooks/useLiveUpdates";
import { usePipeline } from "../hooks/usePipeline";
import { runDemoScenario } from "../lib/demo";
import { errorMessage } from "../lib/format";

export function PipelinePage() {
  const state = usePipeline();
  const now = useNow(200);
  const { showToast } = useToast();
  const [running, setRunning] = useState(false);

  const handleDemo = async () => {
    setRunning(true);
    try {
      const n = await runDemoScenario();
      showToast(`Submitted ${n} demo jobs — watch them flow through`, "success");
    } catch (e) {
      showToast(errorMessage(e, "Could not submit demo jobs"), "error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Live Pipeline"
        subtitle="Every stage of the backend, updating in real time. Submit jobs and watch which process handles them — the queue, each worker, the retry scanner, and where they end up."
        actions={
          <>
            <Button variant="gray" icon="trash" onClick={state.clearEvents} className="hidden sm:inline-flex">
              Clear log
            </Button>
            <Button icon="play" onClick={handleDemo} loading={running}>
              Run demo
            </Button>
          </>
        }
      />

      {state.error && !state.system ? (
        <Card className="flex items-center gap-3 text-[15px] text-label-2">
          <Spinner /> Waiting for the backend at the API URL… ({state.error})
        </Card>
      ) : (
        <PipelineDiagram state={state} now={now} />
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Section title="Activity" footer="Derived from the SignalR events the backend broadcasts. Click an entry to open that job.">
          <ActivityLog events={state.events} now={now} />
        </Section>

        <div className="space-y-8">
          {state.system && (
            <Section title="Retry policy" footer="Values come from RetrySettings in appsettings.json.">
              <BackoffChart system={state.system} />
            </Section>
          )}
          <Section title="Guarantees">
            {[
              { icon: "database" as const, tone: "blue" as const, t: "Durable", d: "Jobs are persisted before they're queued." },
              { icon: "shield" as const, tone: "green" as const, t: "No double processing", d: "In-flight tracking + an atomic database claim." },
              { icon: "retry" as const, tone: "orange" as const, t: "Crash recovery", d: "Interrupted jobs are re-evaluated on startup." },
              { icon: "antenna" as const, tone: "purple" as const, t: "Live, with fallback", d: "SignalR push, 5s polling if it drops." },
            ].map((g, i, all) => (
              <div key={g.t} className="flex items-center gap-3 pl-4">
                <IconBadge icon={g.icon} tone={g.tone} size="sm" />
                <div className={`flex-1 py-2.5 pr-4 ${i < all.length - 1 ? "border-b border-separator" : ""}`}>
                  <p className="text-[14px] font-medium text-label">{g.t}</p>
                  <p className="text-[12.5px] text-label-2">{g.d}</p>
                </div>
              </div>
            ))}
          </Section>
        </div>
      </div>

      <Section title="How it works, step by step" footer="Paths are relative to BackgroundJobProcessor/backend. Use this as a walkthrough script when presenting.">
        <ol>
          {HOW_IT_WORKS.map((s, i) => (
            <li key={s.title} className="flex gap-3.5 pl-4">
              <div className="flex flex-col items-center pt-3.5">
                <IconBadge icon={s.icon} tone={s.tone} />
              </div>
              <div className={`flex-1 py-3.5 pr-4 ${i < HOW_IT_WORKS.length - 1 ? "border-b border-separator" : ""}`}>
                <p className="text-[15px] font-semibold text-label">
                  <span className="mr-1.5 text-label-3 tabular">{i + 1}.</span>
                  {s.title}
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-label-2">{s.body}</p>
                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-fill/70 px-2 py-0.5 font-mono text-[11.5px] text-label-2">
                  <Icon name="doc" className="size-3.5" strokeWidth={2} />
                  {s.file}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
