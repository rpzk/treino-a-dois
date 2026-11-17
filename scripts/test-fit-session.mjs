import assert from "node:assert/strict";
import {
  clearFitSessionCookieHeader,
  decodeFitSession,
  encodeFitSession,
  FIT_SESSION_COOKIE,
  fitSessionCookieHeader,
  readFitSessionFromRequest,
} from "../lib/fit-session.ts";
import {
  buildExchangeUrl,
  normalizeIssuer,
  parseExchangeResult,
} from "../lib/healthcore-exchange.ts";
import { assertProfileAllowed } from "../lib/profile-access.ts";

process.env.FITCORE_SESSION_SECRET = "test-fit-session-secret-part2";

const session = {
  patientFhirId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  tenantSchema: "clinica_rp",
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const token = encodeFitSession(session);
assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
assert.deepEqual(decodeFitSession(token), session);
assert.equal(decodeFitSession(null), null);
assert.equal(decodeFitSession("not-a-token"), null);
assert.equal(decodeFitSession(`${token}x`), null);

const expired = encodeFitSession({ ...session, exp: Math.floor(Date.now() / 1000) - 10 });
assert.equal(decodeFitSession(expired), null, "expired session rejected");

const cookie = fitSessionCookieHeader(session);
assert.match(cookie, new RegExp(`^${FIT_SESSION_COOKIE}=`));
assert.match(cookie, /Path=\//);
assert.match(cookie, /HttpOnly/);
assert.match(cookie, /SameSite=Lax/);
assert.match(cookie, /Max-Age=\d+/);

const clear = clearFitSessionCookieHeader();
assert.match(clear, new RegExp(`^${FIT_SESSION_COOKIE}=;`));
assert.match(clear, /Max-Age=0/);

const req = new Request("https://fit.rphealthtech.com/api/session", {
  headers: { cookie: `${FIT_SESSION_COOKIE}=${encodeURIComponent(token)}` },
});
assert.deepEqual(readFitSessionFromRequest(req), session);
assert.equal(
  readFitSessionFromRequest(new Request("https://fit.rphealthtech.com/api/session")),
  null,
);

assert.equal(
  normalizeIssuer("http://rp.rphealthtech.com/"),
  "https://rp.rphealthtech.com",
);
assert.equal(
  buildExchangeUrl("http://rp.rphealthtech.com"),
  "https://rp.rphealthtech.com/api/v1/portal/my-training/exchange/",
);
assert.equal(
  buildExchangeUrl("https://demo.rphealthtech.com/"),
  "https://demo.rphealthtech.com/api/v1/portal/my-training/exchange/",
);

const parsed = parseExchangeResult({
  patient_fhir_id: "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
  tenant_schema: "clinica_rp",
  fit_training_enabled: true,
});
assert.equal(parsed.patient_fhir_id, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
assert.equal(parsed.tenant_schema, "clinica_rp");
assert.equal(parsed.fit_training_enabled, true);

assert.throws(() => parseExchangeResult({ patient_fhir_id: "nope", tenant_schema: "x" }));
assert.throws(() =>
  parseExchangeResult({
    patient_fhir_id: session.patientFhirId,
    tenant_schema: "public",
    fit_training_enabled: true,
  }),
);

const linked = "hc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const other = "hc_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
assert.equal(assertProfileAllowed(null, linked)?.status, 400);
assert.equal(assertProfileAllowed(linked, null)?.status, 404);
assert.equal(assertProfileAllowed(other, linked)?.status, 403);
assert.equal(assertProfileAllowed(linked, linked), null);

console.log("fit-session + exchange contract checks passed");
