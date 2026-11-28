import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";

globalThis.crypto ||= webcrypto;
const source = await readFile(new URL("../functions/api/retry-google-sheets-backups.js", import.meta.url), "utf8");
const api = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
const webhook = "https://apps-script.example.test/exec";
const secret = "synthetic-retry-secret";

function fixtureRows(count=1) {
  return Array.from({length:count},(_,i)=>({
    submission_id:"synthetic-"+(i+1),learner_id:"learner-"+(i+1),email:"learner"+(i+1)+"@example.test",
    submission_type:"writing",title:"Synthetic task",prompt:"Synthetic prompt",response_text:"Synthetic response only",
    word_count:3,time_spent:"1 minute",metadata_json:'{"submittedName":"Synthetic Learner"}',
    backup_status:"pending",backup_attempt_count:0,backup_next_attempt_at:null,backup_claim_token:null,backup_claim_until:null,
    submitted_at:new Date(Date.now()+i).toISOString(),backup_synced_at:null,backup_error:null
  }));
}
function fakeDb(rows) {
  return {
    rows,
    prepare(sql) {
      return {sql,values:[],bind(...values){this.values=values;return this;},
        async run(){
          if(this.sql.startsWith("UPDATE student_submissions SET backup_claim_token=")){
            const [claim,until,now,claimBefore]=this.values;
            const eligible=rows.filter(r=>["failed","pending"].includes(r.backup_status)&&(!r.backup_next_attempt_at||r.backup_next_attempt_at<=now)&&(!r.backup_claim_until||r.backup_claim_until<claimBefore)).sort((a,b)=>a.submitted_at.localeCompare(b.submitted_at)).slice(0,10);
            for(const r of eligible){r.backup_claim_token=claim;r.backup_claim_until=until;}
            return {success:true};
          }
          if(this.sql.startsWith("UPDATE student_submissions SET backup_status=")){
            const [status,syncedAt,error,attempts,next,submissionId,claim]=this.values;
            const row=rows.find(r=>r.submission_id===submissionId&&r.backup_claim_token===claim);
            if(row){Object.assign(row,{backup_status:status,backup_synced_at:syncedAt,backup_error:error,backup_attempt_count:attempts,backup_next_attempt_at:next,backup_claim_token:null,backup_claim_until:null});}
            return {success:true};
          }
          throw new Error("Unexpected fake DB run SQL");
        },
        async all(){
          assert.match(this.sql,/WHERE s\.backup_claim_token=\?/);
          return {results:rows.filter(r=>r.backup_claim_token===this.values[0]).map(r=>({...r}))};
        }
      };
    }
  };
}
async function invoke({rows=fixtureRows(),secretValue=secret,db=true,webhookValue=webhook,auth="Bearer "+secret,fetchResponse=()=>new Response(JSON.stringify({ok:true}),{status:200}),fetchError=null}={}){
  const database=db?fakeDb(rows):null;
  const env={FEX_BACKUP_RETRY_SECRET:secretValue,FEX_DB:database,GOOGLE_SHEET_WEBHOOK_URL:webhookValue};
  const originalFetch=globalThis.fetch;
  let sent=[];
  globalThis.fetch=async(url,init)=>{
    assert.equal(String(url),webhook);
    sent.push(JSON.parse(init.body));
    if(fetchError)throw fetchError;
    return fetchResponse(sent.at(-1));
  };
  try{
    const request=new Request("https://lexacademicenglish.co.uk/api/retry-google-sheets-backups",{method:"POST",headers:{Authorization:auth,"Content-Type":"application/json"},body:"{}"});
    const response=await api.onRequestPost({request,env});
    return {response,data:await response.json(),rows,database,sent};
  }finally{globalThis.fetch=originalFetch;}
}

test("rejects missing or incorrect bearer secret without contacting the backup",async()=>{
  const r=await invoke({auth:"Bearer wrong"});
  assert.equal(r.response.status,401);
  assert.equal(r.sent.length,0);
  const noSecret=await invoke({secretValue:"",auth:""});
  assert.equal(noSecret.response.status,401);
  assert.equal(noSecret.sent.length,0);
});
test("fails closed when D1 or the webhook is unavailable",async()=>{
  const missingDb=await invoke({db:false});
  assert.equal(missingDb.response.status,503);
  const missingUrl=await invoke({webhookValue:""});
  assert.equal(missingUrl.response.status,503);
  assert.equal(missingUrl.sent.length,0);
});
test("marks a confirmed synthetic backup as synced and clears the claim",async()=>{
  const r=await invoke();
  assert.equal(r.response.status,200);
  assert.deepEqual(r.data,{ok:true,claimed:1,synced:1,failed:0});
  assert.equal(r.rows[0].backup_status,"synced");
  assert.equal(r.rows[0].backup_attempt_count,1);
  assert.ok(r.rows[0].backup_synced_at);
  assert.equal(r.rows[0].backup_error,null);
  assert.equal(r.rows[0].backup_next_attempt_at,null);
  assert.equal(r.rows[0].backup_claim_token,null);
  assert.equal(r.rows[0].backup_claim_until,null);
  assert.equal(r.sent[0].action,"log_writing");
  assert.equal(r.sent[0].submissionId,"synthetic-1");
});
test("HTTP failures retain a failed state with retry timing and clear the lease",async()=>{
  const r=await invoke({fetchResponse:()=>new Response("Unavailable",{status:503})});
  assert.equal(r.response.status,200);
  assert.deepEqual(r.data,{ok:true,claimed:1,synced:0,failed:1});
  assert.equal(r.rows[0].backup_status,"failed");
  assert.equal(r.rows[0].backup_attempt_count,1);
  assert.ok(r.rows[0].backup_next_attempt_at);
  assert.match(r.rows[0].backup_error,/HTTP 503/);
  assert.equal(r.rows[0].backup_claim_token,null);
  assert.equal(r.rows[0].backup_claim_until,null);
});
test("malformed or unconfirmed 200 responses are not marked synced",async()=>{
  for(const body of ["not JSON",JSON.stringify({ok:false,error:"Synthetic rejection"})]){
    const r=await invoke({fetchResponse:()=>new Response(body,{status:200})});
    assert.equal(r.response.status,200);
    assert.equal(r.data.failed,1);
    assert.equal(r.data.synced,0);
    assert.equal(r.rows[0].backup_status,"failed");
    assert.ok(r.rows[0].backup_next_attempt_at);
    assert.equal(r.rows[0].backup_claim_token,null);
  }
});
test("batch is limited to ten rows and unclaimed records remain pending",async()=>{
  const r=await invoke({rows:fixtureRows(11)});
  assert.equal(r.response.status,200);
  assert.equal(r.data.claimed,10);
  assert.equal(r.data.synced,10);
  assert.equal(r.rows[10].backup_status,"pending");
  assert.equal(r.rows[10].backup_claim_token,null);
});
