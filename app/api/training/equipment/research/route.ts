import { normalizeEquipmentItems } from "@/lib/equipment-inventory";
import { researchEquipmentInventory } from "@/lib/equipment-research";
import { requireFitSession } from "@/lib/require-fit-session";

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

  let items: ReturnType<typeof normalizeEquipmentItems> = [];
  try {
    const body = (await req.json()) as { items?: unknown };
    items = normalizeEquipmentItems(body.items);
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  if (!items.length) {
    return Response.json(
      { error: "Envie ao menos um equipamento para pesquisar." },
      { status: 400 },
    );
  }

  try {
    const result = await researchEquipmentInventory({
      tenantSchema: auth.ctx.session.tenantSchema,
      patientFhirId: auth.ctx.session.patientFhirId,
      items,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[training/equipment/research]", error);
    const message = error instanceof Error ? error.message : "";
    if (/\(429\)|rate.?limit/i.test(message)) {
      return Response.json(
        { error: "Muitas pesquisas em pouco tempo, aguarde um minuto." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
    return Response.json(
      {
        error:
          "Não foi possível pesquisar os aparelhos agora. Você ainda pode salvar a lista e montar o treino.",
      },
      { status: 502 },
    );
  }
}
