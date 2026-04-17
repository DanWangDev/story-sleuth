import type {
  ContentStatus,
  IngestJob,
  Passage,
  PassageManifest,
  Question,
} from "@story-sleuth/shared";
import { apiFetch } from "./client.js";

/**
 * Client bindings for /api/admin/* endpoints. Every call here requires
 * an authenticated admin session — the backend enforces that, but if a
 * student ever hits these they'll get a 403 back and surface as an
 * ApiError the calling page can branch on.
 */

/** LLM settings ------------------------------------------------------ */

export type LLMProvider = "qwen" | "openai" | "anthropic";

export interface PublicProviderConfig {
  provider: LLMProvider;
  model: string | null;
  base_url: string | null;
  api_key_tail: string | null;
  updated_at: string | null;
}

export interface LlmConfigResponse {
  active_provider: LLMProvider | null;
  providers: PublicProviderConfig[];
}

export interface LlmConfigUpdate {
  active_provider?: LLMProvider;
  providers?: Array<{
    provider: LLMProvider;
    model?: string | null;
    base_url?: string | null;
    api_key?: string | null;
  }>;
}

export async function getLlmConfig(): Promise<LlmConfigResponse> {
  return apiFetch<LlmConfigResponse>("/api/admin/settings/llm");
}

export async function updateLlmConfig(
  update: LlmConfigUpdate,
): Promise<LlmConfigResponse> {
  return apiFetch<LlmConfigResponse>("/api/admin/settings/llm", {
    method: "PUT",
    body: update,
  });
}

/** Ingest ------------------------------------------------------------ */

export async function listManifests(): Promise<PassageManifest[]> {
  const r = await apiFetch<{ manifests: PassageManifest[] }>(
    "/api/admin/ingest/manifests",
  );
  return r.manifests;
}

export interface IngestRunInput {
  question_count?: number;
  exam_board?: "CEM" | "GL" | "ISEB";
  question_types?: string[];
}

export interface IngestRunResponse {
  job: IngestJob;
  passage_id: string | null;
  passage_version: number | null;
}

export async function triggerIngest(
  manifestId: number,
  input: IngestRunInput = {},
): Promise<IngestRunResponse> {
  return apiFetch<IngestRunResponse>(`/api/admin/ingest/${manifestId}`, {
    method: "POST",
    body: input,
  });
}

export async function listRecentJobs(limit = 20): Promise<IngestJob[]> {
  const r = await apiFetch<{ jobs: IngestJob[] }>(
    `/api/admin/ingest/jobs?limit=${limit}`,
  );
  return r.jobs;
}

export async function getJob(jobId: string): Promise<IngestJob> {
  const r = await apiFetch<{ job: IngestJob }>(
    `/api/admin/ingest/jobs/${jobId}`,
  );
  return r.job;
}

/** Content review ---------------------------------------------------- */

export async function listPendingPassages(): Promise<Passage[]> {
  const r = await apiFetch<{ passages: Passage[] }>(
    "/api/admin/content/passages/pending",
  );
  return r.passages;
}

export async function listPendingQuestions(): Promise<Question[]> {
  const r = await apiFetch<{ questions: Question[] }>(
    "/api/admin/content/questions/pending",
  );
  return r.questions;
}

export async function listQuestionsByPassage(
  passageId: string,
  version: number,
): Promise<Question[]> {
  const r = await apiFetch<{ questions: Question[] }>(
    `/api/admin/content/questions/by-passage/${passageId}/${version}`,
  );
  return r.questions;
}

export async function setPassageStatus(
  passageId: string,
  version: number,
  status: ContentStatus,
): Promise<Passage> {
  const r = await apiFetch<{ passage: Passage }>(
    `/api/admin/content/passages/${passageId}/${version}/status`,
    { method: "POST", body: { status } },
  );
  return r.passage;
}

export async function setQuestionStatus(
  questionId: string,
  status: ContentStatus,
): Promise<Question> {
  const r = await apiFetch<{ question: Question }>(
    `/api/admin/content/questions/${questionId}/status`,
    { method: "POST", body: { status } },
  );
  return r.question;
}
