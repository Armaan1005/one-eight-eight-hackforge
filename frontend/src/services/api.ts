import type { DeadLetter, JobDetail, JobSummary, PagedResult, Stats, SystemInfo } from "../types/job";

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:5080";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.detail || body.message || body.title || message;
    } catch {
      // Response had no JSON body - keep statusText.
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export const api = {
  getJobTypes: () => request<string[]>("/api/jobs/types"),

  createJob: (body: { jobType: string; payload?: unknown; maxRetries?: number }) =>
    request<JobSummary>("/api/jobs", { method: "POST", body: JSON.stringify(body) }),

  listJobs: (params: { status?: string; jobType?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.jobType) qs.set("jobType", params.jobType);
    qs.set("page", String(params.page ?? 1));
    qs.set("pageSize", String(params.pageSize ?? 20));
    return request<PagedResult<JobSummary>>(`/api/jobs?${qs.toString()}`);
  },

  getJob: (id: string) => request<JobDetail>(`/api/jobs/${id}`),

  getStats: () => request<Stats>("/api/jobs/stats"),

  getSystem: () => request<SystemInfo>("/api/system"),

  clearFinishedJobs: () => request<{ deleted: number }>("/api/jobs/finished", { method: "DELETE" }),

  cancelJob:(id: string) => request<void>(`/api/jobs/${id}/cancel`, { method: "POST" }),

  listDeadLetters: (params: { page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    qs.set("page", String(params.page ?? 1));
    qs.set("pageSize", String(params.pageSize ?? 20));
    return request<PagedResult<DeadLetter>>(`/api/dead-letters?${qs.toString()}`);
  },

  getDeadLetter: (id: string) => request<DeadLetter>(`/api/dead-letters/${id}`),

  requeueDeadLetter: (id: string) => request<JobSummary>(`/api/dead-letters/${id}/requeue`, { method: "POST" }),
};
