const HEADERS={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
function json(status,body){return new Response(JSON.stringify(body),{status,headers:HEADERS});}
function backoff(attempt){return Math.min(6*60*60,10*60*Math.pow(2,Math.max(0,attempt-1)));}
function buildPayload(row){
 let meta={};try{meta=JSON.parse(row.metadata_json||"{}");}catch{}
 const timestamp=new Date().toLocaleString("en-GB",{timeZone:"Europe/Istanbul",dateStyle:"medium",timeStyle:"short"});
 if(row.submission_type==="writing")return {action:"log_writing",submissionId:row.submission_id,studentName:meta.submittedName||row.email,studentEmail:row.email,taskType:row.title,promptTitle:row.prompt,wordCount:row.word_count,timeSpent:row.time_spent||"Untimed",essayText:row.response_text};
 return {submissionId:row.submission_id,timestamp,studentName:meta.submittedName||row.email,studentEmail:row.email,category:meta.category||row.title,score:row.score||"",bandEstimate:row.result_label||"",timeTaken:row.time_spent||"Untimed",details:"Submission reference: "+row.submission_id+"\\nPrompt: "+row.prompt+"\\nDiagnostic answers: "+JSON.stringify(meta.diagnosticAnswers||[])+"\\nStudent response: "+row.response_text};
}
async function send(url,payload){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(payload),signal:controller.signal});
 if(!res.ok)return {ok:false,error:"Sheets HTTP "+res.status};
 const t=await res.text();if(t){try{const j=JSON.parse(t);if(j.ok===false||j.success===false||j.error)return {ok:false,error:String(j.error||"Sheets rejected payload").slice(0,300)};}catch{}}
 return {ok:true};
 }catch(e){return {ok:false,error:e.name==="AbortError"?"Sheets timeout":"Sheets unreachable"};}finally{clearTimeout(timer);}
}
export async function onRequestPost({request,env}){
 if(!env.FEX_BACKUP_RETRY_SECRET||request.headers.get("Authorization")!=="Bearer "+env.FEX_BACKUP_RETRY_SECRET)return json(401,{ok:false});
 if(!env.FEX_DB||!env.GOOGLE_SHEET_WEBHOOK_URL)return json(503,{ok:false,error:"Retry service is not configured."});
 const now=new Date().toISOString(),claim=crypto.randomUUID();
 try{
 await env.FEX_DB.prepare("UPDATE student_submissions SET backup_claim_token=?,backup_claim_until=? WHERE submission_id IN (SELECT submission_id FROM student_submissions WHERE backup_status IN ('failed','pending') AND (backup_next_attempt_at IS NULL OR backup_next_attempt_at<=?) AND (backup_claim_until IS NULL OR backup_claim_until<?) ORDER BY submitted_at ASC LIMIT 10)").bind(claim,new Date(Date.now()+5*60*1000).toISOString(),now,now).run();
 const rows=await env.FEX_DB.prepare("SELECT s.*,l.email FROM student_submissions s JOIN learners l ON l.learner_id=s.learner_id WHERE s.backup_claim_token=? ORDER BY s.submitted_at ASC").bind(claim).all();
 let synced=0,failed=0;
 for(const row of rows.results||[]){
  const result=await send(env.GOOGLE_SHEET_WEBHOOK_URL,buildPayload(row));
  const attempts=Number(row.backup_attempt_count||0)+1;
  const next=result.ok?null:new Date(Date.now()+backoff(attempts)*1000).toISOString();
  await env.FEX_DB.prepare("UPDATE student_submissions SET backup_status=?,backup_synced_at=?,backup_error=?,backup_attempt_count=?,backup_next_attempt_at=?,backup_claim_token=NULL,backup_claim_until=NULL WHERE submission_id=? AND backup_claim_token=?").bind(result.ok?"synced":"failed",result.ok?new Date().toISOString():null,result.ok?null:result.error,attempts,next,row.submission_id,claim).run();
  if(result.ok)synced++;else failed++;
 }
 return json(200,{ok:true,claimed:(rows.results||[]).length,synced,failed});
 }catch(e){return json(500,{ok:false,error:"Retry processing failed."});}
}
