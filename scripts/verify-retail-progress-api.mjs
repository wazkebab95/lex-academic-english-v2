#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import { webcrypto } from "node:crypto";

assert.ok(globalThis.crypto && globalThis.crypto.subtle, "Node must expose Web Crypto for the API tests");

const source = fs.readFileSync(new URL("../functions/students/retail/api/progress.js", import.meta.url), "utf8");
const moduleUrl = "data:text/javascript;base64," + Buffer.from(source, "utf8").toString("base64");
const api = await import(moduleUrl);

const issuer = "https://lex-practice-test.cloudflareaccess.com";
const audience = "retail-test-audience";
const keyPair = await webcrypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"]
);
const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
publicJwk.kid = "qa-retail-key";
publicJwk.use = "sig";
publicJwk.alg = "RS256";

const originalFetch = globalThis.fetch;
globalThis.fetch = async function (url) {
  if (String(url) !== issuer + "/cdn-cgi/access/certs") return new Response("unavailable", { status: 503 });
  return new Response(JSON.stringify({ keys: [publicJwk] }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

async function makeToken(overrides, signingKey) {
  const header = { alg: "RS256", typ: "JWT", kid: "qa-retail-key" };
  const now = Math.floor(Date.now() / 1000);
  const claims = Object.assign({
    iss: issuer,
    aud: [audience],
    sub: "student-A",
    exp: now + 600,
    nbf: now - 10
  }, overrides || {});
  const first = base64url(JSON.stringify(header));
  const second = base64url(JSON.stringify(claims));
  const signingInput = first + "." + second;
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey || keyPair.privateKey,
    new TextEncoder().encode(signingInput)
  );
  return signingInput + "." + base64url(signature);
}

function createDatabase() {
  const rows = new Map();
  return {
    rows,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              assert.match(sql, /^SELECT /);
              return rows.get(values[0] + "|" + values[1]) || null;
            },
            async run() {
              if (sql.startsWith("INSERT ")) {
                rows.set(values[0] + "|" + values[1], {
                  progress_json: values[2],
                  updated_at: values[3]
                });
                return { success: true };
              }
              if (sql.startsWith("DELETE ")) {
                rows.delete(values[0] + "|" + values[1]);
                return { success: true };
              }
              throw new Error("Unexpected SQL in test database");
            }
          };
        }
      };
    }
  };
}

const database = createDatabase();
const env = {
  ACCESS_TEAM_DOMAIN: issuer,
  ACCESS_AUD: audience,
  RETAIL_PROGRESS_DB: database
};

async function call(method, token, body, overrides) {
  const headers = Object.assign({}, overrides && overrides.headers);
  if (token) headers["Cf-Access-Jwt-Assertion"] = token;
  let requestBody;
  if (body !== undefined) {
    requestBody = typeof body === "string" ? body : JSON.stringify(body);
    if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
  }
  const request = new Request("https://lexacademicenglish.co.uk/students/retail/api/progress", {
    method,
    headers,
    body: requestBody
  });
  const response = await api.onRequest({
    request,
    env: Object.assign({}, env, overrides && overrides.env)
  });
  return { response, data: await response.json() };
}

const validProgress = {
  version: 1,
  courseId: "retail-business-english",
  answers: {
    vocabulary: [0, 1, null, 2, 0, 1],
    grammar: [],
    communication: [],
    assessment: []
  },
  caseReviewed: false
};

const checks = [];
async function check(label, fn) {
  await fn();
  checks.push(label);
}

await check("requests without a Cloudflare Access JWT are rejected", async () => {
  const result = await call("GET", null);
  assert.equal(result.response.status, 401);
});

await check("JWTs with the wrong Access audience are rejected", async () => {
  const token = await makeToken({ aud: ["different-audience"] });
  const result = await call("GET", token);
  assert.equal(result.response.status, 401);
});

await check("expired Access JWTs are rejected", async () => {
  const token = await makeToken({ exp: Math.floor(Date.now() / 1000) - 60 });
  const result = await call("GET", token);
  assert.equal(result.response.status, 401);
});

await check("JWT signatures are cryptographically verified", async () => {
  const otherPair = await webcrypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const token = await makeToken({}, otherPair.privateKey);
  const result = await call("GET", token);
  assert.equal(result.response.status, 401);
});

await check("an authenticated student receives an empty initial record", async () => {
  const token = await makeToken();
  const result = await call("GET", token);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.progress, null);
  assert.equal(result.response.headers.get("Cache-Control"), "no-store, private");
});

await check("valid progress stores only answer indices and the case-review flag", async () => {
  const token = await makeToken();
  const result = await call("PUT", token, validProgress);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.success, true);
  const row = database.rows.get("student-A|retail-business-english");
  assert.ok(row);
  const stored = JSON.parse(row.progress_json);
  assert.deepEqual(stored, validProgress);
  assert.equal(JSON.stringify(stored).includes("email"), false);
  assert.equal(JSON.stringify(stored).includes("caseText"), false);
  assert.equal(JSON.stringify(stored).includes("score"), false);
});

await check("a different Access subject cannot read another student's record", async () => {
  const token = await makeToken({ sub: "student-B" });
  const result = await call("GET", token);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.progress, null);
});

await check("unapproved fields such as written case-study text are rejected", async () => {
  const token = await makeToken();
  const result = await call("PUT", token, Object.assign({}, validProgress, { caseText: "private draft" }));
  assert.equal(result.response.status, 400);
});

await check("invalid option indexes are rejected", async () => {
  const token = await makeToken();
  const invalid = JSON.parse(JSON.stringify(validProgress));
  invalid.answers.vocabulary[0] = 3;
  const result = await call("PUT", token, invalid);
  assert.equal(result.response.status, 400);
});

await check("unknown module identifiers are rejected", async () => {
  const token = await makeToken();
  const invalid = JSON.parse(JSON.stringify(validProgress));
  invalid.answers.personal = [0];
  const result = await call("PUT", token, invalid);
  assert.equal(result.response.status, 400);
});

await check("oversized request bodies are rejected", async () => {
  const token = await makeToken();
  const result = await call("PUT", token, "x".repeat(9000));
  assert.equal(result.response.status, 413);
});

await check("non-JSON progress writes are rejected", async () => {
  const token = await makeToken();
  const result = await call("PUT", token, "{}", { headers: { "Content-Type": "text/plain" } });
  assert.equal(result.response.status, 415);
});

await check("students can delete only their own saved record", async () => {
  const token = await makeToken();
  const result = await call("DELETE", token);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.deleted, true);
  assert.equal(database.rows.has("student-A|retail-business-english"), false);
});

await check("missing D1 configuration fails closed", async () => {
  const token = await makeToken();
  const result = await call("GET", token, undefined, { env: { RETAIL_PROGRESS_DB: undefined } });
  assert.equal(result.response.status, 503);
});

await check("unsupported HTTP methods are rejected", async () => {
  const token = await makeToken();
  const result = await call("POST", token, {});
  assert.equal(result.response.status, 405);
});

await check("JWKS retrieval failures fail closed", async () => {
  const token = await makeToken();
  const result = await call("GET", token, undefined, {
    env: { ACCESS_TEAM_DOMAIN: "https://unavailable.cloudflareaccess.com" }
  });
  assert.equal(result.response.status, 503);
});

globalThis.fetch = originalFetch;
console.log("Retail progress API QA passed (" + checks.length + "/" + checks.length + " checks):");
for (const label of checks) console.log(" - " + label);
