import { verifySecret } from "@/lib/exchange-secret";
import { exercises } from "@/lib/training";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!verifySecret(req)) {
    return Response.json(
      { detail: "Segredo de exchange FitCore inválido." },
      { status: 403 },
    );
  }
  return Response.json(
    { exercises: exercises.map(({ name, group }) => ({ name, group })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
