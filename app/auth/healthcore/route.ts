import { exchangeHealthcoreCode } from "@/lib/healthcore-exchange";
import { fitSessionCookieHeader } from "@/lib/fit-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_TTL_SECONDS = 60 * 60 * 12;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") || "").trim();
  const issuer = (url.searchParams.get("issuer") || "").trim();
  if (!code || !issuer) {
    return new Response("Code ou issuer ausente.", { status: 400 });
  }

  try {
    const exchanged = await exchangeHealthcoreCode({ code, issuer });
    if (!exchanged.fit_training_enabled) {
      return new Response("FitCore não liberado.", { status: 403 });
    }
    const session = {
      patientFhirId: exchanged.patient_fhir_id,
      tenantSchema: exchanged.tenant_schema,
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    };
    const redirectTo = new URL("/", url.origin);
    redirectTo.searchParams.set("from", "healthcore");
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectTo.toString(),
        "Set-Cookie": fitSessionCookieHeader(session),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return new Response("Falha ao autenticar no FitCore. Volte ao portal e tente de novo.", {
      status: 400,
    });
  }
}
