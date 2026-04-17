import { describe, it, expect } from "vitest";
import {
  OptionLetterSchema,
  ContentStatusSchema,
  SessionModeSchema,
  GenreSchema,
  IngestJobStatusSchema,
} from "./enums.js";

describe("OptionLetterSchema", () => {
  it("accepts A B C D", () => {
    for (const l of ["A", "B", "C", "D"]) {
      expect(OptionLetterSchema.safeParse(l).success).toBe(true);
    }
  });
  it("rejects E", () => {
    expect(OptionLetterSchema.safeParse("E").success).toBe(false);
  });
  it("rejects lowercase", () => {
    expect(OptionLetterSchema.safeParse("a").success).toBe(false);
  });
});

describe("ContentStatusSchema", () => {
  it("accepts the 4 lifecycle states", () => {
    for (const s of ["draft", "pending_review", "published", "archived"]) {
      expect(ContentStatusSchema.safeParse(s).success).toBe(true);
    }
  });
  it("rejects unknown status", () => {
    expect(ContentStatusSchema.safeParse("rejected").success).toBe(false);
  });
});

describe("SessionModeSchema", () => {
  it("accepts practice and test", () => {
    expect(SessionModeSchema.safeParse("practice").success).toBe(true);
    expect(SessionModeSchema.safeParse("test").success).toBe(true);
  });
  it("rejects other modes", () => {
    expect(SessionModeSchema.safeParse("warmup").success).toBe(false);
  });
});

describe("GenreSchema", () => {
  it("accepts fiction and non-fiction only", () => {
    expect(GenreSchema.safeParse("fiction").success).toBe(true);
    expect(GenreSchema.safeParse("non-fiction").success).toBe(true);
    expect(GenreSchema.safeParse("poetry").success).toBe(false);
  });
});

describe("IngestJobStatusSchema", () => {
  it("accepts all 4 job states", () => {
    for (const s of ["pending", "running", "completed", "failed"]) {
      expect(IngestJobStatusSchema.safeParse(s).success).toBe(true);
    }
  });
});
