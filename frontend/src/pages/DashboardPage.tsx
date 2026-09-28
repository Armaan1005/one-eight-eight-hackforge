import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useLiveUpdates, useNow } from "../hooks/useLiveUpdates";
import { usePipeline } from "../hooks/usePipeline";
import { StatCard, Ring } from "../components/StatCard";
import { StatusDistributionChart } from "../components/StatusDistributionChart";
import { JobList } from "../components/JobList";
import { WorkerLane } from "../components/Pipeline";
import { Button, EmptyState, Icon, LoadingState, PageHeader, Section } from "../components/ui";
import { useToast } from "../components/Toast";
import { ClearHistoryButton } from "../components/ClearHistoryButton";
import { runDemoScenario } from "../lib/demo";
import { errorMessage, formatDuration } from "../lib/format";
import type { JobSummary } from "../types/job";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function DashboardPage() {
  const pipeline = usePipeline();
  const { stats } = pipeline;
  const [recentJobs, setRecentJobs] = useState<JobSummary[] | null>(null);
  const [demoRunning, setDemoRunning] = useState(false);
  const now = useNow(250);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const refreshRecent = useCallback(async () => {
    try {
      const res = await api.listJobs({ page: 1, pageSize: 8 });
      setRecentJobs(res.items);
    } catch {
      setRecentJobs((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    refreshRecent();
  }, [refreshRecent]);

  useLiveUpdates({ onJobChanged: refreshRecent, onPoll: refreshRecent });

  const handleCancel = async (id: string) => {
    try {
      await api.cancelJob(id);
      showToast("Job cancelled", "success");
      refreshRecent();
    } catch (e) {
      showToast(errorMessage(e, "Failed to cancel job"), "error");
    }
  };

  const handleDemo = async () => {
    setDemoRunning(true);
    try {
      const n = await runDemoScenario();
      showToast(`Submitted ${n} demo jobs`, "success");
    } catch (e) {
      showToast(errorMessage(e, "Could not submit demo jobs"), "error");
    } finally {
      setDemoRunning(false);
    }
  };

  if (!stats && pipeline.error) {
    return (
      <EmptyState
        icon="server"
        title="Can't reach the backend"
        description={`${pipeline.error}. Make sure the API is running on port 5080.`}
      />
    );
  }
  if (!stats) return <LoadingState label="Loading overview…" />;

  const active = stats.queued + stats.processing + stats.retrying;
  const workers = pipeline.activity?.workers ?? [];
  const busy = workers.filter((w) => w.state === "RUNNING").length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={<span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-label-2">{greeting()}</span>}
        title="Overview"
        subtitle="Reliable asynchronous job execution with automatic retries and dead-letter handling."
        actions={
          <>
            <ClearHistoryButton onCleared={refreshRecent} />
            <Button variant="gray" icon="play" onClick={handleDemo} loading={demoRunning}>
              Run demo
            </Button>
            <Button icon="plus" onClick={() => navigate("/create")}>
              New Job
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total jobs" value={stats.total} icon="cube" tone="blue" footnote={`${stats.cancelled} cancelled`} />
        <StatCard
          label="In progress"
          value={active}
          icon="gear"
          tone="indigo"
          footnote={`${stats.queued} queued · ${stats.processing} running · ${stats.retrying} retrying`}
        />
        <StatCard
          label="Success rate"
          value={`${stats.successRatePercent}%`}
          icon="check"
          tone="green"
          footnote={`${stats.completed} completed · ${stats.deadLetter} dead`}
          accessory={<Ring value={stats.successRatePercent} />}
        />
        <StatCard
          label="Avg. processing"
          value={formatDuration(stats.averageProcessingTimeMs)}
          icon="timer"
          tone="orange"
          footnote="per successful attempt"
        />
      </div>

      <StatusDistributionChart stats={stats} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Section
          title={`Workers · ${busy}/${workers.length} busy`}
          action={
            <Link to="/pipeline" className="inline-flex items-center gap-0.5 text-[13px] font-medium text-sys-blue hover:opacity-70">
              Live pipeline <Icon name="chevronRight" className="size-3.5" strokeWidth={2.6} />
            </Link>
          }
          footer="Each worker is a loop inside the JobWorker background service, pulling from the same queue."
        >
          <div className="space-y-2 p-3">
            {workers.map((w) => (
              <WorkerLane key={w.workerIndex} slot={w} now={now} />
            ))}
            {pipeline.activity && (
              <div className="flex items-center justify-between rounded-xl bg-fill/50 px-3 py-2.5 text-[13px]">
                <span className="flex items-center gap-2 text-label-2">
                  <Icon name="tray" className="size-4" /> Queue depth
                </span>
                <span className="tabular font-semibold text-label">{pipeline.activity.queueDepth}</span>
              </div>
            )}
          </div>
        </Section>

        <Section
          title="Recent jobs"
          action={
            <Link to="/jobs" className="inline-flex items-center gap-0.5 text-[13px] font-medium text-sys-blue hover:opacity-70">
              See all <Icon name="chevronRight" className="size-3.5" strokeWidth={2.6} />
            </Link>
          }
        >
          {recentJobs == null ? (
            <LoadingState />
          ) : recentJobs.length === 0 ? (
            <EmptyState
              icon="sparkles"
              title="No jobs yet"
              description="Run the demo to submit a mix of jobs that succeed, retry, and fail."
              action={
                <Button variant="tinted" icon="play" onClick={handleDemo} loading={demoRunning}>
                  Run demo
                </Button>
              }
            />
          ) : (
            <JobList jobs={recentJobs} onCancel={handleCancel} />
          )}
        </Section>
      </div>
    </div>
  );
}
