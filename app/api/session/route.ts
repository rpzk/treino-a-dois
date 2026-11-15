import { findLinkedDisplayName, findLinkedProfile } from "@/lib/training-db";
import { fetchClinicalContextForSession } from "@/lib/clinical-context";
import { readFitSessionFromRequest } from "@/lib/fit-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = readFitSessionFromRequest(req);
  if (!session) {
    return Response.json(
      { authenticated: false },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const profile = await findLinkedProfile(session);
  const displayName = profile ? await findLinkedDisplayName(session) : null;
  // Somente o flag de consentimento; nada clínico é persistido nem devolvido ao browser.
  const clinical = profile ? await fetchClinicalContextForSession(session) : null;
  return Response.json(
    {
      authenticated: true,
      health_mode: clinical ? { consented: clinical.consented } : null,
      patient_fhir_id: session.patientFhirId,
      tenant_schema: session.tenantSchema,
      profile,
      display_name: displayName,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
