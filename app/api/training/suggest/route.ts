import { normalizeEquipmentItems } from "@/lib/equipment-inventory";
import { fetchClinicalContextForSession } from "@/lib/clinical-context";
import { requireFitSession } from "@/lib/require-fit-session";
import { suggestWorkout } from "@/lib/workout-suggest";

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

  let focus = "";
  let equipmentInventory: ReturnType<typeof normalizeEquipmentItems> = [];
  try {
    const body = (await req.json()) as {
      focus?: string;
      equipment_inventory?: unknown;
    };
    focus = typeof body.focus === "string" ? body.focus : "";
    equipmentInventory = normalizeEquipmentItems(body.equipment_inventory);
  } catch {
    focus = "";
    equipmentInventory = [];
  }

  try {
    const clinicalContext = await fetchClinicalContextForSession(auth.ctx.session);
    const suggestion = await suggestWorkout({
      tenantSchema: auth.ctx.session.tenantSchema,
      patientFhirId: auth.ctx.session.patientFhirId,
      clinicalContext,
      focus,
      equipmentInventory,
    });
    return Response.json(suggestion, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[training/suggest]", error);
    const message = error instanceof Error ? error.message : "";
    if (/\(429\)|rate.?limit/i.test(message)) {
      return Response.json(
        { error: "Muitas sugestões em pouco tempo, aguarde um minuto." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
    return Response.json(
      {
        error:
          "Não foi possível gerar a sugestão agora. Tente de novo em instantes.",
      },
      { status: 502 },
    );
  }
}
