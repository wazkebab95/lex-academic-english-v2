import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

globalThis.crypto ||= webcrypto;
const source = readFileSync("functions/students/api/submissions.js", "utf8");
const { onRequestPost } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const issuer = "https://teamsiuuu.cloudflareaccess.com";
const audience = "student-access-test-audience";
const email = "learner@example.test";
const encoder = new TextEncoder();
const pair = await webcrypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" },
  true, ["sign", "verify"]
);
const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
Object.assign(jwk, { kid: "submission-test-key", alg: "RS256", use: "sig" });
function b64(value) {
  const bytes = typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
  let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function token(claimOverrides = {}) {
  const now = Math.floor(Date.now()/1000);
  const header = b64(JSON.stringify({alg:"RS256",kid:"submission-test-key"}));
  const claims = b64(JSON.stringify({iss:issuer,aud:[audience],email,exp:now+3600,nbf:now-5,iat:now,...claimOverrides}));
  const unsigned = header + "." + claims;
  const signature = await webcrypto.subtle.sign({name:"RSASSA-PKCS1-v1_5"},pair.privateKey,encoder.encode(unsigned));
  return unsigned + "." + b64(signature);
}
function fakeDb() {
  const submissions = new Map(); const calls = [];
  return {
    submissions, calls,
    prepare(sql) {
      const statement = { values: [], bind(...values) { this.values = values; return this; },
        async run() {
          calls.push(sql);
          if (sql.includes("INSERT OR IGNORE INTO student_submissions")) {
            const id = statement.values[0]; const exists = submissions.has(id);
            if (!exists) submissions.set(id,{submission_id:id,learner_id:statement.values[1],submission_type:statement.values[3],title:statement.values[4],prompt:statement.values[5],response_text:statement.values[6],score:statement.values[7],result_label:statement.values[8],word_count:statement.values[9],time_spent:statement.values[10],metadata_json:statement.values[11],backup_status:"pending"});
            return { meta:{changes:exists?0:1} };
          }
          if (sql.includes("UPDATE student_submissions SET backup_status")) { const row=submissions.get(statement.values[3]); if(row){row.backup_status=statement.values[0];row.backup_synced_at=statement.values[1];row.backup_error=statement.values[2];} }
          return { meta:{changes:1} };
        },
        async first() {
          calls.push(sql);
          if (sql.includes("FROM student_submissions WHERE submission_id")) return submissions.get(statement.values[0]) || null;
          return null;
        }
      };
      return statement;
    }
  };
}
async function invoke({ jwt, db, payload, settings = {}, origin = "https://lexacademicenglish.co.uk", sheetStatus = 200, sheetCalls = [] } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url) === issuer + "/cdn-cgi/access/certs") return new Response(JSON.stringify({keys:[jwk]}),{status:200});
    if (String(url) === "https://script.google.test/exec") { sheetCalls.push(JSON.parse(options.body)); return new Response("OK",{status:sheetStatus}); }
    throw new Error("Unexpected outbound request");
  };
  try {
    const headers = {};
    if (jwt !== null) headers["Cf-Access-Jwt-Assertion"] = jwt || await token();
    if (payload !== undefined) headers["Content-Type"]="application/json";
    if (origin) headers.Origin=origin;
    const request = new Request("https://lexacademicenglish.co.uk/students/api/submissions",{
      method:"POST",headers,body:payload===undefined?undefined:JSON.stringify(payload)
    });
    const response = await onRequestPost({request,env:{CF_ACCESS_TEAM_DOMAIN:issuer,RETAIL_ACCESS_AUD:audience,FEX_DB:db,...settings}});
    return {status:response.status,body:await response.json()};
  } finally { globalThis.fetch=originalFetch; }
}

