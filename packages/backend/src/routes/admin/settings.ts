import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import type { AdminSettingsRepository } from "../../repositories/interfaces/admin-settings-repository.js";
import {
  BUILTIN_PROVIDERS,
  LLM_SETTING_KEYS,
  LLMFactory,
  isValidProvider,
  type ProviderDefinition,
} from "../../llm/factory.js";

/** Flat global LLM config. Secrets are masked. */
interface LlmConfigResponse {
  provider: string | null;
  model: string | null;
  base_url: string | null;
  api_key_tail: string | null;
  updated_at: string | null;
}

const PUT_BODY = z.object({
  provider: z.string().min(1).max(50).optional().nullable(),
  model: z.string().min(1).max(200).optional().nullable(),
  base_url: z.string().url().optional().nullable(),
  api_key: z.string().min(1).max(500).optional().nullable(),
});

const PROVIDER_SCHEMA = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "must be a lowercase slug"),
  name: z.string().min(1).max(100),
  api_type: z.enum(["openai-compatible", "anthropic"]),
});

const PROVIDERS_BODY = z.object({
  providers: z.array(PROVIDER_SCHEMA).min(1, "at least one provider is required"),
});

const TEST_BODY = z.object({
  provider: z.string().min(1),
  model: z.string().min(1).max(200).optional().nullable(),
  base_url: z.string().url().optional().nullable(),
  /** If omitted, falls back to the saved API key. */
  api_key: z.string().max(500).optional().nullable(),
});

function mask(value: string): string {
  if (value.length <= 4) return "****";
  return `****${value.slice(-4)}`;
}

async function loadProviders(
  settings: AdminSettingsRepository,
): Promise<ProviderDefinition[]> {
  const row = await settings.get(LLM_SETTING_KEYS.providers);
  if (!row) return BUILTIN_PROVIDERS;
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as ProviderDefinition[];
    }
    return BUILTIN_PROVIDERS;
  } catch {
    return BUILTIN_PROVIDERS;
  }
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
    const providers = await loadProviders(settings);

    const providerRaw = bundle.get(LLM_SETTING_KEYS.provider)?.value;
    const provider: LlmConfigResponse["provider"] =
      providerRaw && isValidProvider(providerRaw, providers) ? providerRaw : null;

    const keySetting = bundle.get(LLM_SETTING_KEYS.api_key);

    return {
      provider,
      model: bundle.get(LLM_SETTING_KEYS.model)?.value ?? null,
      base_url: bundle.get(LLM_SETTING_KEYS.base_url)?.value ?? null,
      api_key_tail: keySetting ? mask(keySetting.value) : null,
      updated_at: keySetting?.updated_at ?? null,
    };
  }

  // ── GET /llm ────────────────────────────────────────────────
  router.get("/llm", async (_req, res, next) => {
    try {
      res.json(await buildLlmConfigResponse());
    } catch (err) {
      next(err);
    }
  });

  // ── PUT /llm ────────────────────────────────────────────────
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

      // Validate provider against the DB-stored list.
      if (body.provider != null) {
        const providers = await loadProviders(settings);
        if (!isValidProvider(body.provider, providers)) {
          res.status(400).json({
            error: "invalid_request",
            message: `unknown provider: ${body.provider}`,
          });
          return;
        }
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

  // ── GET /llm/providers ──────────────────────────────────────
  router.get("/llm/providers", async (_req, res, next) => {
    try {
      const providers = await loadProviders(settings);
      res.json({ providers });
    } catch (err) {
      next(err);
    }
  });

  // ── PUT /llm/providers ──────────────────────────────────────
  router.put(
    "/llm/providers",
    async (req: Request, res: Response, next: NextFunction) => {
      const adminId = req.auth?.user_id;
      if (!adminId) {
        res.status(500).json({ error: "auth_not_initialised" });
        return;
      }

      let body: z.infer<typeof PROVIDERS_BODY>;
      try {
        body = PROVIDERS_BODY.parse(req.body);
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

      // Check for duplicate IDs.
      const ids = body.providers.map((p) => p.id);
      if (new Set(ids).size !== ids.length) {
        res.status(400).json({
          error: "invalid_request",
          message: "duplicate provider IDs",
        });
        return;
      }

      try {
        await settings.upsert({
          key: LLM_SETTING_KEYS.providers,
          value: JSON.stringify(body.providers),
          is_secret: false,
          updated_by: adminId,
        });

        // If the currently-selected provider was removed, clear it.
        const current = await settings.get(LLM_SETTING_KEYS.provider);
        if (
          current &&
          !isValidProvider(current.value, body.providers)
        ) {
          await settings.delete(LLM_SETTING_KEYS.provider);
        }

        const providers = await loadProviders(settings);
        res.json({ providers });
      } catch (err) {
        next(err);
      }
    },
  );

  // ── POST /llm/test ──────────────────────────────────────────
  router.post(
    "/llm/test",
    async (req: Request, res: Response, next: NextFunction) => {
      let body: z.infer<typeof TEST_BODY>;
      try {
        body = TEST_BODY.parse(req.body);
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

      // Fall back to the saved API key if the admin didn't type a new one.
      const api_key =
        body.api_key && body.api_key.trim().length > 0
          ? body.api_key
          : (await settings.get(LLM_SETTING_KEYS.api_key))?.value;

      if (!api_key) {
        res.status(400).json({
          error: "invalid_request",
          message: "No API key provided and none saved.",
        });
        return;
      }

      // Build a client directly from the form values — no DB writes,
      // no race condition with saved settings.
      const factory = new LLMFactory(settings);
      try {
        const client = await factory.buildClientFromConfig({
          provider: body.provider,
          api_key,
          model: body.model ?? undefined,
          base_url: body.base_url ?? undefined,
        });

        const started = Date.now();
        const result = await client.generate({
          user: "Say hello in one short sentence.",
          max_tokens: 32,
        });
        const latency_ms = Date.now() - started;

        // Verify the response contains actual text.
        if (!result.text || result.text.trim().length === 0) {
          res.json({
            success: false,
            error: "Provider returned an empty response — check the model name.",
          });
          return;
        }

        res.json({
          success: true,
          model: result.model,
          latency_ms,
          preview: result.text.slice(0, 100),
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Connection test failed";
        res.json({ success: false, error: message });
      }
    },
  );

  return router;
}
