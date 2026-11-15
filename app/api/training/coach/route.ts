import { requireFitSession } from "@/lib/require-fit-session";
import { coachExercise } from "@/lib/session-coach";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await requireFitSession(req);
  if (!auth.ok) return auth.response;
  if (!auth.ctx.profile) {
    return Response.json(
      {
        error: "Perfil de treino ainda não vinculado a este paciente.",
        code: "PROFILE_NOT_LINKED",
      },
      { status: 404 },
    );
  }

  let body: {
    exerciseName?: string;
    group?: string;
    sets?: number;
    reps?: number;
    rest?: number;
    previousKg?: number | null;
    previousReps?: number | null;
    setIndex?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const exerciseName = String(body.exerciseName || "").trim();
  if (!exerciseName) {
    return Response.json({ error: "exerciseName obrigatório." }, { status: 400 });
  }

  try {
    const tip = await coachExercise({
      tenantSchema: auth.ctx.session.tenantSchema,
      exerciseName,
      group: typeof body.group === "string" ? body.group : undefined,
      sets: Number(body.sets) || 3,
      reps: Number(body.reps) || 10,
      rest: Number(body.rest) || 90,
      previousKg: typeof body.previousKg === "number" ? body.previousKg : null,
      previousReps:
        typeof body.previousReps === "number" ? body.previousReps : null,
      setIndex: typeof body.setIndex === "number" ? body.setIndex : undefined,
    });
    return Response.json(tip, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível gerar a dica. Tente novamente.",
      },
      { status: 502 },
    );
  }
}