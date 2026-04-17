import { afterEach, describe, expect, it } from "vitest";
import express, {
  type Request,
  type Response,
  type NextFunction,
  type RequestHandler,
} from "express";
import request from "supertest";
import {
  revokeSubject,
  unrevokeSubject,
  clearRevocations,
} from "@danwangdev/auth-client/server";
import type { HubUser } from "@danwangdev/auth-client/types";
import type { UserMapping } from "@story-sleuth/shared";
import type { UserMappingRepository } from "../repositories/interfaces/user-mapping-repository.js";
import { requireAdmin, type AuthContext } from "./middleware.js";

/**
 * These tests focus on the story-sleuth-specific pieces added on top of
 * auth-client (back-channel logout revocation check, subscription gate,
 * user_mappings.getOrCreate attach, admin guard). The underlying
 * auth-client session + cookie handling is covered by auth-client's own
 * suite and by writing-buddy's integration tests.
 *
 * We simulate the state auth-client would have produced (req.user set
 * from a decoded session cookie) by inlining a tiny pre-middleware that
 * injects a HubUser onto the request. Then we run the same logic our
 * real middleware runs AFTER auth-client has validated the session —
 * revocation check, subscription gate, user_id attach — via a
 * "post-auth" middleware factory that matches the production middleware
 * exactly.
 */

class InMemoryUserMappings implements UserMappingRepository {
  private byHub = new Map<string, UserMapping>();
  private next = 1;
  calls: string[] = [];

  async findById(id: number): Promise<UserMapping | null> {
    for (const m of this.byHub.values()) if (m.id === id) return m;
    return null;
  }
  async findByHubUserId(sub: string): Promise<UserMapping | null> {
    return this.byHub.get(sub) ?? null;
  }
  async getOrCreate(sub: string): Promise<UserMapping> {
    this.calls.push(sub);
    const existing = this.byHub.get(sub);
    if (existing) return existing;
    const row: UserMapping = {
      id: this.next++,
      hub_user_id: sub,
      created_at: new Date().toISOString(),
    };
    this.byHub.set(sub, row);
    return row;
  }
}

/**
 * Production-equivalent post-auth middleware. Factored out here so the
 * test can exercise it without needing auth-client's discoverOidc /
 * session-cookie machinery (which would require a live hub).
 *
 * Mirrors the logic in createRequireAuth — any divergence between this
 * and the real middleware is a bug.
 */
function postAuth(
  deps: { users: UserMappingRepository; required_app_slug?: string },
): RequestHandler {
  return async (req, res, next) => {
    const { isRevoked } = await import("@danwangdev/auth-client/server");
    const hubUser = req.user;
    if (!hubUser) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    if (isRevoked(hubUser.sub)) {
      res.status(401).json({ error: "session_revoked" });
      return;
    }
    if (deps.required_app_slug) {
      const apps = hubUser.apps ?? [];
      if (!apps.includes(deps.required_app_slug)) {
        res.status(403).json({
          error: "subscription_required",
          required_app: deps.required_app_slug,
        });
        return;
      }
    }
    try {
      const m = await deps.users.getOrCreate(hubUser.sub);
      (req as Request & { auth?: AuthContext }).auth = {
        user_id: m.id,
        claims: hubUser,
      };
    } catch (err) {
      next(err);
      return;
    }
    next();
  };
}

function injectUser(user: HubUser | null): RequestHandler {
  return (req, _res, next) => {
    if (user) req.user = user;
    next();
  };
}

function makeHubUser(overrides: Partial<HubUser> = {}): HubUser {
  return {
    sub: "hub-sub-default",
    email: "student@example.com",
    username: "student",
    display_name: "A Student",
    role: "student",
    plan: "reading",
    features: [],
    apps: ["reading"],
    ...overrides,
  } as HubUser;
}

function makeApp(options: {
  user: HubUser | null;
  users: UserMappingRepository;
  required_app_slug?: string;
}): express.Express {
  const app = express();
  app.get(
    "/whoami",
    injectUser(options.user),
    postAuth({ users: options.users, required_app_slug: options.required_app_slug }),
    (req, res) => {
      const auth = (req as Request & { auth?: AuthContext }).auth;
      res.json({ user_id: auth?.user_id, sub: auth?.claims.sub });
    },
  );
  app.get(
    "/admin-ping",
    injectUser(options.user),
    postAuth({ users: options.users, required_app_slug: options.required_app_slug }),
    requireAdmin,
    (_req, res) => res.json({ ok: true }),
  );
  app.use(
    (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
      res.status(500).json({ error: err.message });
    },
  );
  return app;
}

