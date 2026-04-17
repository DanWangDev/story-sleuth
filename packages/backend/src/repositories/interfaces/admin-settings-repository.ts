export interface AdminSetting {
  key: string;
  /**
   * Decrypted plaintext value. Callers that need to hand this off to
   * untrusted surfaces (admin UI, logs) must check `is_secret` first
   * and redact accordingly.
   */
  value: string;
  is_secret: boolean;
  updated_at: string;
  updated_by: number | null;
}

/**
 * Key-value store for admin-configurable runtime settings. Values are
 * encrypted at rest; the repo handles the envelope transparently so
 * the service layer deals in plaintext.
 */
export interface AdminSettingsRepository {
  get(key: string): Promise<AdminSetting | null>;

  /**
   * Bulk read. Returns a Map keyed by the requested keys; missing
   * keys are simply absent from the map.
   */
  getMany(keys: string[]): Promise<Map<string, AdminSetting>>;

  upsert(input: {
    key: string;
    value: string;
    is_secret: boolean;
    updated_by: number;
  }): Promise<AdminSetting>;

  delete(key: string): Promise<void>;

  listAll(): Promise<AdminSetting[]>;
}
