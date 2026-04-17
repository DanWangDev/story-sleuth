import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  createRequireHubService,
  type HubServiceClaims,
} from "./service-auth.js";

function appWith(verifyFn: (t: string) => Promise<HubServiceClaims>) {
  const app = express();
  const guard = createRequireHubService(
    { issuer: "https://example.test", audience: "reading" },
    { verify_fn: verifyFn },
  );
  app.get("/ping", guard, (req, res) => {
    res.json({ ok: true, sub: req.service_auth?.sub ?? null });
  });
  return app;
}

describe("createRequireHubService", () => {
  it("rejects requests with no Authorization header", async () => {
    const verify = vi.fn();
    const res = await request(appWith(verify)).get("/ping");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing_bearer_token");
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects malformed Authorization headers", async () => {
    const verify = vi.fn();
    const res = await request(appWith(verify))
      .get("/ping")
      .set("Authorization", "NotBearer abc");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing_bearer_token");
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects tokens whose signature the verifier rejects", async () => {
    const verify = vi.fn(async () => {
      throw new Error("JWSSignatureVerificationFailed");
    });
    const res = await request(appWith(verify))
      .get("/ping")
      .set("Authorization", "Bearer bogus");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_service_token");
    expect(verify).toHaveBeenCalledWith("bogus");
  });

  it("rejects tokens with the wrong sub (not hub-service)", async () => {
    const verify = vi.fn(
      async (): Promise<HubServiceClaims> => ({
        iss: "https://example.test",
        aud: "reading",
        sub: "user-42", // NOT hub-service — a user token can't be replayed
      }),
    );
    const res = await request(appWith(verify))
      .get("/ping")
      .set("Authorization", "Bearer user-token");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("wrong_token_subject");
    expect(res.body.expected).toBe("hub-service");
  });

  it("accepts tokens signed by the hub with sub=hub-service", async () => {
    const verify = vi.fn(
      async (): Promise<HubServiceClaims> => ({
        iss: "https://example.test",
        aud: "reading",
        sub: "hub-service",
      }),
    );
    const res = await request(appWith(verify))
      .get("/ping")
      .set("Authorization", "Bearer valid-service-token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, sub: "hub-service" });
    expect(verify).toHaveBeenCalledWith("valid-service-token");
  });

  it("honours a custom expected_sub", async () => {
    const app = express();
    const guard = createRequireHubService(
      {
        issuer: "https://example.test",
        audience: "reading",
        expected_sub: "hub-parent-dashboard",
      },
      {
        verify_fn: async () => ({
          iss: "https://example.test",
          aud: "reading",
          sub: "hub-parent-dashboard",
        }),
      },
    );
    app.get("/ping", guard, (_req, res) => res.json({ ok: true }));
    const res = await request(app)
      .get("/ping")
      .set("Authorization", "Bearer t");
    expect(res.status).toBe(200);
  });
});
