import { findProfileByHealthcorePatientId } from "@/lib/training-db";
import { readFitSessionFromRequest, type FitSession } from "@/lib/fit-session";

export type AuthedFitContext = {
  session: FitSession;
  profile: string | null;
};

export async function requireFitSession(
  req: Request,
): Promise<{ ok: true; ctx: AuthedFitContext } | { ok: false; response: Response }> {
  const session = readFitSessionFromRequest(req);
  if (!session) {
    return {
      ok: false,
      response: Response.json(
        { error: "Sessão FitCore ausente. Abra pelo portal do paciente." },
        { status: 401 },
      ),
    };
  }
  const profile = await findProfileByHealthcorePatientId(session.patientFhirId);
  return { ok: true, ctx: { session, profile } };
}

export function assertProfileAllowed(
  requested: string | null | undefined,
  linked: string | null,
): Response | null {
  if (!requested) {
    return Response.json({ error: "Perfil inválido." }, { status: 400 });
  }
  if (!linked) {
    return Response.json(
      {
        error: "Perfil de treino ainda não vinculado a este paciente.",
        code: "PROFILE_NOT_LINKED",
        patient_fhir_id: true,
      },
      { status: 404 },
    );
  }
  if (requested !== linked) {
    return Response.json({ error: "Perfil não autorizado para esta sessão." }, { status: 403 });
  }
  return null;
}
