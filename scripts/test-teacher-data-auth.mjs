import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";

globalThis.crypto ||= webcrypto;
const source = readFileSync("functions/api/teacher-data.js", "utf8");
const { onRequestGet } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

const teamOrigin = "https://teamsiuuu.cloudflareaccess.com";
const audience = "fex-teacher-api-test-audience";
const allowedEmail = "teacher@example.test";
const encoder = new TextEncoder();
const pair = await webcrypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"]
);
const publicJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
Object.assign(publicJwk, { kid: "teacher-test-key", alg: "RS256", use: "sig" });

function base64url(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function makeToken(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "teacher-test-key" }));
  const claims = base64url(JSON.stringify({
    iss: teamOrigin, aud: [audience], email: allowedEmail,
    exp: now + 3600, nbf: now - 10, iat: now, ...overrides
  }));
  const unsigned = header + "." + claims;
  const signature = await webcrypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" }, pair.privateKey, encoder.encode(unsigned)
  );
  return unsigned + "." + base64url(signature);
}

const env = {
  CF_ACCESS_TEAM_DOMAIN: teamOrigin,
  TEACHER_ACCESS_AUD: audience,
  TEACHER_ALLOWED_EMAILS: allowedEmail,
  GOOGLE_SHEET_WEBHOOK_URL: "https://script.example.test/exec"
};

async function invoke({ token, claims, settings = {}, upstreamStatus = 200, identityHeader } = {}) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === teamOrigin + "/cdn-cgi/access/certs") {
      return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 });
    }
    if (url.startsWith("https://script.example.test/exec")) {
      return new Response(JSON.stringify({
        generatedAt: "2026-01-01T00:00:00.000Z",
        ieltsResults: [],
        writingSubmissions: []
      }), { status: upstreamStatus });
    }
    throw new Error("Unexpected outbound request");
  };
  try {
    const jwt = token || await makeToken(claims || {});
    const headers = { "Cf-Access-Jwt-Assertion": jwt };
    if (identityHeader) headers["Cf-Access-Authenticated-User-Email"] = identityHeader;
    const request = new Request("https://example.test/api/teacher-data", { headers });
    const response = await onRequestGet({ request, env: { ...env, ...settings } });
    return { status: response.status, body: await response.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("rejects requests without a Cloudflare Access JWT", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("must not fetch"); };
  try {
    const request = new Request("https://example.test/api/teacher-data");
    const response = await onRequestGet({ request, env });
    assert.equal(response.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fails closed when the teacher audience or allowlist is missing", async () => {
  const result = await invoke({ settings: { TEACHER_ACCESS_AUD: "" } });
  assert.equal(result.status, 503);
  assert.ok(!result.calls.some(url => url.startsWith("https://script.example.test/")));
});

test("rejects an incorrect Access audience", async () => {
  const result = await invoke({ claims: { aud: ["wrong-audience"] } });
  assert.equal(result.status, 401);
  assert.ok(!result.calls.some(url => url.startsWith("https://script.example.test/")));
});

test("rejects identities outside the teacher allowlist", async () => {
  const result = await invoke({ claims: { email: "student@example.test" } });
  assert.equal(result.status, 403);
  assert.ok(!result.calls.some(url => url.startsWith("https://script.example.test/")));
});

test("rejects a mismatch between the verified JWT and Access identity header", async () => {
  const result = await invoke({ identityHeader: "different@example.test" });
  assert.equal(result.status, 401);
});

test("allows a verified, allowlisted teacher and returns only the dashboard contract", async () => {
  const result = await invoke({ identityHeader: allowedEmail });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.instructor, allowedEmail);
  assert.equal(Array.isArray(result.body.ieltsResults), true);
  assert.equal(Array.isArray(result.body.writingSubmissions), true);
  assert.equal(result.body.ieltsResults.length, 0);
  assert.equal(result.body.writingSubmissions.length, 0);
  assert.ok(result.calls.some(url => url.startsWith("https://script.example.test/exec?action=teacher_dashboard")));
});

test("does not expose upstream failure details", async () => {
  const result = await invoke({ upstreamStatus: 503 });
  assert.equal(result.status, 502);
  assert.deepEqual(result.body, { ok: false, error: "Teacher data is temporarily unavailable." });
});
