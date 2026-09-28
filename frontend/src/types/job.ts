export type JobStatusWire =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "RETRYING"
  | "DEAD_LETTER"
  | "CANCELLED";

export interface JobSummary {
  id: string;
  jobType: string;
  status: JobStatusWire;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  lastError: string | null;
}

export interface JobAttempt {
  id: string;
  attemptNumber: number;
  outcome: "COMPLETED" | "FAILED";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  errorMessage: string | null;
  stackTrace: string | null;
}

export interface JobDetail extends JobSummary {
  payload: string;
  failureReason: string | null;
  attempts: JobAttempt[];
}

export interface DeadLetter {
  id: string;
  originalJobId: string;
  jobType: string;
  payload: string;
  retryCount: number;
  maxRetries: number;
  finalError: string | null;
  failureReason: string;
  createdAt: string;
  deadLetteredAt: string;
  attempts: JobAttempt[];
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface Stats {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  retrying: number;
  failed: number;
  deadLetter: number;
  cancelled: number;
  successRatePercent: number;
  averageProcessingTimeMs: number | null;
}

export interface WorkerSlot {
  workerIndex: number;
  state: "IDLE" | "RUNNING";
  jobId: string | null;
  jobType: string | null;
  attemptNumber: number | null;
  startedAt: string | null;
  processedCount: number;
  lastJobId: string | null;
  lastJobType: string | null;
  lastAttemptNumber: number | null;
  lastOutcome: "COMPLETED" | "FAILED" | null;
  lastFinishedAt: string | null;
  lastDurationMs: number | null;
}

export interface WorkersSnapshot {
  workers: WorkerSlot[];
  queueDepth: number;
  inFlight: number;
  lastRetryScanAt: string | null;
  lastRetryScanEnqueued: number;
  lastRetryEnqueueAt: string | null;
}

export interface SystemInfo {
  startedAt: string;
  workerCount: number;
  retryScanIntervalSeconds: number;
  defaultMaxRetries: number;
  initialDelaySeconds: number;
  backoffMultiplier: number;
  maxDelaySeconds: number;
  useJitter: boolean;
  backoffScheduleSeconds: number[];
  activity: WorkersSnapshot;
}

export interface JobSummaryEvent {
  id: string;
  jobType: string;
  status: JobStatusWire;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  lastError: string | null;
  eventType: string;
}
