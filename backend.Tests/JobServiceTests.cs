using JobProcessor.Api.Configuration;
using JobProcessor.Api.Data;
using JobProcessor.Api.DTOs;
using JobProcessor.Api.Jobs;
using JobProcessor.Api.Models;
using JobProcessor.Api.Services;
using JobProcessor.Api.Tests.Fakes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace JobProcessor.Api.Tests;

public class JobServiceTests
{
    private sealed class StubHandler : IJobHandler
    {
        public string JobType => "TestJob";
        public Task ExecuteAsync(JobExecutionContext context, CancellationToken ct) => Task.CompletedTask;
    }

    private static (JobService Service, AppDbContext Db, FakeBackgroundJobQueue Queue, FakeJobEventNotifier Notifier) CreateService(RetrySettings? retrySettings = null)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        var db = new AppDbContext(options);

        var registry = new JobHandlerRegistry(new IJobHandler[] { new StubHandler() });
        var queue = new FakeBackgroundJobQueue();
        var notifier = new FakeJobEventNotifier();
        var settings = retrySettings ?? new RetrySettings { MaxRetries = 3, InitialDelaySeconds = 2, BackoffMultiplier = 2, MaxDelaySeconds = 60 };
        var retryPolicy = new RetryPolicy(Options.Create(settings));

        var service = new JobService(
            db, registry, queue, retryPolicy, Options.Create(settings), notifier,
            NullLogger<JobService>.Instance);

