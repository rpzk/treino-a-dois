import { buildClinicalProgress } from "@/lib/clinical-progress";
import { database, findProfileByHealthcorePatientId } from "@/lib/training-db";
import { localDay } from "@/lib/training-stats";

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

export async function GET(req: Request) {
  if (!verifySecret(req)) {
    return Response.json(
      { detail: "Segredo de exchange FitCore inválido." },
      { status: 403 },
    );
  }

  const patientFhirId = (
    new URL(req.url).searchParams.get("patient_fhir_id") || ""
  ).trim();
  if (!patientFhirId) {
    return Response.json({ detail: "patient_fhir_id obrigatório." }, { status: 400 });
  }

  const todayDay = localDay(new Date().toISOString());

  try {
    const profile = await findProfileByHealthcorePatientId(
      patientFhirId.toLowerCase(),
    );
    if (!profile) {
      return Response.json(
        buildClinicalProgress({
          linked: false,
          sessions: [],
          activeName: null,
          todayDay,
        }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const row = await database()
      .prepare("SELECT data FROM training WHERE profile = ?")
      .bind(profile)
      .first<{ data: string }>();

    let sessions: Array<{ name: string; finished: string | null }> = [];
    let activeName: string | null = null;

    if (row?.data) {
      const parsed = JSON.parse(row.data) as {
        sessions?: Array<{ name: string; finished?: string | null }>;
        active?: { name?: string } | null;
      };
      sessions = (parsed.sessions ?? []).map((s) => ({
        name: s.name,
        finished: s.finished ?? null,
      }));
      activeName = parsed.active?.name?.trim() || null;
    }

    return Response.json(
      buildClinicalProgress({
        linked: true,
        sessions,
        activeName,
        todayDay,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(error);
    return Response.json(
      { detail: "Falha ao carregar progresso clínico." },
      { status: 500 },
    );
  }
}