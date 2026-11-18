/**
 * Public browser origin(s) for FitCore CSRF checks and redirects.
 *
 * Behind Docker/nginx, `new URL(req.url).origin` is the internal listen
 * address (e.g. http://0.0.0.0:3000), while the browser sends
 * Origin: https://fit.rphealthtech.com — so mutating routes must compare
 * against FITCORE_PUBLIC_URL (and optional FITCORE_ALLOWED_ORIGINS), not
 * the raw request URL.
 */

function tryOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

/** Origins allowed for browser mutating requests (no wildcards). */
export function configuredPublicOrigins(): string[] {
  const origins = new Set<string>();
  const primary = tryOrigin(process.env.FITCORE_PUBLIC_URL || "");
  if (primary) origins.add(primary);
  for (const part of (process.env.FITCORE_ALLOWED_ORIGINS || "").split(",")) {
    const origin = tryOrigin(part);
    if (origin) origins.add(origin);
  }
  return [...origins];
}

/** Canonical public origin for redirects (SSO callback, etc.). */
export function resolvePublicOrigin(req: Request): string {
  const configured = configuredPublicOrigins()[0];
  if (configured) return configured;

  const proto = (req.headers.get("x-forwarded-proto") || "https")
    .split(",")[0]
    .trim();
  const host = (
    req.headers.get("x-forwarded-host") ||
    req.headers.get("host") ||
    ""
  )
    .split(",")[0]
    .trim();
  if (host) {
    const fromForwarded = tryOrigin(`${proto}://${host}`);
    if (fromForwarded) return fromForwarded;
  }
  return new URL(req.url).origin;
}

/**
 * CSRF gate for cookie-authenticated mutating API calls.
 * Missing Origin is allowed (non-browser / same-site edge cases); when
 * present it must match the configured public allowlist, or — if none is
 * configured — the resolved public / request origin (local dev).
 */
export function isAllowedRequestOrigin(req: Request): boolean {
  const raw = req.headers.get("origin");
  if (!raw) return true;

  const origin = tryOrigin(raw);
  if (!origin) return false;

  const allow = configuredPublicOrigins();
  if (allow.length > 0) return allow.includes(origin);

  return (
    origin === resolvePublicOrigin(req) ||
    origin === new URL(req.url).origin
  );
}
