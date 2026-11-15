import { readTrainingState } from "@/lib/training-db";
import { summarizeProgress, type ProfileId } from "@/lib/training-progress";
import type { Session } from "@/lib/training";
import { requireFitSession } from "@/lib/require-fit-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireFitSession(req);
  if (!auth.ok) return auth.response;

  try {
    const profiles = {
      lucas: summarizeProgress(null, null, Date.now()),
      natalia: summarizeProgress(null, null, Date.now()),
    };
    const now = Date.now();
    if (auth.ctx.profile) {
      const row = await readTrainingState(auth.ctx.session);
      if (row) {
        const state = row.state as { active?: Session | null; sessions?: Session[] };
        profiles[row.profile as ProfileId] = summarizeProgress(
          state.active ?? null,
          state.sessions?.[0] ?? null,
          now,
        );
      }
    }
    return Response.json(
      { profiles, linked_profile: auth.ctx.profile },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Could not read shared training progress", error);
    return Response.json(
      { error: "Não foi possível atualizar o progresso." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
