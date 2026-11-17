import { NextResponse, type NextRequest } from "next/server";

/**
 * Defense-in-depth for training APIs: cookie must be present.
 * Full HMAC + expiry + profile binding stays in `requireFitSession`
 * (Node route handlers — Edge middleware cannot reuse node:crypto HMAC).
 */
// Must match `FIT_SESSION_COOKIE` in lib/fit-session.ts (cannot import Node crypto module here).
const FIT_SESSION_COOKIE = "fitcore_session";

export function middleware(request: NextRequest) {
  const token = request.cookies.get(FIT_SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(
      { error: "Sessão FitCore ausente. Abra pelo portal do paciente." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/training", "/api/training/:path*"],
};
