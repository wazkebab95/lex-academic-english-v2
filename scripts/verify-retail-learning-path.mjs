#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const file = "lexacademicenglish_multipage/students/retail/learning-path/index.html";
const html = fs.readFileSync(file, "utf8");
const checks = [];
function check(label, fn) {
  fn();
  checks.push(label);
}

const jsonTag = html.match(/<script type="application\\/json" id="curriculum-data">([\\s\\S]*?)<\\/script>/i);
assert.ok(jsonTag, "curriculum-data JSON script must exist");
const curriculum = JSON.parse(jsonTag[1]);
const expected = { vocabulary: 6, grammar: 6, communication: 5, assessment: 10 };

check("five modules in the expected order", () => {
  assert.deepEqual(curriculum.modules.map(m => m.id), ["vocabulary", "grammar", "communication", "case-study", "assessment"]);
});
check("scored module question counts", () => {
  for (const [id, count] of Object.entries(expected)) {
    const module = curriculum.modules.find(m => m.id === id);
    assert.equal(module?.type, "quiz", id + " must be a scored quiz");
    assert.equal(module.questions.length, count, id + " question count");
  }
});
check("case study is not auto-scored", () => {
  const item = curriculum.modules.find(m => m.id === "case-study");
  assert.equal(item?.type, "case");
  assert.equal(item?.questions.length, 0);
});
check("answer keys and explanations are valid", () => {
  for (const module of curriculum.modules.filter(m => m.type === "quiz")) {
    for (const q of module.questions) {
      assert.ok(Array.isArray(q.options) && q.options.length >= 2, module.id + " options");
      assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, module.id + " answer index");
      assert.ok(typeof q.explanation === "string" && q.explanation.trim().length > 0, module.id + " explanation");
    }
  }
});
check("unique HTML IDs", () => {
  const ids = [...html.matchAll(/\\bid=["']([^"']+)["']/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size, "duplicate id attributes found");
});
check("all static byId references resolve", () => {
  const ids = new Set([...html.matchAll(/\\bid=["']([^"']+)["']/g)].map(m => m[1]));
  for (const match of html.matchAll(/byId\\(["']([^"']+)["']\\)/g)) {
    assert.ok(ids.has(match[1]), "missing DOM id: " + match[1]);
  }
});
check("inline scripts parse without execution", () => {
  const tags = [...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)];
  for (const [, attrs, code] of tags) {
    if (/\\bsrc\\s*=|application\\/json/i.test(attrs)) continue;
    new vm.Script(code, { filename: file });
  }
});
check("no external script or stylesheet dependencies", () => {
  assert.doesNotMatch(html, /<script\\b[^>]*\\bsrc\\s*=/i);
  assert.doesNotMatch(html, /<link\\b[^>]*rel=["']stylesheet["'][^>]*href=["']https?:/i);
});
check("no browser storage, network submission or unsafe HTML sinks", () => {
  assert.doesNotMatch(html, /\\b(?:localStorage|sessionStorage|indexedDB)\\b/i);
  assert.doesNotMatch(html, /\\b(?:fetch|XMLHttpRequest|WebSocket)\\b/i);
  assert.doesNotMatch(html, /\\b(?:innerHTML|outerHTML|insertAdjacentHTML)\\b/i);
  assert.doesNotMatch(html, /\\son[a-z]+\\s*=/i);
});
check("progress and feedback accessibility hooks exist", () => {
  assert.match(html, /role=["']progressbar["']/i);
  assert.match(html, /aria-live=["'](?:polite|assertive)["']/i);
  assert.match(html, /:focus-visible|focus-visible/i);
});

console.log("Retail learning-path QA passed (" + checks.length + "/" + checks.length + " checks):");
for (const label of checks) console.log(" - " + label);
