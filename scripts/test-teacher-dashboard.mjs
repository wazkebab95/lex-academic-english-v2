import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile(new URL("../lexacademicenglish_multipage/teacher/index.html", import.meta.url), "utf8");

test("teacher dashboard has learner and submission views", () => {
  assert.match(page, /data-view="learners"/);
  assert.match(page, /data-view="submissions"/);
  assert.match(page, /id="learnerBody"/);
  assert.match(page, /id="submissionBody"/);
});

test("teacher dashboard loads only through the protected teacher API", () => {
  assert.match(page, /fetch\('\\/api\\/teacher-data'/);
  assert.match(page, /credentials:'same-origin'/);
  assert.match(page, /cache:'no-store'/);
  assert.match(page, /<meta name="robots" content="noindex,nofollow"/);
});

test("untrusted learner content is rendered as text, not HTML", () => {
  assert.match(page, /textContent/);
  assert.doesNotMatch(page, /\.innerHTML\s*=/);
  assert.doesNotMatch(page, /insertAdjacentHTML\s*\(/);
});

test("dashboard distinguishes expired and unauthorised teacher sessions", () => {
  assert.match(page, /response\.status===401/);
  assert.match(page, /response\.status===403/);
  assert.match(page, /response\.redirected/);
});

test("dashboard does not invent course completion or review states", () => {
  assert.doesNotMatch(page, /Needs review|Completed modules|Average progress/);
  assert.match(page, /summary derived from recorded learner activity/i);
});
