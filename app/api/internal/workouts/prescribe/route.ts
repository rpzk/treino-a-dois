import { verifySecret } from "@/lib/exchange-secret";
import {
  applyPrescription,
  PrescribeError,
  type PrescribeInput,
} from "@/lib/prescribe-workout";
import { blank, stateSchema } from "@/lib/training";
import {
  provisionProfileForPatient,
  readTrainingState,
  usePostgresStore,
  writeTrainingState,
} from "@/lib/training-db";

/** Postgres schema-style identifier, e.g. clinica_rp. */
const TENANT_SCHEMA_RE = /^[a-z_][a-z0-9_]{0,62}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_WRITE_ATTEMPTS = 3;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  patient_fhir_id?: unknown;
  tenant_schema?: unknown;
  mode?: unknown;
  practitioner_fhir_id?: unknown;
  practitioner_name?: unknown;
  workout?: unknown;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function bad(detail: string) {
  return Response.json({ detail }, { status: 400 });
}

export async function POST(req: Request) {
  if (!verifySecret(req)) {
    return Response.json(
      { detail: "Segredo de exchange FitCore inválido." },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return bad("JSON inválido.");
  }
  if (!body || typeof body !== "object") return bad("JSON inválido.");

  const patientFhirId = str(body.patient_fhir_id).toLowerCase();
  if (!patientFhirId) return bad("patient_fhir_id obrigatório.");
  if (!UUID_RE.test(patientFhirId)) return bad("patient_fhir_id inválido.");

  const tenantSchema = str(body.tenant_schema);
  if (usePostgresStore() && !tenantSchema) return bad("tenant_schema obrigatório.");
  if (tenantSchema && !TENANT_SCHEMA_RE.test(tenantSchema)) {
    return bad("tenant_schema inválido.");
  }

  const workout = body.workout as PrescribeInput["workout"] | undefined;
  if (!workout || typeof workout !== "object") return bad("workout obrigatório.");

  const input: PrescribeInput = {
    tenantSchema,
    patientFhirId,
    mode: body.mode as PrescribeInput["mode"],
    practitionerFhirId: str(body.practitioner_fhir_id),
    practitionerName: str(body.practitioner_name),
    workout,
  };

  try {
    // Validate before provisioning so rejected requests never create profiles.
    applyPrescription(blank, input);

    const owner = { tenantSchema, patientFhirId };
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
      let row = await readTrainingState(owner);
      if (!row) {
        await provisionProfileForPatient(owner);
        row = await readTrainingState(owner);
      }
      if (!row) throw new Error("Perfil não provisionado.");

      const current = stateSchema.parse(row.state);
      const { state, workoutId } = applyPrescription(current, input);
      const result = await writeTrainingState(owner, state, row.revision);
      if ("revision" in result) {
        return Response.json(
          { ok: true, workout_id: workoutId, mode: input.mode },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      if ("notFound" in result) throw new Error("Perfil não encontrado.");
      // conflict: concurrent write — re-read and retry
    }
    return Response.json(
      { detail: "Conflito de revisão; tente novamente." },
      { status: 409 },
    );
  } catch (error) {
    if (error instanceof PrescribeError) return bad(error.message);
    console.error(error);
    return Response.json({ detail: "Falha ao prescrever treino." }, { status: 500 });
  }
}
