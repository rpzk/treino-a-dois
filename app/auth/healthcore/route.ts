import { exchangeHealthcoreCode } from "@/lib/healthcore-exchange";
import { fitSessionCookieHeader } from "@/lib/fit-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_TTL_SECONDS = 60 * 60 * 12;

function publicOrigin(req: Request): string {
  const configured = (process.env.FITCORE_PUBLIC_URL || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const proto = (req.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "")
    .split(",")[0]
    .trim();
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

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
    const redirectTo = new URL("/", publicOrigin(req));
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
