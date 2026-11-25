import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const api=readFileSync("functions/api/teacher-data.js","utf8");
const dashboard=readFileSync("lexacademicenglish_multipage/teacher/index.html","utf8");

test("teacher API returns individual learner progress from the private database",()=>{
  assert.match(api,/FROM learners l JOIN course_enrolments/);
  assert.match(api,/LEFT JOIN module_progress/);
  assert.match(api,/vocabularyReviews/);
  assert.match(api,/assessmentAttempts/);
  assert.match(api,/teacherFeedback/);
});

test("teacher feedback writes require verified teacher identity and an active learner lookup",()=>{
  assert.match(api,/export async function onRequestPost/);
  assert.match(api,/verifyTeacherIdentity\(request, env\)/);
  assert.match(api,/WHERE lower\(l\.email\)=\?/);
  assert.match(api,/INSERT INTO teacher_feedback/);
  assert.match(api,/feedback.length > 2000/);
});

test("teacher dashboard exposes a separate individual progress view and feedback composer",()=>{
  assert.match(dashboard,/data-view="progress"/);
  assert.match(dashboard,/id="progressView"/);
  assert.match(dashboard,/function openProgressDrawer/);
  assert.match(dashboard,/action:'teacher_feedback'/);
  assert.match(dashboard,/credentials:'same-origin'/);
});
