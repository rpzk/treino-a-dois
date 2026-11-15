import { database } from "@/lib/training-db";
import { blank, stateSchema } from "@/lib/training";
import {
  assertProfileAllowed,
  requireFitSession,
} from "@/lib/require-fit-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireFitSession(req);
  if (!auth.ok) return auth.response;

  const profile = new URL(req.url).searchParams.get("profile");
  const denied = assertProfileAllowed(profile, auth.ctx.profile);
  if (denied) return denied;

  try {
    const row = await database()
      .prepare("SELECT data,revision FROM training WHERE profile=?")
      .bind(profile)
      .first<{ data: string; revision: number }>();
    return Response.json(
      row
        ? { state: JSON.parse(row.data), revision: row.revision }
        : { state: blank, revision: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: "Não foi possível carregar seus treinos. Tente novamente." },
      { status: 503 },
    );
  }
}

export async function PUT(req: Request) {
  const auth = await requireFitSession(req);
  if (!auth.ok) return auth.response;

  if (
    req.headers.get("origin") &&
    req.headers.get("origin") !== new URL(req.url).origin
  ) {
    return Response.json({ error: "Origem inválida." }, { status: 403 });
  }

  try {
    const body = await req.text();
    if (body.length > 4000000) {
      return Response.json({ error: "Limite de registros atingido." }, { status: 413 });
    }
    const input = JSON.parse(body);
    const denied = assertProfileAllowed(input.profile, auth.ctx.profile);
    if (denied) return denied;

    const parsed = stateSchema.safeParse(input.state);
    if (
      !["lucas", "natalia"].includes(input.profile) ||
      !Number.isInteger(input.revision) ||
      input.revision < 0 ||
      !parsed.success
    ) {
      return Response.json({ error: "Confira os campos do treino." }, { status: 400 });
    }

    const db = database();
    await db
      .prepare("INSERT OR IGNORE INTO training(profile,data,revision) VALUES(?,?,0)")
      .bind(input.profile, JSON.stringify(blank))
      .run();
    const result = await db
      .prepare(
        "UPDATE training SET data=?,revision=revision+1 WHERE profile=? AND revision=?",
      )
      .bind(JSON.stringify(parsed.data), input.profile, input.revision)
      .run();
    if (result.meta.changes !== 1) {
      return Response.json(
        {
          error:
            "Este perfil foi atualizado em outro aparelho. Recarregue os dados antes de continuar.",
        },
        { status: 409 },
      );
    }
    return Response.json({ revision: input.revision + 1 });
  } catch (e) {
    console.error(e);
    return Response.json(
      {
        error:
          "Não foi possível salvar. Seus campos continuam aqui; tente novamente.",
      },
      { status: 503 },
    );
  }
}
