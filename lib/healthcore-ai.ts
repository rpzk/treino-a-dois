/**
 * FitCore → HealthCore AI proxy (Part 3).
 *
 * Zero provider keys in FitCore (`OPENAI_*` / Groq / etc. must stay unset).
 * Auth = same `X-FitCore-Exchange-Secret` as Part 2 SSO exchange.
 * Identity = `patient_fhir_id` + `tenant_schema` from the FitCore portal session.
 *
 * ## Assumed / Part 3 contract (Project + store)
 *
 * Assist: `POST {issuer}/api/v1/portal/my-training/ai-assist/`
 * Header: `X-FitCore-Exchange-Secret: $FITCORE_EXCHANGE_SECRET`
 *
 * Body:
 * ```json
 * {
 *   "messages": [{"role":"system|user|assistant","content":"..."}],
 *   "purpose": "fitcore.workout_suggest|fitcore.session_coach|fitcore.ping|...",
 *   "tenant_schema": "clinica_rp",
 *   "patient_fhir_id": "uuid",
 *   "json_mode": true
 * }
 * ```
 *
 * Response:
 * `{ "content": string, "provider": string, "model": string, "billing_mode": string, "purpose": string }`
 *
 * Gate (HealthCore): `fit_training_enabled`, purpose allowlist, rate limit.
 *
 * ## Legacy alias (already on HealthCore main)
 *
 * `POST /api/v1/internal/fitcore/ai/complete/` — same body without requiring
 * `patient_fhir_id`. Override with `HEALTHCORE_AI_COMPLETE_PATH` if needed.
 *
 * Vision remains on `POST /api/v1/internal/fitcore/ai/vision/` unless
 * `HEALTHCORE_AI_VISION_PATH` is set.
 */

import { normalizeIssuer } from "./healthcore-exchange.ts";

export type HealthcoreAiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type HealthcoreAiCompleteResult = {
  content: string;
  provider: string;
  model: string;
  billing_mode: string;
  purpose: string;
};

/** Part 3 portal assist path (Plan + store contract). */
export const PLAN_AI_ASSIST_PATH = "/api/v1/portal/my-training/ai-assist/";

/** Default complete path — portal ai-assist. */
export const DEFAULT_AI_COMPLETE_PATH = PLAN_AI_ASSIST_PATH;

/** Legacy HealthCore complete path (still valid alias). */
export const LEGACY_AI_COMPLETE_PATH = "/api/v1/internal/fitcore/ai/complete/";

/** Default vision path — HealthCore `FitCoreAiVisionView`. */
export const DEFAULT_AI_VISION_PATH = "/api/v1/internal/fitcore/ai/vision/";

export function exchangeSecret(): string {
  const secret = process.env.FITCORE_EXCHANGE_SECRET?.trim() || "";
  if (!secret) {
    throw new Error("FITCORE_EXCHANGE_SECRET missing");
  }
  return secret;
}

export function defaultIssuer(): string {
  return (
    process.env.HEALTHCORE_PUBLIC_URL?.trim().replace(/\/$/, "") ||
    process.env.HEALTHCORE_BASE_URL?.trim().replace(/\/$/, "") ||
    "https://rp.rphealthtech.com"
  );
}

function normalizePath(path: string, fallback: string): string {
  const raw = (path || fallback).trim() || fallback;
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function buildAiCompleteUrl(issuer?: string): string {
  const path = normalizePath(
    process.env.HEALTHCORE_AI_COMPLETE_PATH || "",
    DEFAULT_AI_COMPLETE_PATH,
  );
  return `${normalizeIssuer(issuer || defaultIssuer())}${path}`;
}

export function buildAiVisionUrl(issuer?: string): string {
  const path = normalizePath(
    process.env.HEALTHCORE_AI_VISION_PATH || "",
    DEFAULT_AI_VISION_PATH,
  );
  return `${normalizeIssuer(issuer || defaultIssuer())}${path}`;
}

export function parseAiCompleteResult(payload: unknown): HealthcoreAiCompleteResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("HealthCore AI response inválida");
  }
  const row = payload as Record<string, unknown>;
  const content = typeof row.content === "string" ? row.content : "";
  if (!content.trim()) {
    throw new Error("HealthCore AI response sem content");
  }
  return {
    content,
    provider: typeof row.provider === "string" ? row.provider : "",
    model: typeof row.model === "string" ? row.model : "",
    billing_mode: typeof row.billing_mode === "string" ? row.billing_mode : "",
    purpose: typeof row.purpose === "string" ? row.purpose : "",
  };
}

