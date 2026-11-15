import { createHmac, timingSafeEqual } from "node:crypto";

export const FIT_SESSION_COOKIE = "fitcore_session";

export type FitSession = {
  patientFhirId: string;
  tenantSchema: string;
  exp: number;
};

function sessionSecret(): string {
  const secret =
    process.env.FITCORE_SESSION_SECRET?.trim() ||
    process.env.FITCORE_EXCHANGE_SECRET?.trim() ||
    "";
  if (!secret) {
    throw new Error("FITCORE_SESSION_SECRET (or FITCORE_EXCHANGE_SECRET) missing");
  }
  return secret;
}

function sign(payloadB64: string): string {
  return createHmac("sha256", sessionSecret()).update(payloadB64).digest("base64url");
}

export function encodeFitSession(session: FitSession): string {
  const payloadB64 = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function decodeFitSession(token: string | undefined | null): FitSession | null {
  if (!token) return null;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return null;
  try {
    const expected = sign(payloadB64);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as FitSession;
    if (!parsed?.patientFhirId || !parsed?.tenantSchema || !parsed?.exp) return null;
    if (parsed.exp * 1000 <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function readFitSessionFromRequest(req: Request): FitSession | null {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${FIT_SESSION_COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.slice(FIT_SESSION_COOKIE.length + 1));
  return decodeFitSession(value);
}

export function fitSessionCookieHeader(session: FitSession): string {
  const token = encodeFitSession(session);
  const maxAge = Math.max(60, session.exp - Math.floor(Date.now() / 1000));
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${FIT_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearFitSessionCookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${FIT_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
