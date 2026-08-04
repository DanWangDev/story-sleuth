import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { AdminSettingsRepository } from "../../repositories/interfaces/admin-settings-repository.js";
import { LLM_SETTING_KEYS, isValidProvider } from "../../llm/factory.js";
import { LLM_PROVIDERS, type LLMProvider } from "../../llm/types.js";

/** Flat global LLM config. Secrets are masked. */
interface LlmConfigResponse {
  provider: LLMProvider | null;
  model: string | null;
  base_url: string | null;
  /** Last 4 characters of the stored key, or null if not set. */
  api_key_tail: string | null;
  updated_at: string | null;
}

const PUT_BODY = z.object({
  /** The LLM provider to use. */
  provider: z.enum(LLM_PROVIDERS).optional(),
  /** null/omit = leave unchanged. */
  model: z.string().min(1).max(200).optional().nullable(),
  base_url: z.string().url().optional().nullable(),
  api_key: z.string().min(1).max(500).optional().nullable(),
});

function mask(value: string): string {
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}

export function createAdminSettingsRouter(
  settings: AdminSettingsRepository,
): Router {
  const router = Router();

  const LLM_KEYS = [
    LLM_SETTING_KEYS.provider,
    LLM_SETTING_KEYS.model,
    LLM_SETTING_KEYS.api_key,
    LLM_SETTING_KEYS.base_url,
  ];

  async function buildLlmConfigResponse(): Promise<LlmConfigResponse> {
    const bundle = await settings.getMany(LLM_KEYS);

    const providerRaw = bundle.get(LLM_SETTING_KEYS.provider)?.value;
    const provider: LlmConfigResponse["provider"] =
      providerRaw && isValidProvider(providerRaw) ? providerRaw : null;

    const keySetting = bundle.get(LLM_SETTING_KEYS.api_key);

    return {
      provider,
      model: bundle.get(LLM_SETTING_KEYS.model)?.value ?? null,
      base_url: bundle.get(LLM_SETTING_KEYS.base_url)?.value ?? null,
      api_key_tail: keySetting ? mask(keySetting.value) : null,
      updated_at: keySetting?.updated_at ?? null,
    };
  }

  /** GET — admin reads the current config (keys masked). */
  router.get("/llm", async (_req, res, next) => {
    try {
      res.json(await buildLlmConfigResponse());
    } catch (err) {
      next(err);
    }
  });

  /** PUT — partial update. Only the fields provided are saved. */
  router.put(
    "/llm",
    async (req: Request, res: Response, next: NextFunction) => {
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
        if (body.provider != null) {
          await settings.upsert({
            key: LLM_SETTING_KEYS.provider,
            value: body.provider,
            is_secret: false,
            updated_by: adminId,
          });
        }
        if (body.model != null) {
          await settings.upsert({
            key: LLM_SETTING_KEYS.model,
            value: body.model,
            is_secret: false,
            updated_by: adminId,
          });
        }
        if (body.base_url != null) {
          await settings.upsert({
            key: LLM_SETTING_KEYS.base_url,
            value: body.base_url,
            is_secret: false,
            updated_by: adminId,
          });
        }
        if (body.api_key != null) {
          await settings.upsert({
            key: LLM_SETTING_KEYS.api_key,
            value: body.api_key,
            is_secret: true,
            updated_by: adminId,
          });
        }

        res.json(await buildLlmConfigResponse());
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
