import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { AdminSettingsRepository } from "../../repositories/interfaces/admin-settings-repository.js";
import {
  LLM_SETTING_KEYS,
  isValidProvider,
} from "../../llm/factory.js";
import { LLM_PROVIDERS, type LLMProvider } from "../../llm/types.js";

/** Public shape of the LLM config. Secrets are masked. */
interface PublicProviderConfig {
  provider: LLMProvider;
  model: string | null;
  base_url: string | null;
  /** Last 4 characters of the stored key, or null if not set. */
  api_key_tail: string | null;
  updated_at: string | null;
}

interface LlmConfigResponse {
  active_provider: LLMProvider | null;
  providers: PublicProviderConfig[];
}

const PUT_BODY = z.object({
  active_provider: z.enum(LLM_PROVIDERS).optional(),
  providers: z
    .array(
      z.object({
        provider: z.enum(LLM_PROVIDERS),
        /** null/omit = leave unchanged. */
        model: z.string().min(1).max(200).optional().nullable(),
        base_url: z.string().url().optional().nullable(),
        api_key: z.string().min(1).max(500).optional().nullable(),
      }),
    )
    .optional(),
});

function mask(value: string): string {
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}

export function createAdminSettingsRouter(
  settings: AdminSettingsRepository,
): Router {
  const router = Router();

  async function buildLlmConfigResponse(): Promise<LlmConfigResponse> {
    const keys: string[] = [LLM_SETTING_KEYS.active_provider];
    for (const p of LLM_PROVIDERS) {
      keys.push(LLM_SETTING_KEYS.model(p));
      keys.push(LLM_SETTING_KEYS.api_key(p));
      keys.push(LLM_SETTING_KEYS.base_url(p));
    }
    const bundle = await settings.getMany(keys);

    const activeRaw = bundle.get(LLM_SETTING_KEYS.active_provider)?.value;
    const active_provider: LlmConfigResponse["active_provider"] =
      activeRaw && isValidProvider(activeRaw) ? activeRaw : null;

    const providers: PublicProviderConfig[] = LLM_PROVIDERS.map((p) => {
      const keySetting = bundle.get(LLM_SETTING_KEYS.api_key(p));
      return {
        provider: p,
        model: bundle.get(LLM_SETTING_KEYS.model(p))?.value ?? null,
        base_url: bundle.get(LLM_SETTING_KEYS.base_url(p))?.value ?? null,
        api_key_tail: keySetting ? mask(keySetting.value) : null,
        updated_at: keySetting?.updated_at ?? null,
      };
    });

    return { active_provider, providers };
  }

  /** GET — admin reads the current config (keys masked). */
  router.get("/llm", async (_req, res, next) => {
    try {
      res.json(await buildLlmConfigResponse());
    } catch (err) {
      next(err);
    }
  });

  /** PUT — partial update: active_provider + any provider-specific fields. */
  router.put("/llm", async (req: Request, res: Response, next: NextFunction) => {
    const adminId = req.auth?.user_id;
    if (!adminId) {
      res.status(500).json({ error: "auth_not_initialised" });
      return;
    }

    let body: z.infer<typeof PUT_BODY>;
    try {
      body = PUT_BODY.parse(req.body);
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          error: "invalid_request",
          issues: err.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        });
        return;
      }
      next(err);
      return;
    }

    try {
      if (body.active_provider) {
        await settings.upsert({
          key: LLM_SETTING_KEYS.active_provider,
          value: body.active_provider,
          is_secret: false,
          updated_by: adminId,
        });
      }
      for (const entry of body.providers ?? []) {
        if (entry.model != null) {
          await settings.upsert({
            key: LLM_SETTING_KEYS.model(entry.provider),
            value: entry.model,
            is_secret: false,
            updated_by: adminId,
          });
        }
        if (entry.base_url != null) {
          await settings.upsert({
            key: LLM_SETTING_KEYS.base_url(entry.provider),
            value: entry.base_url,
            is_secret: false,
            updated_by: adminId,
          });
        }
        if (entry.api_key != null) {
          await settings.upsert({
            key: LLM_SETTING_KEYS.api_key(entry.provider),
            value: entry.api_key,
            is_secret: true,
            updated_by: adminId,
          });
        }
      }

      res.json(await buildLlmConfigResponse());
    } catch (err) {
      next(err);
    }
  });

  return router;
}