/** Guard: FitCore must never require provider keys for the AI assist path. */
export function assertNoProviderKeysInFitEnv(): void {
  const banned = [
    "OPENAI_API_KEY",
    "OPENAI_API_KEY_FIT",
    "GROQ_API_KEY",
    "ANTHROPIC_API_KEY",
  ];
  for (const name of banned) {
    if (process.env[name]?.trim()) {
      throw new Error(
        `${name} must not be set in FitCore — use HealthCore AI proxy instead`,
      );
    }
  }
}

/** Call HealthCore LLM proxy — no provider API keys in FitCore. */
export async function healthcoreAiComplete(input: {
  messages: HealthcoreAiMessage[];
  purpose: string;
  tenantSchema: string;
  /** From FitCore portal session; required by portal ai-assist contract. */
  patientFhirId?: string;
  issuer?: string;
  jsonMode?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<HealthcoreAiCompleteResult> {
  assertNoProviderKeysInFitEnv();
  const tenantSchema = input.tenantSchema.trim();
  if (!tenantSchema || tenantSchema === "public") {
    throw new Error("tenant_schema inválido");
  }
  const patientFhirId = (input.patientFhirId || "").trim().toLowerCase();
  const url = buildAiCompleteUrl(input.issuer);
  const response = await (input.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-FitCore-Exchange-Secret": exchangeSecret(),
    },
    body: JSON.stringify({
      messages: input.messages,
      purpose: input.purpose,
      tenant_schema: tenantSchema,
      ...(patientFhirId ? { patient_fhir_id: patientFhirId } : {}),
      json_mode: Boolean(input.jsonMode),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `HealthCore AI failed (${response.status}): ${detail.slice(0, 240)}`,
    );
  }
  return parseAiCompleteResult(await response.json());
}

export type HealthcoreAiVisionImage = {
  mime: string;
  dataBase64: string;
};

export type HealthcoreAiVisionResult = HealthcoreAiCompleteResult;

/** Call HealthCore vision proxy — images as base64; no provider keys in FitCore. */
export async function healthcoreAiVision(input: {
  purpose: string;
  tenantSchema: string;
  patientFhirId?: string;
  system?: string;
  prompt: string;
  images: HealthcoreAiVisionImage[];
  issuer?: string;
  fetchImpl?: typeof fetch;
}): Promise<HealthcoreAiVisionResult> {
  assertNoProviderKeysInFitEnv();
  const tenantSchema = input.tenantSchema.trim();
  if (!tenantSchema || tenantSchema === "public") {
    throw new Error("tenant_schema inválido");
  }
  const patientFhirId = (input.patientFhirId || "").trim().toLowerCase();
  const url = buildAiVisionUrl(input.issuer);
  const response = await (input.fetchImpl ?? fetch)(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-FitCore-Exchange-Secret": exchangeSecret(),
    },
    body: JSON.stringify({
      purpose: input.purpose,
      tenant_schema: tenantSchema,
      ...(patientFhirId ? { patient_fhir_id: patientFhirId } : {}),
      ...(input.system ? { system: input.system } : {}),
      prompt: input.prompt,
      images: input.images.map((image) => ({
        mime: image.mime,
        data_base64: image.dataBase64,
      })),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `HealthCore AI vision failed (${response.status}): ${detail.slice(0, 240)}`,
    );
  }
  return parseAiCompleteResult(await response.json());
}