        return (service, db, queue, notifier);
    }

    [Fact]
    public async Task CreateJobAsync_UnknownJobType_Throws()
    {
        var (service, _, _, _) = CreateService();
        var request = new CreateJobRequest { JobType = "NotRegistered" };

        await Assert.ThrowsAsync<ArgumentException>(() => service.CreateJobAsync(request));
    }

    [Fact]
    public async Task CreateJobAsync_ValidRequest_PersistsQueuedJobAndEnqueues()
    {
        var (service, db, queue, notifier) = CreateService();
        var request = new CreateJobRequest { JobType = "TestJob" };

        var response = await service.CreateJobAsync(request);

        Assert.Equal("QUEUED", response.Status);
        Assert.Single(queue.Enqueued);
        Assert.Equal(response.Id, queue.Enqueued[0]);
        Assert.Equal(1, notifier.StatsChangedCount);

        var stored = await db.Jobs.FindAsync(response.Id);
        Assert.NotNull(stored);
        Assert.Equal(JobStatus.Queued, stored!.Status);
    }

    [Fact]
    public async Task ClaimForProcessingAsync_QueuedJob_MarksProcessingAndSetsStartedAt()
    {
        var (service, db, _, _) = CreateService();
        var job = new Job { JobType = "TestJob", MaxRetries = 3 };
        db.Jobs.Add(job);
        await db.SaveChangesAsync();

        var claimed = await service.ClaimForProcessingAsync(job.Id);

        Assert.NotNull(claimed);
        Assert.Equal(JobStatus.Processing, claimed!.Status);
        Assert.NotNull(claimed.StartedAt);
    }

    [Fact]
    public async Task ClaimForProcessingAsync_AlreadyCompletedJob_ReturnsNull()
    {
        var (service, db, _, _) = CreateService();
        var job = new Job { JobType = "TestJob", MaxRetries = 3, Status = JobStatus.Completed };
        db.Jobs.Add(job);
        await db.SaveChangesAsync();

        var claimed = await service.ClaimForProcessingAsync(job.Id);

        Assert.Null(claimed);
    }

    [Fact]
    public async Task RecordSuccessAsync_MarksCompletedAndPersistsAttempt()
    {
        var (service, db, _, _) = CreateService();
        var job = new Job { JobType = "TestJob", MaxRetries = 3, Status = JobStatus.Processing, StartedAt = DateTime.UtcNow };
        db.Jobs.Add(job);
        await db.SaveChangesAsync();

        var started = DateTime.UtcNow;
        await service.RecordSuccessAsync(job.Id, 1, started, started.AddSeconds(1), 1000);

        var updated = await db.Jobs.Include(j => j.Attempts).FirstAsync(j => j.Id == job.Id);
        Assert.Equal(JobStatus.Completed, updated.Status);
        Assert.NotNull(updated.CompletedAt);
        Assert.Single(updated.Attempts);
        Assert.Equal(AttemptOutcome.Succeeded, updated.Attempts[0].Outcome);
    }

    [Fact]
    public async Task RecordFailureAsync_UnderMaxRetries_SchedulesRetryWithBackoff()
    {
        var (service, db, _, _) = CreateService(new RetrySettings { MaxRetries = 3, InitialDelaySeconds = 2, BackoffMultiplier = 2, MaxDelaySeconds = 60 });
        var job = new Job { JobType = "TestJob", MaxRetries = 3, Status = JobStatus.Processing };
        db.Jobs.Add(job);
        await db.SaveChangesAsync();

        var now = DateTime.UtcNow;
        await service.RecordFailureAsync(job.Id, 1, now, now, 100, "boom", null);

        var updated = await db.Jobs.Include(j => j.Attempts).FirstAsync(j => j.Id == job.Id);
        Assert.Equal(JobStatus.Retrying, updated.Status);
        Assert.Equal(1, updated.RetryCount);
        Assert.NotNull(updated.NextRetryAt);
        var delaySeconds = (updated.NextRetryAt!.Value - now).TotalSeconds;
        Assert.InRange(delaySeconds, 1.5, 2.5); // ~2s for the first failure
        Assert.Single(updated.Attempts);
    }

    [Fact]
    public async Task RecordFailureAsync_ExceedsMaxRetries_MovesToDeadLetter()
    {
        var (service, db, _, _) = CreateService(new RetrySettings { MaxRetries = 2, InitialDelaySeconds = 1, BackoffMultiplier = 2, MaxDelaySeconds = 60 });
        var job = new Job { JobType = "TestJob", MaxRetries = 2, Status = JobStatus.Processing };
        db.Jobs.Add(job);
        await db.SaveChangesAsync();

        var now = DateTime.UtcNow;
        await service.RecordFailureAsync(job.Id, 1, now, now, 100, "boom 1", null);
        await service.RecordFailureAsync(job.Id, 2, now, now, 100, "boom 2", null);

        var updated = await db.Jobs.FirstAsync(j => j.Id == job.Id);
        Assert.Equal(JobStatus.DeadLetter, updated.Status);

        var deadLetter = await db.DeadLetterJobs.FirstOrDefaultAsync(d => d.OriginalJobId == job.Id);
        Assert.NotNull(deadLetter);
        Assert.Equal("boom 2", deadLetter!.FinalError);
        Assert.Equal(2, deadLetter.RetryCount);
    }

    [Fact]
    public async Task CancelJobAsync_QueuedJob_Cancels()
    {
        var (service, db, _, _) = CreateService();
        var job = new Job { JobType = "TestJob", MaxRetries = 3, Status = JobStatus.Queued };
        db.Jobs.Add(job);
        await db.SaveChangesAsync();

        var result = await service.CancelJobAsync(job.Id);

        Assert.True(result);
        var updated = await db.Jobs.FirstAsync(j => j.Id == job.Id);
        Assert.Equal(JobStatus.Cancelled, updated.Status);
    }

    [Fact]
    public async Task CancelJobAsync_ProcessingJob_ThrowsInvalidOperationException()
    {
        var (service, db, _, _) = CreateService();
        var job = new Job { JobType = "TestJob", MaxRetries = 3, Status = JobStatus.Processing };
        db.Jobs.Add(job);
        await db.SaveChangesAsync();

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.CancelJobAsync(job.Id));
    }

    [Fact]
    public async Task GetJobAsync_ReturnsAttemptsOrderedByAttemptNumber()
    {
        var (service, db, _, _) = CreateService();
        var job = new Job { JobType = "TestJob", MaxRetries = 3, Status = JobStatus.Processing };
        db.Jobs.Add(job);
        db.JobAttempts.AddRange(
            new JobAttempt { JobId = job.Id, AttemptNumber = 2, StartedAt = DateTime.UtcNow, Outcome = AttemptOutcome.Failed },
            new JobAttempt { JobId = job.Id, AttemptNumber = 1, StartedAt = DateTime.UtcNow, Outcome = AttemptOutcome.Failed });
        await db.SaveChangesAsync();

        var detail = await service.GetJobAsync(job.Id);

        Assert.NotNull(detail);
        Assert.Equal(2, detail!.Attempts.Count);
        Assert.Equal(1, detail.Attempts[0].AttemptNumber);
        Assert.Equal(2, detail.Attempts[1].AttemptNumber);
    }
}