describe("post-auth middleware (user mapping, revocation, subscription, admin)", () => {
  afterEach(() => {
    clearRevocations();
  });

  it("401 when req.user is not set (session missing)", async () => {
    const users = new InMemoryUserMappings();
    const app = makeApp({ user: null, users });
    const res = await request(app).get("/whoami");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthenticated");
  });

  it("200 attaches user_id for a valid session", async () => {
    const users = new InMemoryUserMappings();
    const user = makeHubUser({ sub: "student-A" });
    const res = await request(makeApp({ user, users })).get("/whoami");
    expect(res.status).toBe(200);
    expect(res.body.sub).toBe("student-A");
    expect(typeof res.body.user_id).toBe("number");
  });

  it("same sub across requests reuses the same user_id (getOrCreate is idempotent)", async () => {
    const users = new InMemoryUserMappings();
    const user = makeHubUser({ sub: "student-same" });
    const r1 = await request(makeApp({ user, users })).get("/whoami");
    const r2 = await request(makeApp({ user, users })).get("/whoami");
    expect(r1.body.user_id).toBe(r2.body.user_id);
    expect(users.calls.filter((s) => s === "student-same").length).toBe(2);
  });

  it("401 with session_revoked after the hub back-channel logs the sub out", async () => {
    const users = new InMemoryUserMappings();
    const user = makeHubUser({ sub: "student-bcl" });
    const app = makeApp({ user, users });

    const before = await request(app).get("/whoami");
    expect(before.status).toBe(200);

    // Simulate a hub-initiated back-channel logout for this sub:
    // auth-client's revokeSubject() is what the BCL handler calls.
    revokeSubject("student-bcl");

    const after = await request(app).get("/whoami");
    expect(after.status).toBe(401);
    expect(after.body.error).toBe("session_revoked");
  });

  it("re-login clears the revocation and the session works again", async () => {
    const users = new InMemoryUserMappings();
    const user = makeHubUser({ sub: "student-relogin" });
    const app = makeApp({ user, users });

    revokeSubject("student-relogin");
    const blocked = await request(app).get("/whoami");
    expect(blocked.status).toBe(401);

    unrevokeSubject("student-relogin");
    const ok = await request(app).get("/whoami");
    expect(ok.status).toBe(200);
  });

  it("403 subscription_required when apps claim lacks the app slug", async () => {
    const users = new InMemoryUserMappings();
    const user = makeHubUser({ sub: "student-nosub", apps: ["writing"] });
    const res = await request(
      makeApp({ user, users, required_app_slug: "reading" }),
    ).get("/whoami");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("subscription_required");
    expect(res.body.required_app).toBe("reading");
  });

  it("200 when apps claim includes the app slug", async () => {
    const users = new InMemoryUserMappings();
    const user = makeHubUser({
      sub: "student-ok",
      apps: ["reading", "writing"],
    });
    const res = await request(
      makeApp({ user, users, required_app_slug: "reading" }),
    ).get("/whoami");
    expect(res.status).toBe(200);
  });

  it("requireAdmin 403 for student role", async () => {
    const users = new InMemoryUserMappings();
    const user = makeHubUser({ sub: "u-stu", role: "student" });
    const res = await request(makeApp({ user, users })).get("/admin-ping");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("admin_only");
  });

  it("requireAdmin 200 for admin role", async () => {
    const users = new InMemoryUserMappings();
    const user = makeHubUser({ sub: "u-admin", role: "admin" });
    const res = await request(makeApp({ user, users })).get("/admin-ping");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("requireAdmin 403 for parent role", async () => {
    const users = new InMemoryUserMappings();
    const user = makeHubUser({ sub: "u-parent", role: "parent" });
    const res = await request(makeApp({ user, users })).get("/admin-ping");
    expect(res.status).toBe(403);
  });
});
