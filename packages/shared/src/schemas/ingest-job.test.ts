import { describe, it, expect } from "vitest";
import { IngestJobSchema } from "./ingest-job.js";

const validJob = {
  id: "11111111-1111-4111-8111-111111111111",
  passage_manifest_id: 1,
  triggered_by_user_id: 2,
  status: "completed" as const,
  questions_generated: 8,
  questions_failed: 0,
  started_at: "2026-04-17T10:00:00.000Z",
  completed_at: "2026-04-17T10:02:30.000Z",
  error_log: null,
};

describe("IngestJobSchema", () => {
  it("accepts a completed job", () => {
    expect(IngestJobSchema.safeParse(validJob).success).toBe(true);
  });

  it("accepts a running job (no completed_at yet)", () => {
    expect(
      IngestJobSchema.safeParse({
        ...validJob,
        status: "running",
        completed_at: null,
      }).success,
    ).toBe(true);
  });

  it("accepts a failed job with error_log set", () => {
    expect(
      IngestJobSchema.safeParse({
        ...validJob,
        status: "failed",
        questions_generated: 0,
        questions_failed: 8,
        completed_at: "2026-04-17T10:01:00.000Z",
        error_log: "Gutenberg returned 503 after 3 retries",
      }).success,
    ).toBe(true);
  });

  it("rejects negative generated count", () => {
    expect(
      IngestJobSchema.safeParse({ ...validJob, questions_generated: -1 })
        .success,
    ).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(
      IngestJobSchema.safeParse({ ...validJob, status: "cancelled" }).success,
    ).toBe(false);
  });
});
