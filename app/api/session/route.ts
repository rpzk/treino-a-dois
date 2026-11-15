import { findLinkedDisplayName, findLinkedProfile } from "@/lib/training-db";
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
  return Response.json(
    {
      authenticated: true,
      patient_fhir_id: session.patientFhirId,
      tenant_schema: session.tenantSchema,
      profile,
      display_name: displayName,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
