import assert from "node:assert/strict";
import { clearFitSessionCookieHeader, FIT_SESSION_COOKIE } from "../lib/fit-session.ts";

const h = clearFitSessionCookieHeader();
assert.match(h, new RegExp(`^${FIT_SESSION_COOKIE}=;`));
assert.match(h, /Path=\//);
assert.match(h, /HttpOnly/);
assert.match(h, /SameSite=Lax/);
assert.match(h, /Max-Age=0/);
console.log("fit-session clear-cookie checks passed");