test("requires a valid Cloudflare Access student identity", async () => {
  const r=await invoke({jwt:null,db:fakeDb(),payload:{type:"writing"}});
  assert.equal(r.status,401);
});
test("rejects a supplied email that differs from the verified Access identity", async () => {
  const r=await invoke({db:fakeDb(),payload:{type:"writing",studentName:"Learner",studentEmail:"other@example.test",taskType:"Task 2",promptTitle:"Prompt",essayText:"A sufficiently long answer."}});
  assert.equal(r.status,400);
});
test("stores the complete writing response in the learner-scoped D1 record", async () => {
  const db=fakeDb();
  const sheetCalls=[];
  const r=await invoke({db,sheetCalls,settings:{GOOGLE_SHEET_WEBHOOK_URL:"https://script.google.test/exec"},payload:{type:"writing",submissionId:"submission-1234",studentName:"Learner",studentEmail:email,taskType:"Task 2",promptTitle:"A writing prompt",essayText:"This is the full student response.",timeSpent:"12m 4s"}});
  assert.equal(r.status,200); assert.equal(r.body.recorded,true); assert.equal(r.body.submissionId,"submission-1234"); assert.equal(r.body.backupStatus,"synced"); assert.equal(sheetCalls.length,1); assert.equal(sheetCalls[0].action,"log_writing"); assert.equal(sheetCalls[0].submissionId,"submission-1234");
  const saved=db.submissions.get("submission-1234");
  assert.ok(saved); assert.equal(saved.submission_type,"writing"); assert.equal(saved.response_text,"This is the full student response."); assert.equal(saved.backup_status,"synced");
  assert.ok(db.calls.some(sql=>sql.includes("INSERT OR IGNORE INTO student_submissions")));
});
test("uses submission references idempotently and rejects cross-learner reference reuse", async () => {
  const db=fakeDb();
  const payload={type:"writing",submissionId:"submission-1234",studentName:"Learner",studentEmail:email,taskType:"Task 2",promptTitle:"Prompt",essayText:"Response text"};
  const first=await invoke({db,payload}); assert.equal(first.status,200);
  const second=await invoke({db,payload}); assert.equal(second.status,200);
  const otherToken=await token({email:"other@example.test"});
  const third=await invoke({db,payload:{...payload,studentEmail:"other@example.test"},jwt:otherToken});
  assert.equal(third.status,409);
});
test("requires the D1 binding and refuses cross-origin writes", async () => {
  const noDb=await invoke({payload:{type:"writing",studentName:"Learner",studentEmail:email,taskType:"Task 2",promptTitle:"Prompt",essayText:"Response text"}});
  assert.equal(noDb.status,503);
  const cross=await invoke({db:fakeDb(),origin:"https://attacker.example",payload:{type:"writing",studentName:"Learner",studentEmail:email,taskType:"Task 2",promptTitle:"Prompt",essayText:"Response text"}});
  assert.equal(cross.status,403);
});
test("migration defines durable submission content and learner-scoped indexes", () => {
  const sql=readFileSync("migrations/0002_fex_student_submissions.sql","utf8");
  assert.match(sql,/CREATE TABLE IF NOT EXISTS student_submissions/);
  assert.match(sql,/response_text TEXT NOT NULL/);
  assert.match(sql,/REFERENCES learners\(learner_id\)/);
  assert.match(sql,/idx_student_submissions_learner/);
  const backup=readFileSync("migrations/0003_fex_google_sheets_backup.sql","utf8");
  assert.match(backup,/backup_status/);
  assert.match(backup,/backup_synced_at/);
  assert.match(backup,/backup_error/);
});

test("Writing and IELTS pages use the protected D1 endpoint and their scripts parse", () => {
  const directPages = [
    "lexacademicenglish_multipage/students/writing/index.html",
    "lexacademicenglish_multipage/students/ielts/index.html"
  ];
  for (const path of directPages) {
    const page = readFileSync(path, "utf8");
    assert.match(page, /\/students\/api\/submissions/);
    const scripts = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match => match[1]).filter(code => code.trim());
    for (const code of scripts) new vm.Script(code, { filename: path });
  }
  const legacyIelts = readFileSync("lexacademicenglish_multipage/students/ielts/writing/index.html", "utf8");
  const engine = readFileSync("lexacademicenglish_multipage/students/ielts/assets/ielts-engine.js", "utf8");
  assert.match(legacyIelts, /LexIelts\.submitAssessment/);
  assert.match(engine, /\/students\/api\/submissions/);
  new vm.Script(engine, { filename: "ielts-engine.js" });
  const ielts = readFileSync(directPages[1], "utf8");
  assert.match(ielts, /diagnosticAnswers/);
  assert.match(source, /diagnosticAnswers/);
});

test("keeps the D1 record when the Google Sheets backup is unavailable", async () => {
  const db=fakeDb();
  const sheetCalls=[];
  const r=await invoke({db,sheetCalls,settings:{GOOGLE_SHEET_WEBHOOK_URL:"https://script.google.test/exec"},sheetStatus:503,
    payload:{type:"ielts",submissionId:"ielts-12345678",studentName:"Learner",studentEmail:email,category:"IELTS diagnostic",prompt:"Question set",essay:"A complete IELTS response."}});
  assert.equal(r.status,200);
  assert.equal(r.body.recorded,true);
  assert.equal(r.body.backupStatus,"failed");
  assert.equal(sheetCalls[0].submissionId,"ielts-12345678");
  assert.match(sheetCalls[0].details,/A complete IELTS response/);
  assert.equal(db.submissions.get("ielts-12345678").response_text,"A complete IELTS response.");
  assert.equal(db.submissions.get("ielts-12345678").backup_status,"failed");
});

test("replayed submission references back up the original D1 content, not altered request content", async () => {
  const db=fakeDb(); const sheetCalls=[];
  const original={type:"writing",submissionId:"stable-ref-123",studentName:"Learner",studentEmail:email,taskType:"Task 2",promptTitle:"Original prompt",essayText:"Original saved essay",timeSpent:"8m"};
  const first=await invoke({db,sheetCalls,sheetStatus:503,settings:{GOOGLE_SHEET_WEBHOOK_URL:"https://script.google.test/exec"},payload:original});
  assert.equal(first.status,200); assert.equal(first.body.backupStatus,"failed");
  const replay={...original,taskType:"Changed task",promptTitle:"Changed prompt",essayText:"Altered essay must not replace the original"};
  const second=await invoke({db,sheetCalls,settings:{GOOGLE_SHEET_WEBHOOK_URL:"https://script.google.test/exec"},payload:replay});
  assert.equal(second.status,200); assert.equal(second.body.backupStatus,"synced");
  assert.equal(sheetCalls.length,2);
  assert.equal(sheetCalls[1].taskType,"Task 2");
  assert.equal(sheetCalls[1].promptTitle,"Original prompt");
  assert.equal(sheetCalls[1].essayText,"Original saved essay");
});
