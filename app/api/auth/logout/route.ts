import { clearFitSessionCookieHeader } from "@/lib/fit-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": clearFitSessionCookieHeader(),
      "Cache-Control": "no-store",
    },
  });
}