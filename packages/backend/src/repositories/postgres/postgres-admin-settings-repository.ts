import type postgres from "postgres";
import type { SecretCrypto } from "../../crypto/secret-crypto.js";
import type {
  AdminSetting,
  AdminSettingsRepository,
} from "../interfaces/admin-settings-repository.js";

type Row = {
  key: string;
  value: string;
  is_secret: boolean;
  updated_at: Date;
  updated_by: string | number | null;
};

export class PostgresAdminSettingsRepository
  implements AdminSettingsRepository
{
  constructor(
    private readonly sql: postgres.Sql,
    private readonly crypto: SecretCrypto,
  ) {}

  private rowToSetting(r: Row): AdminSetting {
    return {
      key: r.key,
      value: this.crypto.decrypt(r.value),
      is_secret: r.is_secret,
      updated_at: r.updated_at.toISOString(),
      updated_by: r.updated_by == null ? null : Number(r.updated_by),
    };
  }

  async get(key: string): Promise<AdminSetting | null> {
    const rows = await this.sql<Row[]>`
      SELECT key, value, is_secret, updated_at, updated_by
      FROM admin_settings WHERE key = ${key}
    `;
    return rows[0] ? this.rowToSetting(rows[0]) : null;
  }

  async getMany(keys: string[]): Promise<Map<string, AdminSetting>> {
    if (keys.length === 0) return new Map();
    const keysLiteral = `{${keys.map((k) => `"${k.replace(/"/g, '\\"')}"`).join(",")}}`;
    const rows = await this.sql<Row[]>`
      SELECT key, value, is_secret, updated_at, updated_by
      FROM admin_settings WHERE key = ANY(${keysLiteral}::text[])
    `;
    const map = new Map<string, AdminSetting>();
    for (const r of rows) {
      map.set(r.key, this.rowToSetting(r));
    }
    return map;
  }

  async upsert(input: {
    key: string;
    value: string;
    is_secret: boolean;
    updated_by: number;
  }): Promise<AdminSetting> {
    const ciphertext = this.crypto.encrypt(input.value);
    const rows = await this.sql<Row[]>`
      INSERT INTO admin_settings (key, value, is_secret, updated_at, updated_by)
      VALUES (${input.key}, ${ciphertext}, ${input.is_secret}, NOW(), ${input.updated_by})
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        is_secret = EXCLUDED.is_secret,
        updated_at = EXCLUDED.updated_at,
        updated_by = EXCLUDED.updated_by
      RETURNING key, value, is_secret, updated_at, updated_by
    `;
    if (!rows[0]) throw new Error("upsert returned no row");
    return this.rowToSetting(rows[0]);
  }

  async delete(key: string): Promise<void> {
    await this.sql`DELETE FROM admin_settings WHERE key = ${key}`;
  }

  async listAll(): Promise<AdminSetting[]> {
    const rows = await this.sql<Row[]>`
      SELECT key, value, is_secret, updated_at, updated_by
      FROM admin_settings ORDER BY key
    `;
    return rows.map((r) => this.rowToSetting(r));
  }
}
