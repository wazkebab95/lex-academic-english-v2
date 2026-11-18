import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../functions/api/submit-ielts.js", import.meta.url), "utf8");
const moduleUrl = "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const { onRequestPost } = await import(moduleUrl);

const env = {
  GOOGLE_SHEET_WEBHOOK_URL: "https://script.google.com/macros/s/test/exec",
  RESEND_API_KEY: "test-resend-key",
  INSTRUCTOR_EMAIL: "teacher@example.com"
};

async function invoke(payload, options = {}) {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const status = options.failAt === calls.length ? 503 : 200;
    return new Response("{}", { status });
  };

  try {
    const request = new Request("https://lex.example/api/submit-ielts", {
      method: "POST",
      headers: options.headers || { "Content-Type": "application/json" },
      body: options.rawBody !== undefined ? options.rawBody : JSON.stringify(payload)
    });
    const response = await onRequestPost({ request, env });
    return { response, body: await response.json(), calls };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("accepts the legacy IELTS/Retail form contract and ignores supplied HTML", async () => {
  const { response, body, calls } = await invoke({
    name: "=Learner",
    email: "learner@example.com",
    module: "Retail Business English",
    score: "3 / 4",
    wordCount: 42,
    missedTopics: "Inventory terminology",
    essay: "<img src=x onerror=alert(1)>",
    detailsHtml: "<script>alert('untrusted')</script>"
  });

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(calls.length, 3);

  const sheetPayload = JSON.parse(calls[0].init.body);
  assert.equal(sheetPayload.studentName, "'=Learner");
  assert.match(sheetPayload.details, /Word count: 42/);
  assert.match(sheetPayload.details, /<img src=x onerror=alert\(1\)>/);

  const studentEmail = JSON.parse(calls[1].init.body);
  assert.match(studentEmail.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(studentEmail.html, /<script>alert\('untrusted'\)<\/script>/);
});

test("accepts the canonical Retail submission contract", async () => {
  const { response, body, calls } = await invoke({
    studentName: "Retail Learner",
    studentEmail: "retail@example.com",
    category: "Retail Business English",
    score: "3 / 4",
    bandEstimate: "Instructor review required",
    timeTaken: "Not recorded",
    detailsPlain: "Role: Store Operations\nWritten response not included."
  });

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  const sheetPayload = JSON.parse(calls[0].init.body);
  assert.match(sheetPayload.details, /Written response not included/);
});

test("rejects invalid email before contacting external services", async () => {
  const { response, body, calls } = await invoke({
    name: "Learner",
    email: "not-an-email",
    module: "IELTS Studio",
    score: "4 / 5",
    essay: "A short response"
  });

  assert.equal(response.status, 400);
  assert.equal(body.success, false);
  assert.equal(calls.length, 0);
});

test("rejects requests without JSON content type", async () => {
  const { response, calls } = await invoke({}, {
    headers: { "Content-Type": "text/plain" },
    rawBody: "not json"
  });

  assert.equal(response.status, 415);
  assert.equal(calls.length, 0);
});

test("rejects malformed JSON", async () => {
  const { response, calls } = await invoke({}, { rawBody: "{" });

  assert.equal(response.status, 400);
  assert.equal(calls.length, 0);
});

test("reports upstream service failure without claiming success", async () => {
  const { response, body } = await invoke({
    name: "Learner",
    email: "learner@example.com",
    module: "IELTS Studio",
    score: "4 / 5",
    essay: "A short response"
  }, { failAt: 2 });

  assert.equal(response.status, 502);
  assert.equal(body.success, false);
});
