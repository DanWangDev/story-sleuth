import { z } from "zod";

/**
 * Environment variable schema. Validated once on boot; prints a useful
 * error and exits on missing/invalid config rather than letting Express
 * start in a broken state and fail mysteriously on the first request.
 *
 * Auth config mirrors writing-buddy's so that the same
 * @danwangdev/auth-client setup works with the same OIDC client in
 * 11plus-hub, re-registered for this app.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5060),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  CORS_ORIGIN: z.string().default("http://localhost:5180"),

  // --- OIDC (11plus-hub) ---
  /** Public issuer URL — must match the JWT `iss` claim. */
  OIDC_ISSUER: z.string().url().default("http://localhost:3009"),
  /** Docker-internal issuer used for server-to-server discovery calls. */
  OIDC_INTERNAL_ISSUER: z.string().url().optional(),
  /** This app's registered client_id in the hub's applications table. */
  OIDC_CLIENT_ID: z.string().min(1).default("story-sleuth-client"),
  /** This app's registered client_secret in the hub. NEVER commit. */
  OIDC_CLIENT_SECRET: z.string().default(""),
  /** Where the hub redirects back to after login. */
  OIDC_REDIRECT_URI: z
    .string()
    .url()
    .default("http://localhost:5180/api/auth/callback"),

  /**
   * 32+ byte random string used to encrypt the session cookie. Rotating
   * this invalidates all existing sessions — acceptable for a kid app
   * as logout is cheap.
   */
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 bytes for safe encryption"),

  /**
   * Which hub app-slug this service is. The hub includes this in the
   * `apps` claim of issued tokens; middleware can enforce that the
   * student's subscription covers story-sleuth.
   */
  APP_SLUG: z.string().default("reading"),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  return parsed.data;
}
