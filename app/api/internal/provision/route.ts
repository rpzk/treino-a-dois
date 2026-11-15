import {
  provisionProfileForPatient,
  usePostgresStore,
} from "@/lib/training-db";

/** Postgres schema-style identifier, e.g. clinica_rp. */
const TENANT_SCHEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifySecret(req: Request): boolean {
  const expected = process.env.FITCORE_EXCHANGE_SECRET?.trim() || "";
  if (!expected) return false;
  const provided = req.headers.get("x-fitcore-exchange-secret")?.trim() || "";
  if (!provided || provided.length !== expected.length) return false;
  // timing-safe-ish compare without importing crypto for short secrets
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(req: Request) {
  if (!verifySecret(req)) {
    return Response.json(
      { detail: "Segredo de exchange FitCore inválido." },
      { status: 403 },
    );
  }

  let body: { patient_fhir_id?: string; tenant_schema?: string; display_name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ detail: "JSON inválido." }, { status: 400 });
  }

  const patientFhirId = (body.patient_fhir_id || "").trim();
  if (!patientFhirId) {
    return Response.json({ detail: "patient_fhir_id obrigatório." }, { status: 400 });
  }

  const tenantSchema = (body.tenant_schema || "").trim();
  if (usePostgresStore() && !tenantSchema) {
    return Response.json({ detail: "tenant_schema obrigatório." }, { status: 400 });
  }
  if (tenantSchema && !TENANT_SCHEMA_RE.test(tenantSchema)) {
    return Response.json({ detail: "tenant_schema inválido." }, { status: 400 });
  }

  try {
    const result = await provisionProfileForPatient({
      tenantSchema,
      patientFhirId,
      displayName: body.display_name ?? null,
    });
    return Response.json(result, {
      status: result.created ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Falha ao provisionar.";
    const status = message.includes("inválido") ? 400 : 500;
    return Response.json({ detail: message }, { status });
  }
}
