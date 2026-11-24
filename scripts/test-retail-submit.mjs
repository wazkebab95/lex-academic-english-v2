import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

globalThis.crypto ||= webcrypto;
const functionSource = readFileSync("functions/students/retail/submit.js", "utf8");
const { onRequestPost } = await import("data:text/javascript;base64," + Buffer.from(functionSource).toString("base64"));

const teamOrigin = "https://lex-team.cloudflareaccess.com";
const audience = "retail-learning-path-aud";
const allowedEmail = "student@example.com";
const instructorEmail = "tutor@example.com";
const encoder = new TextEncoder();

const signingPair = await webcrypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"]
);
const publicJwk = await webcrypto.subtle.exportKey("jwk", signingPair.publicKey);
publicJwk.kid = "retail-test-key";
publicJwk.alg = "RS256";
publicJwk.use = "sig";

function base64url(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function makeToken(overrides = {}, privateKey = signingPair.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "retail-test-key" }));
  const claims = base64url(JSON.stringify({
    iss: teamOrigin,
    aud: [audience],
    email: allowedEmail,
    exp: now + 3600,
    nbf: now - 10,
    iat: now,
    ...overrides
  }));
  const unsigned = header + "." + claims;
  const signature = await webcrypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    encoder.encode(unsigned)
  );
  return unsigned + "." + base64url(signature);
}

const defaultEnv = {
  CF_ACCESS_TEAM_DOMAIN: teamOrigin,
  RETAIL_ACCESS_AUD: audience,
  RETAIL_ALLOWED_EMAILS: allowedEmail,
  RESEND_API_KEY: "test-resend-key",
  INSTRUCTOR_EMAIL: instructorEmail
};

const defaultPayload = {
  consentToSubmit: true,
  correct: 3,
  total: 4,
  role: "Buying / procurement",
  missedTopics: "Supplier lead times"
};

async function invoke({
  payload = defaultPayload,
  token,
  env = {},
  contentType = "application/json",
  origin = "https://lexacademicenglish.co.uk",
  resendStatus = 200
} = {}) {
  const originalFetch = globalThis.fetch;
  let sentEmail = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === teamOrigin + "/cdn-cgi/access/certs") {
      return new Response(JSON.stringify({ keys: [publicJwk] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url === "https://api.resend.com/emails") {
      sentEmail = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: "test-email-id" }), {
        status: resendStatus,
        headers: { "Content-Type": "application/json" }
      });
    }
    throw new Error("Unexpected outbound request: " + url);
  };

  try {
    const headers = { "Content-Type": contentType };
    if (origin) headers.Origin = origin;
    if (token) headers["Cf-Access-Jwt-Assertion"] = token;
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    const request = new Request("https://lexacademicenglish.co.uk/students/retail/submit", {
      method: "POST",
      headers,
      body
    });
    const response = await onRequestPost({ request, env: { ...defaultEnv, ...env } });
    return { status: response.status, body: await response.json(), sentEmail };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("rejects requests without a Cloudflare Access assertion", async () => {
  const result = await invoke();
  assert.equal(result.status, 401);
  assert.equal(result.sentEmail, null);
});

test("rejects a token with an invalid signature", async () => {
  const otherPair = await webcrypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const result = await invoke({ token: await makeToken({}, otherPair.privateKey) });
  assert.equal(result.status, 401);
  assert.equal(result.sentEmail, null);
});

test("rejects an incorrect Access application audience", async () => {
  const result = await invoke({ token: await makeToken({ aud: ["another-application"] }) });
  assert.equal(result.status, 401);
});

test("rejects a signed-in identity outside the Retail allowlist", async () => {
  const result = await invoke({ token: await makeToken({ email: "other@example.com" }) });
  assert.equal(result.status, 403);
  assert.equal(result.sentEmail, null);
});

test("derives student identity from the verified token and omits unconsented writing", async () => {
  const result = await invoke({
    token: await makeToken(),
    payload: { ...defaultPayload, email: "spoofed@example.com", includeWrittenResponse: false, writtenResponse: "<script>private</script>" }
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.match(result.sentEmail.html, /student@example\.com/);
  assert.doesNotMatch(result.sentEmail.html, /spoofed@example\.com/);
  assert.doesNotMatch(result.sentEmail.html, /private/);
  assert.match(result.sentEmail.html, /did not opt in to sharing the written response/);
});

test("escapes written responses when the learner explicitly opts in", async () => {
  const responseText = '<script>alert("x")</script>';
  const result = await invoke({
    token: await makeToken(),
    payload: { ...defaultPayload, role: '<b>Buyer</b>', includeWrittenResponse: true, writtenResponse: responseText }
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.writtenResponseIncluded, true);
  assert.ok(result.sentEmail.html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  assert.ok(result.sentEmail.html.includes("&lt;b&gt;Buyer&lt;/b&gt;"));
  assert.ok(!result.sentEmail.html.includes(responseText));
});

test("requires explicit score-submission consent", async () => {
  const result = await invoke({ token: await makeToken(), payload: { ...defaultPayload, consentToSubmit: false } });
  assert.equal(result.status, 400);
  assert.equal(result.sentEmail, null);
});

test("rejects invalid scores", async () => {
  const result = await invoke({ token: await makeToken(), payload: { ...defaultPayload, correct: 5 } });
  assert.equal(result.status, 400);
  assert.equal(result.sentEmail, null);
});

test("rejects oversized request bodies", async () => {
  const result = await invoke({
    token: await makeToken(),
    payload: JSON.stringify({ correct: 3, total: 4, role: "x".repeat(20000) })
  });
  assert.equal(result.status, 413);
  assert.equal(result.sentEmail, null);
});

test("rejects cross-origin submissions", async () => {
  const result = await invoke({ token: await makeToken(), origin: "https://attacker.example" });
  assert.equal(result.status, 403);
  assert.equal(result.sentEmail, null);
});

test("fails closed when Access configuration is missing", async () => {
  const result = await invoke({ token: await makeToken(), env: { RETAIL_ALLOWED_EMAILS: "" } });
  assert.equal(result.status, 503);
  assert.equal(result.sentEmail, null);
});

test("does not report success when the email provider rejects delivery", async () => {
  const result = await invoke({ token: await makeToken(), resendStatus: 503 });
  assert.equal(result.status, 502);
  assert.equal(result.body.success, false);
});

test("rejects non-JSON requests", async () => {
  const result = await invoke({ token: await makeToken(), contentType: "text/plain" });
  assert.equal(result.status, 415);
  assert.equal(result.sentEmail, null);
});

test("legacy Retail page no longer stores identity or written drafts in browser storage", async () => {
  const fs = await import("node:fs");
  const page = fs.readFileSync("lexacademicenglish_multipage/students/retail/index.html", "utf8");
  assert.doesNotMatch(page, /\b(?:localStorage|sessionStorage|indexedDB)\b/i);
  assert.doesNotMatch(page, /fetch\(["']\/api\/submit-ielts/i);
  assert.doesNotMatch(page, /\binnerHTML\b/i);
  assert.match(page, /fetch\(["']\/students\/retail\/submit["']/i);
  assert.match(page, /retail-submit-consent/);
  assert.match(page, /retail-writing-consent/);
  assert.doesNotMatch(page, /retail-student-name|retail-student-email/);
  const scriptTags = [...page.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [, attributes, source] of scriptTags) {
    if (/\bsrc\s*=|application\/json/i.test(attributes)) continue;
    new vm.Script(source, { filename: "retail/index.html" });
  }
});
