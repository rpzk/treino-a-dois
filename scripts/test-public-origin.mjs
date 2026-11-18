import assert from "node:assert/strict";
import {
  configuredPublicOrigins,
  isAllowedRequestOrigin,
  resolvePublicOrigin,
} from "../lib/public-origin.ts";

const prevPublic = process.env.FITCORE_PUBLIC_URL;
const prevAllowed = process.env.FITCORE_ALLOWED_ORIGINS;

function restoreEnv() {
  if (prevPublic === undefined) delete process.env.FITCORE_PUBLIC_URL;
  else process.env.FITCORE_PUBLIC_URL = prevPublic;
  if (prevAllowed === undefined) delete process.env.FITCORE_ALLOWED_ORIGINS;
  else process.env.FITCORE_ALLOWED_ORIGINS = prevAllowed;
}

try {
  process.env.FITCORE_PUBLIC_URL = "https://fit.rphealthtech.com/";
  delete process.env.FITCORE_ALLOWED_ORIGINS;
  assert.deepEqual(configuredPublicOrigins(), ["https://fit.rphealthtech.com"]);

  // Production bug: internal listen URL ≠ browser Origin
  const behindProxy = new Request("http://0.0.0.0:3000/api/training", {
    method: "PUT",
    headers: { origin: "https://fit.rphealthtech.com" },
  });
  assert.equal(isAllowedRequestOrigin(behindProxy), true);

  const evil = new Request("http://0.0.0.0:3000/api/training", {
    method: "PUT",
    headers: { origin: "https://evil.example" },
  });
  assert.equal(isAllowedRequestOrigin(evil), false);

  const noOrigin = new Request("http://0.0.0.0:3000/api/training", {
    method: "PUT",
  });
  assert.equal(isAllowedRequestOrigin(noOrigin), true);

  process.env.FITCORE_ALLOWED_ORIGINS =
    "https://fit.rphealthtech.com, https://fit-staging.rphealthtech.com/";
  assert.deepEqual(configuredPublicOrigins(), [
    "https://fit.rphealthtech.com",
    "https://fit-staging.rphealthtech.com",
  ]);
  assert.equal(
    isAllowedRequestOrigin(
      new Request("http://127.0.0.1:3000/api/training", {
        headers: { origin: "https://fit-staging.rphealthtech.com" },
      }),
    ),
    true,
  );

  delete process.env.FITCORE_PUBLIC_URL;
  delete process.env.FITCORE_ALLOWED_ORIGINS;
  const local = new Request("http://localhost:3000/api/training", {
    headers: { origin: "http://localhost:3000" },
  });
  assert.equal(isAllowedRequestOrigin(local), true);
  assert.equal(
    resolvePublicOrigin(
      new Request("http://0.0.0.0:3000/", {
        headers: {
          "x-forwarded-proto": "https",
          "x-forwarded-host": "fit.rphealthtech.com",
        },
      }),
    ),
    "https://fit.rphealthtech.com",
  );

  process.env.FITCORE_PUBLIC_URL = "https://fit.rphealthtech.com";
  assert.equal(
    resolvePublicOrigin(new Request("http://0.0.0.0:3000/")),
    "https://fit.rphealthtech.com",
  );

  console.log("test-public-origin: ok");
} finally {
  restoreEnv();
}
