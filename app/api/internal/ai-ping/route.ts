import { healthcoreAiComplete } from "@/lib/healthcore-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifySecret(req: Request): boolean {
  const expected = process.env.FITCORE_EXCHANGE_SECRET?.trim() || "";
  if (!expected) return false;
  const provided = req.headers.get("x-fitcore-exchange-secret")?.trim() || "";
  if (!provided || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Ops smoke: FitCore → HealthCore AI proxy (fitcore.ping). */
export async function POST(req: Request) {
  if (!verifySecret(req)) {
    return Response.json({ detail: "Segredo inválido." }, { status: 403 });
  }

  let body: { tenant_schema?: string; issuer?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const tenantSchema = (body.tenant_schema || "clinica_rp").trim();
  try {
    const result = await healthcoreAiComplete({
      messages: [
        {
          role: "system",
          content: "Responda em português, uma frase curta.",
        },
        {
          role: "user",
          content: "Confirme que o proxy FitCore→HealthCore está ativo. Diga apenas: ok",
        },
      ],
      purpose: "fitcore.ping",
      tenantSchema,
      issuer: body.issuer,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error(error);
    return Response.json(
      { detail: error instanceof Error ? error.message : "Falha no ping de IA." },
      { status: 502 },
    );
  }
}
