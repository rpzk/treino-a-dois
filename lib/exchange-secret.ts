/** Shared check for the `X-FitCore-Exchange-Secret` header on /api/internal/* routes. */
export function verifySecret(req: Request): boolean {
  const expected = process.env.FITCORE_EXCHANGE_SECRET?.trim() || "";
  if (!expected) return false;
  const provided = req.headers.get("x-fitcore-exchange-secret")?.trim() || "";
  if (!provided || provided.length !== expected.length) return false;
  // timing-safe-ish compare without importing crypto for short secrets
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return mismatch === 0;
}
