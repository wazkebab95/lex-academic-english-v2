const encoder = new TextEncoder();
const COURSE_ID = "retail-business-english";
const MODULE_KEYS = {
  vocabulary: [0,1,1,0,0,0],
  grammar: [1,1,0,2,1,0],
  communication: [1,1,1,2,1],
  assessment: [1,0,1,1,1,0,0,1,1,0]
};
const MODULE_IDS = new Set([...Object.keys(MODULE_KEYS), "case-study"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error { constructor(status,message){super(message);this.status=status;} }
function json(status,payload){return new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
function decodeBase64Url(value){const normalised=value.replace(/-/g,"+").replace(/_/g,"/");const padded=normalised+"=".repeat((4-normalised.length%4)%4);const binary=atob(padded);return Uint8Array.from(binary,c=>c.charCodeAt(0));}
function decodeJsonSegment(value){return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));}
function teamOrigin(value){const input=String(value||"").trim();if(!input)throw new HttpError(503,"Student sign-in is not configured.");let url;try{url=new URL(/^https:\/\//i.test(input)?input:"https://"+input);}catch{throw new HttpError(503,"Student sign-in is not configured.");}if(url.protocol!=="https:"||url.pathname!=="/"||url.search||url.hash||url.username||url.password)throw new HttpError(503,"Student sign-in is not configured.");return url.origin;}
async function verifyStudent(request,env){
  const issuer=teamOrigin(env.CF_ACCESS_TEAM_DOMAIN);
  const audience=String(env.RETAIL_ACCESS_AUD||"").trim();
  const allowlist=String(env.RETAIL_ALLOWED_EMAILS||"").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!audience||!allowlist.length)throw new HttpError(503,"Student sign-in is not configured.");
  const token=request.headers.get("Cf-Access-Jwt-Assertion");
  if(!token)throw new HttpError(401,"Please sign in through the student portal.");
  const parts=token.split(".");if(parts.length!==3)throw new HttpError(401,"Student sign-in could not be verified.");
  let header,claims;try{header=decodeJsonSegment(parts[0]);claims=decodeJsonSegment(parts[1]);}catch{throw new HttpError(401,"Student sign-in could not be verified.");}
  if(header.alg!=="RS256"||typeof header.kid!=="string"||!header.kid)throw new HttpError(401,"Student sign-in could not be verified.");
  let keysResponse;try{keysResponse=await fetch(issuer+"/cdn-cgi/access/certs",{headers:{Accept:"application/json"}});}catch{throw new HttpError(503,"Student sign-in verification is temporarily unavailable.");}
  if(!keysResponse.ok)throw new HttpError(503,"Student sign-in verification is temporarily unavailable.");
  let keys;try{keys=await keysResponse.json();}catch{throw new HttpError(503,"Student sign-in verification is temporarily unavailable.");}
  const jwk=Array.isArray(keys.keys)?keys.keys.find(k=>k.kid===header.kid&&k.kty==="RSA"):null;
  if(!jwk||(jwk.use&&jwk.use!=="sig")||(jwk.alg&&jwk.alg!=="RS256"))throw new HttpError(401,"Student sign-in could not be verified.");
  let valid=false;try{const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);valid=await crypto.subtle.verify({name:"RSASSA-PKCS1-v1_5"},key,decodeBase64Url(parts[2]),encoder.encode(parts[0]+"."+parts[1]));}catch{throw new HttpError(401,"Student sign-in could not be verified.");}
  if(!valid)throw new HttpError(401,"Student sign-in could not be verified.");
  const now=Math.floor(Date.now()/1000),audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.iss!==issuer||!audiences.includes(audience)||!Number.isFinite(claims.exp)||claims.exp<=now||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>now+60))||(claims.iat!==undefined&&(!Number.isFinite(claims.iat)||claims.iat>now+60)))throw new HttpError(401,"Student sign-in could not be verified.");
  const email=typeof claims.email==="string"?claims.email.trim().toLowerCase():"";
  if(!EMAIL_PATTERN.test(email))throw new HttpError(401,"Student sign-in has no valid learner identity.");
  if(!allowlist.includes(email))throw new HttpError(403,"This account is not authorised for this learning path.");
  const accessEmail=request.headers.get("Cf-Access-Authenticated-User-Email");
  if(accessEmail&&accessEmail.trim().toLowerCase()!==email)throw new HttpError(401,"Student sign-in could not be verified.");
  const digest=await crypto.subtle.digest("SHA-256",encoder.encode(issuer+"|"+email));
  const learnerId=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
  return {email,learnerId};
}
function requireDb(env){if(!env.FEX_DB)throw new HttpError(503,"Your learning record is not configured yet. Please contact your tutor.");return env.FEX_DB;}
async function ensureLearner(db,identity){
  await db.prepare("INSERT INTO learners (learner_id,email) VALUES (?,?) ON CONFLICT(learner_id) DO UPDATE SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(identity.learnerId,identity.email).run();
  await db.prepare("INSERT INTO course_enrolments (learner_id,course_id,status) VALUES (?,?,'active') ON CONFLICT(learner_id,course_id) DO NOTHING").bind(identity.learnerId,COURSE_ID).run();
  const enrolment=await db.prepare("SELECT status FROM course_enrolments WHERE learner_id=? AND course_id=?").bind(identity.learnerId,COURSE_ID).first();
  if(!enrolment||enrolment.status!=="active")throw new HttpError(403,"This learning path is not currently available to your account.");
}
async function getProgress(db,identity){
  await ensureLearner(db,identity);
  const [modules,vocabulary,reviews,attempts,feedback]=await Promise.all([
    db.prepare("SELECT module_id,status,choices_json,correct_answers,total_questions,attempts,completed_at,updated_at FROM module_progress WHERE learner_id=? AND course_id=? ORDER BY module_id").bind(identity.learnerId,COURSE_ID).all(),
    db.prepare("SELECT item_id,term,definition,example FROM vocabulary_items WHERE course_id=? ORDER BY term").bind(COURSE_ID).all(),
    db.prepare("SELECT item_id,repetitions,interval_days,due_at,last_reviewed_at,last_rating FROM vocabulary_reviews WHERE learner_id=? AND course_id=?").bind(identity.learnerId,COURSE_ID).all(),
    db.prepare("SELECT attempt_id,assessment_id,score,total,submitted_at FROM assessment_attempts WHERE learner_id=? AND course_id=? ORDER BY submitted_at DESC LIMIT 20").bind(identity.learnerId,COURSE_ID).all(),
    db.prepare("SELECT module_id,feedback,created_at FROM teacher_feedback WHERE learner_id=? AND course_id=? ORDER BY created_at DESC LIMIT 30").bind(identity.learnerId,COURSE_ID).all()
  ]);
  return {ok:true,courseId:COURSE_ID,modules:modules.results||[],vocabulary:vocabulary.results||[],reviews:reviews.results||[],assessmentAttempts:attempts.results||[],teacherFeedback:feedback.results||[]};
}
export function validateChoices(moduleId,choices){
  const keys=MODULE_KEYS[moduleId];if(!keys||!Array.isArray(choices)||choices.length!==keys.length)throw new HttpError(400,"The module response is invalid.");
  if(choices.some(choice=>choice!==null&&(!Number.isInteger(choice)||choice<0||choice>3)))throw new HttpError(400,"One or more selected answers are invalid.");
  const answered=choices.filter(choice=>choice!==null);
  return {status:answered.length===0?"not_started":answered.length===keys.length?"completed":"in_progress",correct:choices.reduce((sum,choice,index)=>sum+(choice!==null&&choice===keys[index]?1:0),0),total:keys.length};
}
async function saveModule(db,identity,payload){
  const moduleId=String(payload.moduleId||"");if(!MODULE_IDS.has(moduleId))throw new HttpError(400,"The module identifier is invalid.");
  if(moduleId==="case-study"){
    if(payload.reviewed!==true)throw new HttpError(400,"Complete the self-review checklist before saving this module.");
    await db.prepare("INSERT INTO module_progress (learner_id,course_id,module_id,status,choices_json,correct_answers,total_questions,attempts,completed_at,updated_at) VALUES (?,?,?,'completed','[]',0,0,1,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(learner_id,course_id,module_id) DO UPDATE SET status='completed',attempts=module_progress.attempts+1,completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(identity.learnerId,COURSE_ID,moduleId).run();
    return;
  }
  const result=validateChoices(moduleId,payload.choices);
  const previous=await db.prepare("SELECT status FROM module_progress WHERE learner_id=? AND course_id=? AND module_id=?").bind(identity.learnerId,COURSE_ID,moduleId).first();
  await db.prepare("INSERT INTO module_progress (learner_id,course_id,module_id,status,choices_json,correct_answers,total_questions,attempts,completed_at,updated_at) VALUES (?,?,?,?,?,?,?,1,CASE WHEN ?='completed' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(learner_id,course_id,module_id) DO UPDATE SET status=excluded.status,choices_json=excluded.choices_json,correct_answers=excluded.correct_answers,total_questions=excluded.total_questions,attempts=module_progress.attempts+CASE WHEN module_progress.status='completed' AND excluded.status='in_progress' THEN 1 ELSE 0 END,completed_at=CASE WHEN excluded.status='completed' THEN excluded.completed_at ELSE NULL END,updated_at=excluded.updated_at").bind(identity.learnerId,COURSE_ID,moduleId,result.status,JSON.stringify(payload.choices),result.correct,result.total,result.status).run();
  if(moduleId==="assessment"&&result.status==="completed"&&previous?.status!=="completed"){
    await db.prepare("INSERT INTO assessment_attempts (attempt_id,learner_id,course_id,assessment_id,score,total) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),identity.learnerId,COURSE_ID,"comprehensive-assessment",result.correct,result.total).run();
  }
}
async function saveVocabularyReview(db,identity,payload){
  const itemId=String(payload.itemId||"");const rating=String(payload.rating||"");
  if(!/^[a-z0-9-]{1,80}$/.test(itemId)||!["again","hard","good","easy"].includes(rating))throw new HttpError(400,"The vocabulary review is invalid.");
  const item=await db.prepare("SELECT item_id FROM vocabulary_items WHERE course_id=? AND item_id=?").bind(COURSE_ID,itemId).first();
  if(!item)throw new HttpError(404,"This vocabulary item was not found.");
  const old=await db.prepare("SELECT repetitions,interval_days,ease_factor FROM vocabulary_reviews WHERE learner_id=? AND course_id=? AND item_id=?").bind(identity.learnerId,COURSE_ID,itemId).first();
  let repetitions=old?.repetitions||0,interval=old?.interval_days||0,ease=old?.ease_factor||2.5;
  if(rating==="again"){repetitions=0;interval=1;ease=Math.max(1.3,ease-0.2);}
  else if(rating==="hard"){repetitions+=1;interval=Math.max(1,Math.round((interval||1)*1.2));ease=Math.max(1.3,ease-0.15);}
  else if(rating==="good"){repetitions+=1;interval=repetitions===1?1:repetitions===2?3:Math.max(1,Math.round((interval||3)*ease));}
  else{repetitions+=1;interval=repetitions===1?4:Math.max(4,Math.round((interval||4)*ease*1.3));ease=Math.min(3.0,ease+0.15);}
  await db.prepare("INSERT INTO vocabulary_reviews (learner_id,course_id,item_id,repetitions,interval_days,ease_factor,due_at,last_reviewed_at,last_rating) VALUES (?,?,?,?,?,?,datetime('now',?),strftime('%Y-%m-%dT%H:%M:%fZ','now'),?) ON CONFLICT(learner_id,course_id,item_id) DO UPDATE SET repetitions=excluded.repetitions,interval_days=excluded.interval_days,ease_factor=excluded.ease_factor,due_at=excluded.due_at,last_reviewed_at=excluded.last_reviewed_at,last_rating=excluded.last_rating").bind(identity.learnerId,COURSE_ID,itemId,repetitions,interval,ease,"+"+interval+" days",rating).run();
}
export async function onRequestGet({request,env}){
  try{const identity=await verifyStudent(request,env);const db=requireDb(env);return json(200,await getProgress(db,identity));}
  catch(error){if(error instanceof HttpError)return json(error.status,{ok:false,error:error.message});return json(500,{ok:false,error:"Your learning record could not be loaded."});}
}
export async function onRequestPost({request,env}){
  try{
    if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type")||""))throw new HttpError(415,"Send your progress update as JSON.");
    if(request.headers.get("Origin")&&request.headers.get("Origin")!==new URL(request.url).origin)throw new HttpError(403,"This request origin is not allowed.");
    const raw=await request.text();if(encoder.encode(raw).byteLength>12000)throw new HttpError(413,"This progress update is too large.");
    let payload;try{payload=JSON.parse(raw);}catch{throw new HttpError(400,"The progress update is not valid JSON.");}
    if(!payload||typeof payload!=="object"||Array.isArray(payload))throw new HttpError(400,"The progress update is invalid.");
    const identity=await verifyStudent(request,env);const db=requireDb(env);await ensureLearner(db,identity);
    if(payload.action==="module_progress")await saveModule(db,identity,payload);
    else if(payload.action==="vocabulary_review")await saveVocabularyReview(db,identity,payload);
    else throw new HttpError(400,"The progress action is not supported.");
    return json(200,await getProgress(db,identity));
  }catch(error){if(error instanceof HttpError)return json(error.status,{ok:false,error:error.message});return json(500,{ok:false,error:"Your progress could not be saved."});}
}
