import { describe, it, expect } from "vitest";
import { UserMappingSchema } from "./user-mapping.js";

describe("UserMappingSchema", () => {
  it("accepts a valid mapping", () => {
    expect(
      UserMappingSchema.safeParse({
        id: 1,
        hub_user_id: "oidc-sub-12345",
        created_at: "2026-04-17T10:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects empty hub_user_id", () => {
    expect(
      UserMappingSchema.safeParse({
        id: 1,
        hub_user_id: "",
        created_at: "2026-04-17T10:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects non-positive id", () => {
    expect(
      UserMappingSchema.safeParse({
        id: 0,
        hub_user_id: "x",
        created_at: "2026-04-17T10:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects malformed created_at", () => {
    expect(
      UserMappingSchema.safeParse({
        id: 1,
        hub_user_id: "x",
        created_at: "yesterday",
      }).success,
    ).toBe(false);
  });
});
