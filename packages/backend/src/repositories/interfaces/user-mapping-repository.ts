import type { UserMapping } from "@story-sleuth/shared";

/**
 * Thin mapping from the hub-issued OIDC `sub` claim to a local integer
 * id. Story-sleuth stores no user profile data — it all lives in the
 * JWT claims on every request. Only the mapping persists locally so
 * student_attempts can have a stable FK.
 */
export interface UserMappingRepository {
  /** Look up by local id. Returns null if not found. */
  findById(id: number): Promise<UserMapping | null>;

  /** Look up by the OIDC sub claim. Returns null if this hub user has
   *  never authenticated against story-sleuth before. */
  findByHubUserId(hubUserId: string): Promise<UserMapping | null>;

  /**
   * Idempotent: return the existing mapping for this hub user, or
   * create one atomically. Safe under concurrent requests — callers
   * should treat the returned row as the canonical local identity.
   */
  getOrCreate(hubUserId: string): Promise<UserMapping>;
}
