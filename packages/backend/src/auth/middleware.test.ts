import { describe, it, expect, beforeAll } from "vitest";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import type { UserMapping } from "@story-sleuth/shared";
import type { UserMappingRepository } from "../repositories/interfaces/user-mapping-repository.js";
import { JwtVerifier } from "./jwt-verifier.js";
import { createRequireAuth, requireAdmin } from "./middleware.js";
import { makeTestSigner, type TestSigner } from "./test-helpers.js";

/** In-memory stand-in for the real Postgres user-mappings repo. */
class InMemoryUserMappingRepository implements UserMappingRepository {
  private readonly byId = new Map<number, UserMapping>();
  private readonly byHubId = new Map<string, UserMapping>();
  private nextId = 1;

  calls: { getOrCreate: string[] } = { getOrCreate: [] };

  async findById(id: number): Promise<UserMapping | null> {
    return this.byId.get(id) ?? null;
  }
  async findByHubUserId(hubUserId: string): Promise<UserMapping | null> {
    return this.byHubId.get(hubUserId) ?? null;
  }
  async getOrCreate(hubUserId: string): Promise<UserMapping> {
    this.calls.getOrCreate.push(hubUserId);
    const existing = this.byHubId.get(hubUserId);
    if (existing) return existing;
    const row: UserMapping = {
      id: this.nextId++,
      hub_user_id: hubUserId,
      created_at: new Date().toISOString(),
    };
    this.byId.set(row.id, row);
    this.byHubId.set(hubUserId, row);
    return row;
  }
}

describe("createRequireAuth / requireAdmin", () => {
  let signer: TestSigner;
  let verifier: JwtVerifier;
  let users: InMemoryUserMappingRepository;

  function makeApp(options: { required_app_slug?: string } = {}): express.Express {
    const app = express();
    const requireAuth = createRequireAuth({
      verifier,
      userMappings: users,
      required_app_slug: options.required_app_slug,
    });

    app.get("/api/whoami", requireAuth, (req, res) => {
      res.json({ user_id: req.auth!.user_id, sub: req.auth!.claims.sub });
    });

    app.get("/api/admin/ping", requireAuth, requireAdmin, (_req, res) => {
      res.json({ ok: true });
    });

    app.use(
      (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
        res.status(500).json({ error: err.message });
      },
    );
    return app;
  }

  beforeAll(async () => {
    signer = await makeTestSigner();
    verifier = new JwtVerifier({
      jwks: signer.jwks,
      issuer: signer.issuer,
      audience: signer.audience,
    });
    users = new InMemoryUserMappingRepository();
  });

  it("401 when no Authorization header is present", async () => {
    const res = await request(makeApp()).get("/api/whoami");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("missing_bearer_token");
  });

  it("401 when Authorization is not Bearer", async () => {
    const res = await request(makeApp())
      .get("/api/whoami")
      .set("Authorization", "Basic abc");
    expect(res.status).toBe(401);
  });

  it("401 when token is garbage", async () => {
    const res = await request(makeApp())
      .get("/api/whoami")
      .set("Authorization", "Bearer not-a-jwt");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_token");
  });

  it("401 when token is expired", async () => {
    const token = await signer.sign(
      { sub: "u-exp", role: "student" },
      { expiresIn: "-1m" },
    );
    const res = await request(makeApp())
      .get("/api/whoami")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.reason).toBe("expired");
  });

  it("200 for a valid student token, attaches user_id", async () => {
    const token = await signer.sign({ sub: "u-valid-1", role: "student" });
    const res = await request(makeApp())
      .get("/api/whoami")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.sub).toBe("u-valid-1");
    expect(typeof res.body.user_id).toBe("number");
  });

  it("subsequent requests for the same hub user reuse the same user_id", async () => {
    const t1 = await signer.sign({ sub: "u-stable", role: "student" });
    const t2 = await signer.sign({ sub: "u-stable", role: "student" });
    const r1 = await request(makeApp())
      .get("/api/whoami")
      .set("Authorization", `Bearer ${t1}`);
    const r2 = await request(makeApp())
      .get("/api/whoami")
      .set("Authorization", `Bearer ${t2}`);
    expect(r1.body.user_id).toBe(r2.body.user_id);
  });

  it("403 when required_app_slug is not in the token's apps claim", async () => {
    const token = await signer.sign({
      sub: "u-no-sub",
      role: "student",
      apps: ["writing"],
    });
    const res = await request(makeApp({ required_app_slug: "reading" }))
      .get("/api/whoami")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("subscription_required");
    expect(res.body.required_app).toBe("reading");
  });

  it("200 when required_app_slug IS in the token's apps claim", async () => {
    const token = await signer.sign({
      sub: "u-subbed",
      role: "student",
      apps: ["reading", "writing"],
    });
    const res = await request(makeApp({ required_app_slug: "reading" }))
      .get("/api/whoami")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("requireAdmin blocks a student token with 403", async () => {
    const token = await signer.sign({ sub: "u-stu", role: "student" });
    const res = await request(makeApp())
      .get("/api/admin/ping")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("admin_only");
  });

  it("requireAdmin allows admin role through", async () => {
    const token = await signer.sign({ sub: "u-admin-ok", role: "admin" });
    const res = await request(makeApp())
      .get("/api/admin/ping")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
