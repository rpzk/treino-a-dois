/**
 * HealthCore → FitCore one-time portal exchange (Part 2 SSO).
 *
 * Contract (HealthCore `FitTrainingSsoService` / portal API):
 *
 * 1. Portal (authenticated patient) POST
 *    `{tenant-host}/api/v1/portal/my-training/launch/`
 *    → `{ launch_url, expires_in }`
 *    `launch_url` = `{FITCORE_PUBLIC_URL}/auth/healthcore?code=…&issuer=…`
 *
 * 2. Browser hits FitCore `GET /auth/healthcore?code=&issuer=`
 *
 * 3. FitCore server POST `{issuer}/api/v1/portal/my-training/exchange/`
 *    Header: `X-FitCore-Exchange-Secret: $FITCORE_EXCHANGE_SECRET`
 *    Body: `{ "code": "<one-time>" }`
 *    → `{ patient_fhir_id, tenant_schema, fit_training_enabled }`
 *
 * Assumed / verified URLs (tenant host = issuer, e.g. https://rp.rphealthtech.com):
 * - Launch:  POST /api/v1/portal/my-training/launch/
 * - Exchange: POST /api/v1/portal/my-training/exchange/
 * - FitCore callback: GET https://fit.rphealthtech.com/auth/healthcore
 */

export type ExchangeResult = {
  patient_fhir_id: string;
  tenant_schema: string;
  fit_training_enabled: boolean;
};

const FHIR_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Portal may emit http:// behind a reverse proxy; following that redirect turns POST into GET (405). */
export function normalizeIssuer(issuer: string): string {
  let cleaned = issuer.trim().replace(/\/$/, "");
  if (cleaned.startsWith("http://")) {
    cleaned = `https://${cleaned.slice("http://".length)}`;
  }
  return cleaned;
}

export function buildExchangeUrl(issuer: string): string {
  return `${normalizeIssuer(issuer)}/api/v1/portal/my-training/exchange/`;
}

export function parseExchangeResult(payload: unknown): ExchangeResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("Exchange response inválida");
  }
  const row = payload as Record<string, unknown>;
  const patient_fhir_id = String(row.patient_fhir_id || "")
    .trim()
    .toLowerCase();
  const tenant_schema = String(row.tenant_schema || "").trim();
  const fit_training_enabled = Boolean(row.fit_training_enabled);
  if (!FHIR_ID_RE.test(patient_fhir_id)) {
    throw new Error("Exchange response sem patient_fhir_id válido");
  }
  if (!tenant_schema || tenant_schema === "public") {
    throw new Error("Exchange response sem tenant_schema válido");
  }
  return { patient_fhir_id, tenant_schema, fit_training_enabled };
}

export async function exchangeHealthcoreCode(input: {
  code: string;
  issuer: string;
}): Promise<ExchangeResult> {
  const secret = process.env.FITCORE_EXCHANGE_SECRET?.trim();
  if (!secret) {
    throw new Error("FITCORE_EXCHANGE_SECRET missing");
  }
  const url = buildExchangeUrl(input.issuer);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-FitCore-Exchange-Secret": secret,
    },
    body: JSON.stringify({ code: input.code }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Exchange failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  return parseExchangeResult(await response.json());
}
