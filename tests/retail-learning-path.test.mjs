import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../lexacademicenglish_multipage/students/retail/learning-path/index.html", import.meta.url), "utf8");
const dataMatch = html.match(/<script type="application\/json" id="curriculum-data">([\s\S]*?)<\/script>/);
assert.ok(dataMatch, "curriculum JSON block must exist");
const curriculum = JSON.parse(dataMatch[1]);

test("contains the five requested learning modules", () => {
  assert.deepEqual(curriculum.modules.map(m => m.id), ["vocabulary", "grammar", "communication", "case-study", "assessment"]);
});

test("every scored question has valid options, answer and explanation", () => {
  const quizzes = curriculum.modules.filter(m => m.type === "quiz");
  assert.equal(quizzes.length, 4);
  for (const module of quizzes) {
    assert.ok(module.questions.length >= 5, module.id + " should contain at least five questions");
    for (const question of module.questions) {
      assert.ok(question.prompt && question.explanation, module.id + " question needs prompt and explanation");
      assert.ok(Array.isArray(question.options) && question.options.length >= 3);
      assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer < question.options.length);
    }
  }
});

test("case study is explicitly unscored", () => {
  const item = curriculum.modules.find(m => m.id === "case-study");
  assert.equal(item.type, "case");
  assert.deepEqual(item.questions, []);
  assert.match(html, /not given an automatic mark/i);
});

test("application script parses and required accessible controls exist", () => {
  const scripts = [...html.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new vm.Script(scripts[0][1]));
  assert.match(html, /name="viewport"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /for="profile-level"/);
  assert.match(html, /for="profile-role"/);
});

test("prototype does not transmit or persist learner data", () => {
  assert.doesNotMatch(html, /localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest|sendBeacon/i);
  assert.match(html, /remain in this page session only/i);
  assert.match(html, /No name, email, employer details or written answers are transmitted or saved/i);
});

test("page does not contain the hard-coded learner name found in an accidental duplicate", () => {
  assert.doesNotMatch(html, /Erhan/i);
});
