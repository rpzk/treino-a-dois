import { readTrainingState } from "@/lib/training-db";
import { summarizeProgress } from "@/lib/training-progress";
import type { Session } from "@/lib/training";
import { requireFitSession } from "@/lib/require-fit-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Progress for the session's linked patient only (no couple-demo dual profiles). */
export async function GET(req: Request) {
  const auth = await requireFitSession(req);
  if (!auth.ok) return auth.response;

  try {
    const now = Date.now();
    let progress = summarizeProgress(null, null, now);
    if (auth.ctx.profile) {
      const row = await readTrainingState(auth.ctx.session);
      if (row) {
        const state = row.state as {
          active?: Session | null;
          sessions?: Session[];
        };
        progress = summarizeProgress(
          state.active ?? null,
          state.sessions?.[0] ?? null,
          now,
        );
      }
    }
    return Response.json(
      {
        profile: auth.ctx.profile,
        linked_profile: auth.ctx.profile,
        progress,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Could not read training progress", error);
    return Response.json(
      { error: "Não foi possível atualizar o progresso." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
