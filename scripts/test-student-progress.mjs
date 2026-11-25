import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";

globalThis.crypto ||= webcrypto;
const source=readFileSync("functions/students/api/progress.js","utf8");
const {onRequestGet,onRequestPost,validateChoices}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const teamOrigin="https://teamsiuuu.cloudflareaccess.com";
const audience="retail-progress-test-audience";
const email="learner@example.test";
const encoder=new TextEncoder();
const pair=await webcrypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
const jwk=await webcrypto.subtle.exportKey("jwk",pair.publicKey);
Object.assign(jwk,{kid:"progress-test-key",alg:"RS256",use:"sig"});
function b64(value){const bytes=typeof value==="string"?encoder.encode(value):new Uint8Array(value);let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");}
async function token(overrides={}){const now=Math.floor(Date.now()/1000);const h=b64(JSON.stringify({alg:"RS256",kid:"progress-test-key"}));const p=b64(JSON.stringify({iss:teamOrigin,aud:[audience],email,exp:now+3600,nbf:now-5,iat:now,...overrides}));const unsigned=h+"."+p;const sig=await webcrypto.subtle.sign({name:"RSASSA-PKCS1-v1_5"},pair.privateKey,encoder.encode(unsigned));return unsigned+"."+b64(sig);}
const env={CF_ACCESS_TEAM_DOMAIN:teamOrigin,RETAIL_ACCESS_AUD:audience,RETAIL_ALLOWED_EMAILS:email};
function fakeDb(){
 const calls=[];
 return {calls,prepare(sql){return {sql,values:[],bind(...values){this.values=values;return this;},async run(){calls.push({sql,values:this.values});return {success:true};},async first(){calls.push({sql,values:this.values});if(sql.includes("SELECT status FROM course_enrolments"))return {status:"active"};return null;},async all(){calls.push({sql,values:this.values});return {results:[]};}};}};
}
async function invoke({jwt,method="GET",payload,db,settings={},origin="https://lexacademicenglish.co.uk"}={}){
 const original=globalThis.fetch;globalThis.fetch=async url=>{if(String(url)===teamOrigin+"/cdn-cgi/access/certs")return new Response(JSON.stringify({keys:[jwk]}),{status:200});throw new Error("Unexpected fetch");};
 try{const headers={};if(jwt)headers["Cf-Access-Jwt-Assertion"]=jwt;if(payload!==undefined)headers["Content-Type"]="application/json";if(origin)headers.Origin=origin;const request=new Request("https://lexacademicenglish.co.uk/students/api/progress",{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});const response=method==="POST"?await onRequestPost({request,env:{...env,...settings,FEX_DB:db}}):await onRequestGet({request,env:{...env,...settings,FEX_DB:db}});return {status:response.status,body:await response.json()};}finally{globalThis.fetch=original;}
}
test("requires a signed-in student identity",async()=>{const r=await invoke();assert.equal(r.status,401);});
test("rejects students outside the configured allowlist",async()=>{const r=await invoke({jwt:await token({email:"other@example.test"}),db:fakeDb()});assert.equal(r.status,403);});
test("fails closed when the learner database binding is missing",async()=>{const r=await invoke({jwt:await token()});assert.equal(r.status,503);});
test("rejects cross-origin progress writes",async()=>{const r=await invoke({jwt:await token(),method:"POST",payload:{action:"module_progress",moduleId:"vocabulary",choices:[0,1,1,0,0,0]},db:fakeDb(),origin:"https://attacker.example"});assert.equal(r.status,403);});
test("rejects vocabulary ratings outside the supported review scale",async()=>{const r=await invoke({jwt:await token(),method:"POST",payload:{action:"vocabulary_review",itemId:"sku",rating:"mastered"},db:fakeDb()});assert.equal(r.status,400);});
test("student page and learning path use the private progress endpoint",()=>{const page=readFileSync("lexacademicenglish_multipage/students/progress/index.html","utf8");const path=readFileSync("lexacademicenglish_multipage/students/retail/learning-path/index.html","utf8");assert.match(page,/request\("\/students\/api\/progress"/);assert.match(page,/noindex,nofollow/);assert.doesNotMatch(page,/\binnerHTML\b/);assert.match(path,/loadPersonalProgress\(\)/);assert.match(path,/saveModuleProgress\(module\)/);assert.match(path,/\/students\/progress\//);});
test("database migration contains learner-scoped progress and vocabulary review tables",()=>{const sql=readFileSync("migrations/0001_fex_learner_progress.sql","utf8");for(const table of ["learners","course_enrolments","module_progress","vocabulary_items","vocabulary_reviews","assessment_attempts","teacher_feedback"])assert.match(sql,new RegExp("CREATE TABLE IF NOT EXISTS "+table));assert.match(sql,/PRIMARY KEY \(learner_id, course_id, module_id\)/);});

test("student progress page inline JavaScript parses",()=>{
 const page=readFileSync("lexacademicenglish_multipage/students/progress/index.html","utf8");
 const scripts=[...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).filter(code=>code.trim());
 assert.ok(scripts.length>0);
 for(const code of scripts)new vm.Script(code,{filename:"student-progress-inline.js"});
});

test("server calculates module scores from its own answer key",()=>{
 const result=validateChoices("vocabulary",[0,1,1,0,0,0]);
 assert.deepEqual(result,{status:"completed",correct:6,total:6});
 const partial=validateChoices("vocabulary",[0,1,null,null,null,null]);
 assert.deepEqual(partial,{status:"in_progress",correct:2,total:6});
 assert.throws(()=>validateChoices("vocabulary",[0,99,1,0,0,0]),/selected answers are invalid/);
});
