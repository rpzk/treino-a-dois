import { normalizeEquipmentItems } from "@/lib/equipment-inventory";
import { fetchClinicalContextForSession } from "@/lib/clinical-context";
import { requireFitSession } from "@/lib/require-fit-session";
import { swapSuggestedExercise } from "@/lib/workout-suggest";

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
    exerciseName?: unknown;
    group?: unknown;
    currentExercises?: unknown;
    excludedExercises?: unknown;
    reason?: unknown;
    equipment_inventory?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const exerciseName =
    typeof body.exerciseName === "string" ? body.exerciseName.trim() : "";
  const group = typeof body.group === "string" ? body.group.trim() : "Geral";
  if (!exerciseName) {
    return Response.json(
      { error: "Informe o exercício a substituir." },
      { status: 400 },
    );
  }

  const currentExercises = Array.isArray(body.currentExercises)
    ? body.currentExercises.filter((x): x is string => typeof x === "string")
    : [];
  const excludedExercises = Array.isArray(body.excludedExercises)
    ? body.excludedExercises.filter((x): x is string => typeof x === "string")
    : [];
  const reason = typeof body.reason === "string" ? body.reason : "";
  const equipmentInventory = normalizeEquipmentItems(body.equipment_inventory);

  try {
    const clinicalContext = await fetchClinicalContextForSession(
      auth.ctx.session,
    );
    const item = await swapSuggestedExercise({
      tenantSchema: auth.ctx.session.tenantSchema,
      patientFhirId: auth.ctx.session.patientFhirId,
      clinicalContext,
      exerciseName,
      group,
      currentExercises,
      excludedExercises,
      reason,
      equipmentInventory,
    });
    return Response.json({ item }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[training/suggest/swap]", error);
    const message = error instanceof Error ? error.message : "";
    if (/\(429\)|rate.?limit/i.test(message)) {
      return Response.json(
        { error: "Muitas trocas em pouco tempo, aguarde um minuto." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
    return Response.json(
      {
        error:
          "Não foi possível sugerir uma alternativa agora. Tente de novo em instantes.",
      },
      { status: 502 },
    );
  }
}
