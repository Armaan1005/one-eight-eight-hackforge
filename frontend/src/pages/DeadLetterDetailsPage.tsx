import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../services/api";
import { AttemptTimeline } from "../components/AttemptTimeline";
import { Button, CodeBlock, EmptyState, IconBadge, KeyValue, LoadingState, PageHeader, Section } from "../components/ui";
import { useToast } from "../components/Toast";
import { jobTypeMeta } from "../lib/meta";
import { errorMessage, formatDateTime, prettyJson, shortId } from "../lib/format";
import type { DeadLetter } from "../types/job";

export function DeadLetterDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [dl, setDl] = useState<DeadLetter | null>(null);
  const [loading, setLoading] = useState(true);
  const [requeueing, setRequeueing] = useState(false);
  const { showToast } = useToast();
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      setDl(await api.getDeadLetter(id));
    } catch (e) {
      showToast(errorMessage(e, "Failed to load dead letter"), "error");
    } finally {
      setLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRequeue = async () => {
    if (!id) return;
    setRequeueing(true);
    try {
      const job = await api.requeueDeadLetter(id);
      showToast("Requeued as a new job", "success");
      navigate(`/jobs/${job.id}`);
    } catch (e) {
      showToast(errorMessage(e, "Failed to requeue"), "error");
    } finally {
      setRequeueing(false);
    }
  };

  if (loading) return <LoadingState />;
  if (!dl) return <EmptyState icon="archive" title="Not found" description="This dead letter doesn't exist." />;

  const meta = jobTypeMeta(dl.jobType);

  return (
    <div className="space-y-8">
      <PageHeader
        back={{ to: "/dead-letters", label: "Dead Letters" }}
        title={
          <span className="flex items-center gap-3">
            <IconBadge icon={meta.icon} tone={meta.tone} size="lg" solid />
            {meta.title}
          </span>
        }
        subtitle={
          <>
            Original job{" "}
            <Link to={`/jobs/${dl.originalJobId}`} className="font-mono text-[13px] text-sys-blue hover:underline">
              {shortId(dl.originalJobId)}
            </Link>{" "}
            · {dl.failureReason}
          </>
        }
        actions={
          <Button icon="retry" onClick={handleRequeue} loading={requeueing}>
            Requeue as new job
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Section title={`All ${dl.attempts.length} attempts`}>
          <AttemptTimeline attempts={dl.attempts} />
        </Section>

        <div className="space-y-8">
          <Section title="Details">
            <div className="pl-4">
              <KeyValue label="Attempts" value={`${dl.retryCount} / ${dl.maxRetries}`} />
              <KeyValue label="Created" value={formatDateTime(dl.createdAt)} />
              <KeyValue label="Dead-lettered" value={formatDateTime(dl.deadLetteredAt)} />
            </div>
          </Section>
          <Section title="Final error">
            <p className="p-4 font-mono text-[12.5px] leading-relaxed text-sys-red">{dl.finalError ?? "—"}</p>
          </Section>
          <Section title="Payload">
            <div className="p-3">
              <CodeBlock className="max-h-48">{prettyJson(dl.payload)}</CodeBlock>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
