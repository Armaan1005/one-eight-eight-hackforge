import { api } from "../services/api";

/** A mix that exercises every path through the pipeline in about 15 seconds. */
const DEMO_JOBS: { jobType: string; payload?: Record<string, unknown>; maxRetries?: number }[] = [
  { jobType: "SuccessfulJob" },
  { jobType: "DelayedJob", payload: { delaySeconds: 6 } },
  { jobType: "FlakyJob", payload: { failuresBeforeSuccess: 2 } },
  { jobType: "SuccessfulJob" },
  { jobType: "AlwaysFailJob", maxRetries: 3 },
  { jobType: "RandomFailureJob", payload: { failureRate: 0.5 } },
  { jobType: "SuccessfulJob" },
];

export async function runDemoScenario() {
  for (const job of DEMO_JOBS) {
    await api.createJob(job);
    await new Promise((r) => setTimeout(r, 220));
  }
  return DEMO_JOBS.length;
}
