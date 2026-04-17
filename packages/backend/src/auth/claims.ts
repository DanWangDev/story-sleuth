import { z } from "zod";

/**
 * The shape of an access token issued by 11plus-hub that we care about.
 *
 * Story-sleuth deliberately does NOT persist name, email, or subscription
 * locally — those live in the JWT and get re-read on every request. The
 * only field we persist (via user_mappings) is `sub`, mapped to a local
 * integer id.
 *
 * Standard OIDC claims (iss, aud, exp, iat) are verified by the JWT
 * library — we just describe the payload fields we then use.
 */
export const HubClaimsSchema = z.object({
  /** OIDC `sub` — the hub-stable user identifier. */
  sub: z.string().min(1),

  /** `role` claim from hub — controls access to admin endpoints. */
  role: z.enum(["student", "parent", "admin"]),

  /**
   * `apps` claim — the list of app slugs this user's current subscription
   * covers (e.g., ["reading", "writing", "vocab"]). Used to enforce that
   * the student's subscription actually includes story-sleuth before
   * they start a session. Optional because some tokens (e.g., early
   * sign-up flow) may lack it.
   */
  apps: z.array(z.string()).optional(),

  /** OPTIONAL informational claims. Not used for authorization. */
  email: z.string().optional(),
  username: z.string().optional(),
  display_name: z.string().optional(),
});

export type HubClaims = z.infer<typeof HubClaimsSchema>;
