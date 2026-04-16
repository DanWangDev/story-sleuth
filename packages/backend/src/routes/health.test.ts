import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../index.js";

describe("GET /api/health", () => {
  it("returns 200 with ok status and service identifier", async () => {
    const app = createApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("story-sleuth-backend");
    expect(typeof res.body.timestamp).toBe("string");
  });
});
