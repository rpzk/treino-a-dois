import { findLinkedProfile } from "@/lib/training-db";
import { readFitSessionFromRequest, type FitSession } from "@/lib/fit-session";
import { assertProfileAllowed } from "@/lib/profile-access";

export { assertProfileAllowed };

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
  const profile = await findLinkedProfile(session);
  return { ok: true, ctx: { session, profile } };
}
