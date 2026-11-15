import { exercises } from "@/lib/training";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same check as app/api/internal/provision/route.ts.
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
