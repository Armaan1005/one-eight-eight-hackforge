using JobProcessor.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace JobProcessor.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Job> Jobs => Set<Job>();
    public DbSet<JobAttempt> JobAttempts => Set<JobAttempt>();
    public DbSet<DeadLetterJob> DeadLetterJobs => Set<DeadLetterJob>();

    // SQLite has no timezone-aware type, so DateTimes come back as Kind=Unspecified and would be
    // serialized without a "Z". Every timestamp in this app is written as UTC, so tag it on read.
    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
    }

    private sealed class UtcDateTimeConverter : Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateTime, DateTime>
    {
        public UtcDateTimeConverter()
            : base(v => v.Kind == DateTimeKind.Local ? v.ToUniversalTime() : v, v => DateTime.SpecifyKind(v, DateTimeKind.Utc))
        {
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Job>(entity =>
        {
            entity.HasKey(j => j.Id);
            entity.Property(j => j.Status)
                .HasConversion(s => s.ToWire(), s => JobStatusNames.FromWire(s))
                .HasMaxLength(20);
            entity.Property(j => j.JobType).IsRequired().HasMaxLength(100);
            entity.HasIndex(j => j.Status);
            entity.HasIndex(j => j.JobType);
            entity.HasIndex(j => j.NextRetryAt);
            entity.HasMany(j => j.Attempts)
                .WithOne(a => a.Job)
                .HasForeignKey(a => a.JobId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<JobAttempt>(entity =>
        {
            entity.HasKey(a => a.Id);
            entity.Property(a => a.Outcome)
                .HasConversion(o => o.ToWire(), o => AttemptOutcomeNames.FromWire(o))
                .HasMaxLength(20);
            entity.HasIndex(a => new { a.JobId, a.AttemptNumber });
        });

        modelBuilder.Entity<DeadLetterJob>(entity =>
        {
            entity.HasKey(d => d.Id);
            entity.HasIndex(d => d.OriginalJobId);
            entity.Property(d => d.JobType).IsRequired().HasMaxLength(100);
        });
    }
}
