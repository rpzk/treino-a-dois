import {
  EMPTY_INVENTORY_MESSAGE,
  INVALID_JSON_MESSAGE,
  parseEquipmentVision,
} from "@/lib/equipment-inventory";
import { healthcoreAiVision } from "@/lib/healthcore-ai";
import { requireFitSession } from "@/lib/require-fit-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // decoded bytes per image
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const VISION_SYSTEM =
  "Você identifica equipamentos de academia em fotos. Responda somente com JSON válido, em português do Brasil, sem texto adicional.";
const VISION_PROMPT =
  'Analise as fotos e liste apenas equipamentos de academia visíveis (máquinas, halteres, barras, bancos, polias, anilhas, etc.). Ignore pessoas, objetos pessoais e itens que não sejam equipamento de treino. Responda no formato {"items":[{"label":"Nome curto do equipamento"}]} com nomes curtos e sem repetições.';

function decodedSize(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

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

  let body: { images?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Body inválido." }, { status: 400 });
  }

  const raw = body.images;
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_IMAGES) {
    return Response.json(
      { error: `Envie de 1 a ${MAX_IMAGES} imagens.` },
      { status: 400 },
    );
  }

  const images: { mime: string; dataBase64: string }[] = [];
  for (const entry of raw) {
    const row = (entry && typeof entry === "object" ? entry : {}) as {
      mime?: unknown;
      data_base64?: unknown;
      dataBase64?: unknown;
    };
    const mime = typeof row.mime === "string" ? row.mime.trim().toLowerCase() : "";
    const data = row.data_base64 ?? row.dataBase64;
    const dataBase64 = typeof data === "string" ? data.trim() : "";
    if (!ALLOWED_MIMES.has(mime)) {
      return Response.json(
        { error: "Formato de imagem não suportado (use JPEG, PNG ou WebP)." },
        { status: 400 },
      );
    }
    if (!dataBase64 || !BASE64_RE.test(dataBase64)) {
      return Response.json({ error: "Imagem inválida." }, { status: 400 });
    }
    if (decodedSize(dataBase64) > MAX_IMAGE_BYTES) {
      return Response.json(
        { error: "Imagem muito grande (máx. 2 MB por foto)." },
        { status: 413 },
      );
    }
    images.push({ mime, dataBase64 });
  }

  try {
    const result = await healthcoreAiVision({
      purpose: "fitcore.equipment_vision",
      tenantSchema: auth.ctx.session.tenantSchema,
      patientFhirId: auth.ctx.session.patientFhirId,
      system: VISION_SYSTEM,
      prompt: VISION_PROMPT,
      images,
    });
    const items = parseEquipmentVision(result.content);
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Log the real error server-side only; never leak upstream details to the client.
    console.error("[training/equipment/scan]", error);
    const message = error instanceof Error ? error.message : "";
    // Empty detection is a valid outcome — client can offer manual entry.
    if (message === EMPTY_INVENTORY_MESSAGE) {
      return Response.json(
        { items: [], empty: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (message === INVALID_JSON_MESSAGE) {
      return Response.json(
        {
          error:
            "Não entendemos a identificação. Tente outras fotos ou adicione os equipamentos à mão.",
        },
        { status: 422 },
      );
    }
    if (/\(429\)|rate.?limit/i.test(message)) {
      return Response.json(
        { error: "Muitas leituras em pouco tempo, aguarde um minuto." },
        { status: 429, headers: { "Retry-After": "60" } },
      );
    }
    if (/\(401\)|\(403\)/i.test(message)) {
      return Response.json(
        {
          error:
            "Sessão expirada ou sem permissão para identificar. Volte ao portal e abra o FitCore de novo.",
        },
        { status: 401 },
      );
    }
    return Response.json(
      {
        error:
          "Não foi possível identificar os equipamentos agora. Tente de novo em instantes.",
      },
      { status: 502 },
    );
  }
}
