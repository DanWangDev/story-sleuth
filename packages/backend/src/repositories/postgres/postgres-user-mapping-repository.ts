import type postgres from "postgres";
import type { UserMapping } from "@story-sleuth/shared";
import type { UserMappingRepository } from "../interfaces/user-mapping-repository.js";

type Row = {
  id: string | number;
  hub_user_id: string;
  created_at: Date;
};

function rowToMapping(r: Row): UserMapping {
  return {
    id: Number(r.id),
    hub_user_id: r.hub_user_id,
    created_at: r.created_at.toISOString(),
  };
}

export class PostgresUserMappingRepository implements UserMappingRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async findById(id: number): Promise<UserMapping | null> {
    const rows = await this.sql<Row[]>`
      SELECT id, hub_user_id, created_at
      FROM user_mappings WHERE id = ${id}
    `;
    return rows[0] ? rowToMapping(rows[0]) : null;
  }

  async findByHubUserId(hubUserId: string): Promise<UserMapping | null> {
    const rows = await this.sql<Row[]>`
      SELECT id, hub_user_id, created_at
      FROM user_mappings WHERE hub_user_id = ${hubUserId}
    `;
    return rows[0] ? rowToMapping(rows[0]) : null;
  }

  async getOrCreate(hubUserId: string): Promise<UserMapping> {
    // ON CONFLICT ensures atomicity under concurrent callers; DO UPDATE
    // (even a no-op) is required so RETURNING yields the existing row
    // when the insert is skipped.
    const rows = await this.sql<Row[]>`
      INSERT INTO user_mappings (hub_user_id)
      VALUES (${hubUserId})
      ON CONFLICT (hub_user_id) DO UPDATE SET hub_user_id = EXCLUDED.hub_user_id
      RETURNING id, hub_user_id, created_at
    `;
    if (!rows[0]) {
      throw new Error("getOrCreate returned no row — should not happen");
    }
    return rowToMapping(rows[0]);
  }
}
