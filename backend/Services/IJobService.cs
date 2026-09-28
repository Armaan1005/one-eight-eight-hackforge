using JobProcessor.Api.DTOs;
using JobProcessor.Api.Models;

namespace JobProcessor.Api.Services;

public interface IJobService
{
    // Public API-facing operations
    Task<JobResponse> CreateJobAsync(CreateJobRequest request, CancellationToken ct = default);
    Task<JobDetailResponse?> GetJobAsync(Guid id, CancellationToken ct = default);
    Task<List<JobAttemptResponse>> GetJobAttemptsAsync(Guid id, CancellationToken ct = default);
    Task<PagedResult<JobResponse>> ListJobsAsync(string? status, string? jobType, int page, int pageSize, CancellationToken ct = default);
    Task<StatsResponse> GetStatsAsync(CancellationToken ct = default);
    Task<bool> CancelJobAsync(Guid id, CancellationToken ct = default);

    Task<PagedResult<DeadLetterResponse>> ListDeadLettersAsync(int page, int pageSize, CancellationToken ct = default);
    Task<DeadLetterResponse?> GetDeadLetterAsync(Guid id, CancellationToken ct = default);
    Task<JobResponse?> RequeueDeadLetterAsync(Guid id, CancellationToken ct = default);
    Task<int> ClearFinishedJobsAsync(CancellationToken ct = default);

    // Worker-facing lifecycle operations
    Task<Job?> ClaimForProcessingAsync(Guid jobId, CancellationToken ct = default);
    Task RecordSuccessAsync(Guid jobId, int attemptNumber, DateTime startedAt, DateTime completedAt, long durationMs, CancellationToken ct = default);
    Task RecordFailureAsync(Guid jobId, int attemptNumber, DateTime startedAt, DateTime completedAt, long? durationMs, string errorMessage, string? stackTrace, CancellationToken ct = default);
}
