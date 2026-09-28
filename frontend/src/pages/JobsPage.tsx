import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import { useLiveUpdates } from "../hooks/useLiveUpdates";
import { JobList } from "../components/JobList";
import { Button, EmptyState, Icon, LoadingState, PageHeader, PopUpButton, SegmentedControl, Section } from "../components/ui";
import { useToast } from "../components/Toast";
import { ClearHistoryButton } from "../components/ClearHistoryButton";
import { jobTypeMeta } from "../lib/meta";
import { errorMessage } from "../lib/format";
import type { JobStatusWire, JobSummary } from "../types/job";

const FILTERS: { value: JobStatusWire | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "QUEUED", label: "Queued" },
  { value: "PROCESSING", label: "Running" },
  { value: "RETRYING", label: "Retrying" },
  { value: "COMPLETED", label: "Completed" },
  { value: "DEAD_LETTER", label: "Dead" },
  { value: "CANCELLED", label: "Cancelled" },
];

const PAGE_SIZE = 15;

export function JobsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as JobStatusWire | null) ?? "ALL";
  const jobType = params.get("type") ?? "";
  const page = Number(params.get("page") ?? 1);

  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [jobTypes, setJobTypes] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    Object.entries(next).forEach(([k, v]) => (v == null || v === "" || v === "ALL" ? p.delete(k) : p.set(k, v)));
    setParams(p, { replace: true });
  };

  const refresh = useCallback(async () => {
    try {
      const res = await api.listJobs({
        status: status === "ALL" ? undefined : status,
        jobType: jobType || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setJobs(res.items);
      setTotalPages(res.totalPages || 1);
      setTotalCount(res.totalCount);
    } catch (e) {
      showToast(errorMessage(e, "Failed to load jobs"), "error");
      setJobs((prev) => prev ?? []);
    }
  }, [status, jobType, page, showToast]);

  useEffect(() => {
    api.getJobTypes().then(setJobTypes).catch(() => {});
  }, []);

  useEffect(() => {
    setJobs(null);
    refresh();
  }, [refresh]);

  useLiveUpdates({ onJobChanged: refresh, onPoll: refresh });

  const handleCancel = async (id: string) => {
    try {
      await api.cancelJob(id);
      showToast("Job cancelled", "success");
      refresh();
    } catch (e) {
      showToast(errorMessage(e, "Failed to cancel job"), "error");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        subtitle="Every job the system has seen, updating live."
        actions={
          <>
            <ClearHistoryButton onCleared={refresh} />
            <Button icon="plus" onClick={() => navigate("/create")}>
              New Job
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl options={FILTERS} value={status} onChange={(v) => update({ status: v, page: null })} />
        <PopUpButton value={jobType} onChange={(v) => update({ type: v, page: null })} className="min-w-[10rem]">
          <option value="">All job types</option>
          {jobTypes.map((t) => (
            <option key={t} value={t}>
              {jobTypeMeta(t).title}
            </option>
          ))}
        </PopUpButton>
      </div>

      <Section
        title={jobs ? `${totalCount} job${totalCount === 1 ? "" : "s"}` : undefined}
        footer={
          jobs && totalPages > 1 ? (
            <span className="flex items-center justify-between">
              <button
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1) })}
                className="inline-flex items-center gap-0.5 font-medium text-sys-blue disabled:text-label-3"
              >
                <Icon name="chevronLeft" className="size-4" strokeWidth={2.6} /> Previous
              </button>
              <span className="tabular">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => update({ page: String(page + 1) })}
                className="inline-flex items-center gap-0.5 font-medium text-sys-blue disabled:text-label-3"
              >
                Next <Icon name="chevronRight" className="size-4" strokeWidth={2.6} />
              </button>
            </span>
          ) : undefined
        }
      >
        {jobs == null ? (
          <LoadingState label="Loading jobs…" />
        ) : jobs.length === 0 ? (
          <EmptyState icon="list" title="No matching jobs" description="Try a different filter, or create a new job." />
        ) : (
          <JobList jobs={jobs} onCancel={handleCancel} />
        )}
      </Section>
    </div>
  );
}
