# Background Job Processor with Job Status Dashboard

A reliable background job processing system: submit a job, watch it move through a queue, a
background worker, automatic retries with exponential backoff, and — if it never succeeds —
permanent dead-letter storage. A live dashboard shows every job's state, its full attempt
history, and everything that ended up dead-lettered.

```
SUBMIT JOB -> QUEUE -> BACKGROUND WORKER -> EXECUTE -> SUCCESS -> COMPLETED
                                               |
                                            FAILURE
                                               |
                                     EXPONENTIAL BACKOFF -> RETRY -> SUCCESS -> COMPLETED
                                               |
                                        MAX RETRIES EXCEEDED
                                               |
                                          DEAD LETTER -> PERSISTED -> DASHBOARD
```

---

## A. Architecture Summary

A modular monolith, not a microservice fleet:

- **ASP.NET Core Web API** (.NET 8) — REST endpoints + Swagger, single process.
- **`System.Threading.Channels`-backed queue** (`IBackgroundJobQueue`) — the in-process work
  queue. Also tracks which job IDs are currently queued/running so the same job is never
  handed to two workers at once (see [Concurrency](#concurrency--limitations)).
- **`JobWorker` (BackgroundService)** — N concurrent consumer loops reading from the queue,
  executing the job's handler, and recording the outcome.
- **`RetryScannerService` (BackgroundService)** — the "clock" of the system. Polls the database
  every second for jobs whose backoff has elapsed and re-enqueues them; also runs the
  [startup recovery](#application-restart-behavior) pass once at boot.
- **`JobService`** — the single place that owns the job lifecycle state machine. Every status
  transition happens here, nowhere else.
- **EF Core + SQLite** — durable storage for jobs, attempt history, and dead-letters. Chosen
  over PostgreSQL/SQL Server because it needs zero setup for a judge to run this locally.
- **SignalR hub** (`/hubs/jobs`) — pushes `jobChanged` / `statsChanged` events so the dashboard
  updates live. This is a nice-to-have, not a correctness requirement: every page also polls
  every 5s, so the UI stays correct even if the socket never connects.
- **React + TypeScript + Vite + Tailwind** — the dashboard.

Why not Kafka/RabbitMQ/Redis/Kubernetes: this is a single-process demo of reliable job
processing, not a distributed systems demo. An in-process channel is thread-safe, requires no
extra infrastructure, and is exactly what the problem statement asks for
("`System.Threading.Channels` for the in-process queue").

---

## B. Project Tree

```
BackgroundJobProcessor/
├── backend/                          ASP.NET Core Web API
│   ├── Controllers/
│   │   ├── JobsController.cs         POST/GET jobs, stats, cancel
│   │   └── DeadLettersController.cs  list/get/requeue dead letters
│   ├── Data/
│   │   └── AppDbContext.cs           EF Core DbContext + model configuration
│   ├── Models/                       Job, JobAttempt, DeadLetterJob, JobStatus, AttemptOutcome
│   ├── DTOs/                         Request/response contracts (never expose EF entities)
│   ├── Services/
│   │   ├── JobService.cs             The lifecycle state machine (the heart of the system)
│   │   ├── RetryPolicy.cs            Exponential backoff calculation
│   │   └── JobEventNotifier.cs       SignalR broadcast wrapper
│   ├── Workers/
│   │   ├── JobWorker.cs              Consumes the queue, executes jobs
│   │   └── RetryScannerService.cs    Requeues due retries + startup recovery
│   ├── Queue/
│   │   └── BackgroundJobQueue.cs     Channel<Guid> + in-flight tracking
│   ├── Jobs/                         Demo job handlers (Successful/Flaky/AlwaysFail/...)
│   ├── Hubs/JobsHub.cs                SignalR hub
│   ├── Configuration/                RetrySettings, WorkerSettings (bound from appsettings.json)
│   ├── Migrations/                   EF Core migrations
│   ├── Program.cs
│   └── appsettings.json
├── backend.Tests/                    xUnit tests (RetryPolicy, JobService, job handlers)
├── frontend/                         React + TypeScript + Vite + Tailwind
│   └── src/
│       ├── components/               StatusBadge, JobTable, AttemptTable, StatCard, Toast, ...
│       ├── pages/                    Dashboard, Jobs, JobDetails, DeadLetters, CreateJob
│       ├── layouts/MainLayout.tsx
│       ├── services/                 api.ts (fetch client), signalr.ts
│       ├── hooks/useLiveUpdates.ts    SignalR subscription + polling fallback
│       └── types/job.ts
└── BackgroundJobProcessor.sln
```

---

## C. Database Schema

**Job**

| Column | Type | Notes |
|---|---|---|
| Id | GUID (PK) | |
| JobType | string | e.g. `FlakyJob` |
| Payload | string (JSON) | free-form, interpreted by the handler |
| Status | string | `QUEUED`\|`PROCESSING`\|`COMPLETED`\|`FAILED`\|`RETRYING`\|`DEAD_LETTER`\|`CANCELLED` |
| RetryCount / MaxRetries | int | |
| Priority | int | reserved for future use |
| CreatedAt / UpdatedAt / StartedAt / CompletedAt / LastAttemptAt / NextRetryAt | datetime? | |
| LastError / FailureReason | string? | |

**JobAttempt** (one row per execution attempt — the full history, not just the last error)

| Column | Type | Notes |
|---|---|---|
| Id | GUID (PK) | |
| JobId | GUID (FK -> Job, cascade delete) | |
| AttemptNumber | int | 1-based |
| StartedAt / CompletedAt | datetime | |
| Outcome | string | `COMPLETED` \| `FAILED` |
| ErrorMessage / StackTrace | string? | |
| DurationMs | long? | |

**DeadLetterJob** (created once, when a job exceeds `MaxRetries` — the original `Job` row is
never deleted)

| Column | Type | Notes |
|---|---|---|
| Id | GUID (PK) | |
| OriginalJobId | GUID | points back at the `Job` (not a hard FK, so the record survives independently) |
| JobType / Payload | | copied at time of failure |
| RetryCount / MaxRetries | int | |
| FinalError / FailureReason | string | |
| CreatedAt / DeadLetteredAt | datetime | |

```
Job (1) ----< JobAttempt (many)
Job (1) ----o DeadLetterJob (0 or 1, by OriginalJobId)
```

---

## D. API Endpoint Table

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/jobs/types` | Registered demo job types |
| POST | `/api/jobs` | Create + enqueue a job → `201 Created` |
| GET | `/api/jobs?status=&jobType=&page=&pageSize=` | Paged, filterable job list |
| GET | `/api/jobs/stats` | Dashboard counters + success rate + avg processing time |
| GET | `/api/jobs/{id}` | Full job detail incl. attempt history |
| GET | `/api/jobs/{id}/attempts` | Just the attempt history |
| POST | `/api/jobs/{id}/cancel` | Cancel a `QUEUED`/`RETRYING` job → `204`; `409` if not cancellable |
| GET | `/api/dead-letters?page=&pageSize=` | Paged dead-letter list |
| GET | `/api/dead-letters/{id}` | Dead-letter detail + full attempt history |
| POST | `/api/dead-letters/{id}/requeue` | Clone as a brand-new job (see below) → `201` |
| GET | `/api/system` | Live pipeline view: what each worker is running, queue depth, last retry scan, retry policy + backoff schedule |

SignalR (`/hubs/jobs`) pushes `jobChanged`, `statsChanged`, and `workersChanged` (a worker/queue
snapshot sent whenever a worker picks up or finishes a job, or the retry scanner re-queues
something). Worker activity is tracked in memory by `WorkerActivityTracker` for observability
only; nothing in the processing path reads it.

Errors use `ProblemDetails` (`400` invalid input, `404` not found, `409` invalid state
transition, `500` unhandled — generic, no stack traces leaked). Full request/response schemas
are in Swagger at `/swagger`, and runnable examples are in
[`backend/JobProcessor.Api.http`](backend/JobProcessor.Api.http).

**Requeue semantics:** requeuing a dead-lettered job does **not** resurrect the original row —
it creates a **new** job (fresh ID, `RetryCount` reset to 0) with the same job type and payload,
and enqueues it immediately. The original `Job` and its `DeadLetterJob` record are left exactly
as they were, so the failure history stays intact and auditable.

---

## E. Job State Transition Diagram

```
                 ┌────────┐
   POST /jobs -> │ QUEUED │
                 └───┬────┘
                     │ worker claims it
                     v
               ┌────────────┐
        ┌──────│ PROCESSING │──────┐
        │      └────────────┘      │
   success                      exception
        │                           │
        v                           v
  ┌───────────┐               ┌────────┐
  │ COMPLETED │               │ FAILED │  (transient - immediately re-evaluated below)
  └───────────┘               └───┬────┘
                                   │
                     retries < MaxRetries?
                    ┌──────yes───────┴───────no──────┐
                    v                                 v
              ┌───────────┐                    ┌─────────────┐
              │ RETRYING  │                    │ DEAD_LETTER │ (+ DeadLetterJob row persisted)
              │(NextRetryAt│                   └─────────────┘
              │  scheduled)│
              └─────┬─────┘
                    │ RetryScannerService re-enqueues once due
                    v
               PROCESSING (loop)

   QUEUED or RETRYING ──(POST /cancel)──> CANCELLED  (terminal; PROCESSING jobs cannot be cancelled)
```

`FAILED` is a real, logged, momentary status (you'll see it in the logs and in the attempt
record) that `JobService.RecordFailureAsync` immediately resolves into either `RETRYING` or
`DEAD_LETTER` in the same call — so the database is never left sitting in an ambiguous `FAILED`
state.

---

## F. Retry / Backoff Explanation

Exponential backoff, configured in `appsettings.json` under `RetrySettings` and bound via the
Options pattern (`backend/Configuration/RetrySettings.cs`, applied in
`backend/Services/RetryPolicy.cs`):

```
delay = min(InitialDelaySeconds * BackoffMultiplier ^ (failureCount - 1), MaxDelaySeconds)
```

With the shipped defaults (`InitialDelaySeconds=2`, `BackoffMultiplier=2`, `MaxDelaySeconds=60`):

| Failure # | Delay |
|---|---|
| 1 | 2s |
| 2 | 4s |
| 3 | 8s |
| 4 | 16s |
| 5 | 32s |
| 6+ | 60s (capped) |

Optional jitter (`UseJitter: true`) multiplies the delay by a random factor in `[0.8, 1.2]` to
avoid synchronized retry storms if many jobs fail at once. It's **off by default** so demo
timing stays predictable and easy to narrate live.

A failed job is never put back on the queue immediately — `RecordFailureAsync` persists
`NextRetryAt` and sets status to `RETRYING`. `RetryScannerService` polls once a second for
`RETRYING` jobs whose `NextRetryAt` has passed and re-enqueues them. This is also what makes
[restart recovery](#application-restart-behavior) fall out almost for free.

`MaxRetries` is configurable two ways: a server-wide default (`RetrySettings:MaxRetries`, `5`),
and an optional per-job override (`POST /api/jobs { "maxRetries": 2 }`) — handy for demoing
dead-lettering quickly without waiting through 5 full backoff cycles.

---

## G. Setup Instructions

**Prerequisites:** .NET 8 SDK (or newer), Node.js 20+, npm.

```bash
# Terminal 1 - backend
cd backend
dotnet restore
dotnet ef database update   # applies migrations, creates jobprocessor.db (SQLite)
dotnet run
```

The backend listens on **http://localhost:5080** (fixed in `Properties/launchSettings.json` so
there's no HTTPS dev-certificate prompt to deal with) and opens Swagger automatically.
Migrations also apply automatically on every startup (`db.Database.Migrate()` in `Program.cs`),
so `dotnet ef database update` above is a convenience, not a hard requirement.

```bash
# Terminal 2 - frontend
cd frontend
npm install
npm run dev
```

The dashboard is at **http://localhost:5173**. It talks to the API at the URL in
`frontend/.env` (`VITE_API_BASE_URL=http://localhost:5080`) — change that if you run the
backend on a different port.

If you don't have the `dotnet-ef` tool installed globally:

```bash
dotnet tool install --global dotnet-ef
```

### Running the tests

```bash
cd backend.Tests
dotnet test
```

(or `dotnet test` from the repo root — both projects are registered in
`BackgroundJobProcessor.sln`.)

### Docker

Not included. SQLite + `dotnet run` / `npm run dev` is already a zero-infrastructure setup, and
the problem statement explicitly says Docker is optional and shouldn't be allowed to compromise
the core project — so it was left out to keep the guaranteed-to-run surface area small for a
timed hackathon judge.

---

## H. Demo Instructions

**Fastest walkthrough:** open **Live Pipeline** and press **Run demo**. It submits a mix of jobs
that succeed, retry, run long, and dead-letter. The diagram shows which worker is running which
job, retry countdowns, and the retry loop back to the queue, and the activity log narrates each
backend step. The "How it works" section at the bottom names the class behind every stage.

1. **Open the dashboard** (http://localhost:5173) — empty stats, empty job table.
2. **Create Job -> SuccessfulJob -> Create Job.** Watch it go `QUEUED -> PROCESSING ->
   COMPLETED` in under a second (live via SignalR, no refresh needed).
3. **Create Job -> FlakyJob**, Failures Before Success = `2`. Watch:
   `QUEUED -> PROCESSING -> RETRYING (2s) -> PROCESSING -> RETRYING (4s) -> PROCESSING ->
   COMPLETED`. Open the job's detail page and show the 3-row attempt history (2 failed, 1
   succeeded) with real error messages and durations.
4. **Create Job -> AlwaysFailJob**, Max Retries override = `2` (so the demo doesn't take a full
   minute). Watch it exhaust its retries and land on `DEAD_LETTER`.
5. **Open Dead Letters.** Show the failure reason, final error, and retry count. Click
   **Requeue** — a brand-new job appears in the Jobs list, `QUEUED` again.
6. **Cancel a job:** create a `DelayedJob` with a long delay, then cancel it from the Jobs list
   while it's still `QUEUED`.
7. **(Optional) Restart recovery:** while a `FlakyJob` is sitting in `RETRYING`, stop the
   backend (`Ctrl+C`) and `dotnet run` it again. On boot, the logs show the retry scanner
   recovering it and it resumes right where it left off.

---

## I. Testing Checklist

Automated (`backend.Tests`, 21 tests, `dotnet test`):

- [x] Successful job completes and persists one `COMPLETED` attempt
- [x] Failed job under `MaxRetries` is scheduled for retry with the correct backoff delay
- [x] Exponential backoff calculation (2s/4s/8s/16s/32s, cap, jitter range, non-positive input)
- [x] Job exceeding `MaxRetries` transitions to `DEAD_LETTER` and creates a `DeadLetterJob` row
- [x] Attempt history persists in order and is queryable via `GetJobAsync`
- [x] Invalid/unknown job type is rejected (`ArgumentException` -> `400`)
- [x] Valid job-status transitions: `Queued -> Processing`, reject claiming an already-terminal
      job, `Queued/Retrying -> Cancelled`, reject cancelling a `Processing` job
- [x] Demo job handlers behave as documented (`FlakyJob` fails N times then succeeds,
      `AlwaysFailJob` always throws)

Manual (via the dashboard or Swagger):

- [ ] Create one of each demo job type and confirm it behaves as described in its tooltip
- [ ] Filter the Jobs page by status and by job type
- [ ] Confirm the dashboard updates within ~1s of a status change without a manual refresh
- [ ] Kill the SignalR connection (e.g. block WS in devtools) and confirm the 5s poll still
      keeps the UI correct
- [ ] Restart the backend mid-retry and confirm the job resumes (see demo step 7)
- [ ] Submit a job with an unregistered `jobType` via `POST /api/jobs` and confirm `400`
- [ ] Cancel a `PROCESSING` job and confirm `409`

---

## J. Requirement-to-Implementation Mapping

| Requirement | Where |
|---|---|
| ASP.NET Core backend | `backend/` (.NET 8 Web API) |
| BackgroundService / IHostedService | `Workers/JobWorker.cs`, `Workers/RetryScannerService.cs` |
| Job queue / processing mechanism | `Queue/BackgroundJobQueue.cs` (`Channel<Guid>`) |
| Retry failed jobs | `JobService.RecordFailureAsync` |
| Exponential backoff | `Services/RetryPolicy.cs` |
| Configurable max retry count | `appsettings.json: RetrySettings.MaxRetries` + per-job override |
| Dead-letter storage | `Models/DeadLetterJob.cs`, persisted in `RecordFailureAsync` |
| Status API | `GET /api/jobs`, `/api/jobs/{id}`, `/api/jobs/stats` |
| React dashboard | `frontend/` |
| Display job state | `StatusBadge`, `JobTable`, `JobDetailsPage` |
| Display job failures and details | `AttemptTable`, `JobDetailsPage`, `DeadLetterDetailsPage` |
| Persist job and dead-letter information | EF Core + SQLite, `Migrations/` |

---

## K. Known Limitations

- **Concurrency is single-process.** The in-flight tracking in `BackgroundJobQueue` (a
  `ConcurrentDictionary<Guid, byte>`) prevents a job from being processed twice *within this
  process*. It is **not** a distributed lock — if this were ever scaled to multiple instances
  sharing one database, two instances could both claim the same due retry at the same instant.
  Fixing that would need a real distributed lock or a claim-with-optimistic-concurrency-token
  pattern on the `Job` row; out of scope for a single-process hackathon build.
- **SQLite under concurrent writes.** WAL mode is enabled at startup to reduce `SQLITE_BUSY`
  contention across the 3 worker tasks + retry scanner, but SQLite still serializes writers.
  Fine at demo scale; a real production deployment would use PostgreSQL/SQL Server.
- **Startup recovery treats every stuck `PROCESSING` job as a failed attempt** (with a
  synthetic "interrupted by restart" error). This is simple and honest, but means a job that
  was actually 99% done when the process died still restarts from attempt N+1, not from where
  it left off — there's no checkpointing within a single attempt.
- **No auth.** Deliberately out of scope per the problem statement ("this is not primarily an
  authentication project").
- **SignalR has no per-job grouping** — every client receives every event and refetches; fine
  at demo volume, would want scoped SignalR groups per job/page at real scale.

## L. Suggestions for Optional Enhancements

- Distributed locking (e.g. a `ClaimedBy`/`ClaimedAt` column with optimistic concurrency) if
  this ever needs to run as more than one instance.
- Priority-aware dequeueing (the `Priority` column exists on `Job` but isn't used to order the
  queue yet).
- Per-job-type concurrency limits (e.g. cap `DelayedJob` to 1 concurrent execution).
- Recharts-based time-series charts (throughput/latency over time) once there's enough history
  to make them interesting — today's status-distribution bar is enough for a fresh demo dataset.
