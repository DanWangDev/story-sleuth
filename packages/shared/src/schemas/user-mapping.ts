import { z } from "zod";

/**
 * The minimum the backend needs to correlate a student's attempts across
 * sessions. Story-sleuth deliberately does NOT persist user profile data
 * (name, email, role, subscription) locally — all of that comes from the
 * 11plus-hub JWT claims on each request. The mapping table exists purely
 * so student_attempts can reference a local FK (faster joins, stable id
 * under OIDC sub changes, easier to delete) instead of carrying the OIDC
 * sub string on every attempt row.
 *
 * The `hub_user_id` is the OIDC `sub` claim from an 11plus-hub-issued JWT.
 */
export const UserMappingSchema = z.object({
  id: z.number().int().positive(),
  hub_user_id: z.string().min(1).max(255),
  created_at: z.string().datetime(),
});

export type UserMapping = z.infer<typeof UserMappingSchema>;
