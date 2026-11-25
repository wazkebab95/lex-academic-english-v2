const encoder = new TextEncoder();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class SubmissionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  }});
}
function decode64(value) {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - normalised.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}
function decodeSegment(value) {
  return JSON.parse(new TextDecoder().decode(decode64(value)));
}
function issuerOrigin(value) {
  const input = String(value || "").trim();
  if (!input) throw new SubmissionError(503, "Student sign-in is not configured.");
  let url;
  try { url = new URL(/^https:\/\//i.test(input) ? input : "https://" + input); }
  catch { throw new SubmissionError(503, "Student sign-in is not configured."); }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password)
    throw new SubmissionError(503, "Student sign-in is not configured.");
  return url.origin;
}
async function verifyStudent(request, env) {
  const issuer = issuerOrigin(env.CF_ACCESS_TEAM_DOMAIN);
  const audience = String(env.RETAIL_ACCESS_AUD || "").trim();
  if (!audience) throw new SubmissionError(503, "Student sign-in is not configured.");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new SubmissionError(401, "Please sign in through the student portal.");
  const parts = token.split(".");
  if (parts.length !== 3) throw new SubmissionError(401, "Student sign-in could not be verified.");
  let header, claims;
  try { header = decodeSegment(parts[0]); claims = decodeSegment(parts[1]); }
  catch { throw new SubmissionError(401, "Student sign-in could not be verified."); }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid)
    throw new SubmissionError(401, "Student sign-in could not be verified.");
  let response;
  try { response = await fetch(issuer + "/cdn-cgi/access/certs", { headers: { Accept: "application/json" } }); }
  catch { throw new SubmissionError(503, "Student sign-in verification is temporarily unavailable."); }
  if (!response.ok) throw new SubmissionError(503, "Student sign-in verification is temporarily unavailable.");
  let jwks;
  try { jwks = await response.json(); } catch { throw new SubmissionError(503, "Student sign-in verification is temporarily unavailable."); }
  const jwk = Array.isArray(jwks.keys) ? jwks.keys.find(key => key.kid === header.kid && key.kty === "RSA") : null;
  if (!jwk || (jwk.use && jwk.use !== "sig") || (jwk.alg && jwk.alg !== "RS256"))
    throw new SubmissionError(401, "Student sign-in could not be verified.");
  let valid = false;
  try {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    valid = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, decode64(parts[2]), encoder.encode(parts[0] + "." + parts[1]));
  } catch { throw new SubmissionError(401, "Student sign-in could not be verified."); }
  if (!valid) throw new SubmissionError(401, "Student sign-in could not be verified.");
  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== issuer || !audiences.includes(audience) || !Number.isFinite(claims.exp) || claims.exp <= now ||
      (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 60)) ||
      (claims.iat !== undefined && (!Number.isFinite(claims.iat) || claims.iat > now + 60)))
    throw new SubmissionError(401, "Student sign-in could not be verified.");
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) throw new SubmissionError(401, "Student sign-in has no valid learner identity.");
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (accessEmail && accessEmail.trim().toLowerCase() !== email)
    throw new SubmissionError(401, "Student sign-in could not be verified.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(issuer + "|" + email));
  const learnerId = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  return { email, learnerId };
}
function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function backupToGoogleSheets(env, record) {
  if (!env.GOOGLE_SHEET_WEBHOOK_URL) return { ok: false, error: "Google Sheets backup is not configured." };
  let url;
  try { url = new URL(env.GOOGLE_SHEET_WEBHOOK_URL); }
  catch { return { ok: false, error: "Google Sheets backup URL is invalid." }; }
  const timestamp = new Date().toLocaleString("en-GB", {
    timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short"
  });
  const payload = record.type === "writing" ? {
    action: "log_writing", submissionId: record.id, studentName: record.name,
    studentEmail: record.email, taskType: record.title, promptTitle: record.prompt,
    wordCount: record.wordCount, timeSpent: record.timeSpent, essayText: record.response
  } : {
    submissionId: record.id, timestamp, studentName: record.name, studentEmail: record.email,
    category: record.title, score: record.score, bandEstimate: record.resultLabel,
    timeTaken: record.timeSpent,
    diagnosticFocus: (record.diagnosticAnswers || []).map(answer => [answer.topic, "Selected: " + (answer.selectedAnswer || "Not answered"), "Correct: " + answer.correctAnswer, answer.isCorrect ? "Correct" : "Incorrect"].join(" · ")).join("\n"),
    details: "Submission reference: " + record.id + "\nPrompt: " + record.prompt +
      "\nDiagnostic answers: " + JSON.stringify(record.diagnosticAnswers || []) +
      "\nStudent response: " + record.response
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url.toString(), {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) return { ok: false, error: "Google Sheets returned HTTP " + response.status + "." };
    const text = await response.text();
    if (text) {
      try {
        const result = JSON.parse(text);
        if (result.ok === false || result.success === false || result.error)
          return { ok: false, error: String(result.error || "Google Sheets rejected the backup.").slice(0, 300) };
      } catch { /* Existing Apps Script deployments may return a plain-text success response. */ }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error && error.name === "AbortError" ? "Google Sheets backup timed out." : "Google Sheets backup could not be reached." };
  } finally { clearTimeout(timeout); }
}

async function notifyInstructor(env, record) {
  if (!env.RESEND_API_KEY || !env.INSTRUCTOR_EMAIL) return false;
  const heading = record.type === "writing" ? "Writing submission" : "IELTS submission";
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;padding:24px;color:#0F172A">
    <p style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#1E3A8A">Fex Studio · ${heading}</p>
    <h2>${escapeHtml(record.title)}</h2><p><strong>Student:</strong> ${escapeHtml(record.name)} (${escapeHtml(record.email)})</p>
    <p><strong>Reference:</strong> ${escapeHtml(record.id)} · <strong>Words:</strong> ${record.wordCount}</p>
    <p><strong>Prompt:</strong> ${escapeHtml(record.prompt)}</p><hr>
    <div style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7">${escapeHtml(record.response)}</div></div>`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: controller.signal,
      headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Fex Studio <noreply@lexacademicenglish.co.uk>",
        to: [String(env.INSTRUCTOR_EMAIL).trim(), record.email], reply_to: String(env.INSTRUCTOR_EMAIL).trim(),
        subject: "[Fex Studio] " + heading + " — " + record.name,
        html })
    });
    return response.ok;
  } catch { return false; }
  finally { clearTimeout(timeout); }
}
export async function onRequestPost({ request, env }) {
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || ""))
      throw new SubmissionError(415, "Send your submission as JSON.");
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) throw new SubmissionError(403, "This request origin is not allowed.");
    const raw = await request.text();
    if (encoder.encode(raw).byteLength > 40000) throw new SubmissionError(413, "This submission is too large.");
    let body;
    try { body = JSON.parse(raw); } catch { throw new SubmissionError(400, "The submission is not valid JSON."); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new SubmissionError(400, "The submission payload is invalid.");
    const identity = await verifyStudent(request, env);
    if (!env.FEX_DB) throw new SubmissionError(503, "Submission storage is not configured yet. Please contact your tutor.");
    const type = String(body.type || "");
    if (!["writing", "ielts"].includes(type)) throw new SubmissionError(400, "The submission type is not supported.");
    const name = String(body.studentName || body.name || "").trim();
    const suppliedEmail = String(body.studentEmail || body.email || identity.email).trim().toLowerCase();
    if (!name || name.length > 160 || suppliedEmail !== identity.email)
      throw new SubmissionError(400, "Check your name and ensure you are using your signed-in student email.");
    const title = String(type === "writing" ? body.taskType || "Writing" : body.category || body.module || "IELTS assessment").trim();
    const prompt = String(body.promptTitle || body.prompt || body.category || title).trim();
    const responseText = String(type === "writing" ? body.essayText || "" : body.essay || body.detailsPlain || body.response || "").trim();
    if (!responseText) throw new SubmissionError(400, "Your written response is empty.");
    if (title.length > 200 || prompt.length > 2000 || responseText.length > 30000)
      throw new SubmissionError(400, "One or more submission fields exceed the permitted length.");
    const wordCount = responseText.split(/\s+/).filter(Boolean).length;
    const courseId = type === "writing" ? "fex-writing" : "ielts-academic";
    const submissionId = String(body.submissionId || "").trim() || crypto.randomUUID();
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(submissionId)) throw new SubmissionError(400, "The submission reference is invalid.");
    const score = String(body.score || "").slice(0, 80);
    const resultLabel = String(body.bandEstimate || body.resultLabel || "").slice(0, 120);
    const timeSpent = String(body.timeSpent || body.timeTaken || "Untimed").slice(0, 80);
    await env.FEX_DB.prepare("INSERT INTO learners (learner_id,email) VALUES (?,?) ON CONFLICT(learner_id) DO UPDATE SET last_seen_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')")
      .bind(identity.learnerId, identity.email).run();
    await env.FEX_DB.prepare("INSERT INTO course_enrolments (learner_id,course_id,status) VALUES (?,?,'active') ON CONFLICT(learner_id,course_id) DO NOTHING")
      .bind(identity.learnerId, courseId).run();
    const insert = await env.FEX_DB.prepare("INSERT OR IGNORE INTO student_submissions (submission_id,learner_id,course_id,submission_type,title,prompt,response_text,score,result_label,word_count,time_spent,metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(submissionId, identity.learnerId, courseId, type, title, prompt, responseText, score, resultLabel, wordCount, timeSpent,
        JSON.stringify({ targetBand: body.targetBand || null, category: body.category || null, submittedName: name, diagnosticAnswers: Array.isArray(body.diagnosticAnswers) ? body.diagnosticAnswers.slice(0, 30) : [] })).run();
    const stored = await env.FEX_DB.prepare("SELECT learner_id,submission_type,backup_status,title,prompt,response_text,score,result_label,word_count,time_spent,metadata_json FROM student_submissions WHERE submission_id=?").bind(submissionId).first();
    if (!stored || stored.learner_id !== identity.learnerId || stored.submission_type !== type)
      throw new SubmissionError(409, "This submission reference is already in use.");
    let storedMetadata = {};
    try { storedMetadata = JSON.parse(stored.metadata_json || "{}"); } catch { storedMetadata = {}; }
    // D1 is authoritative: retries/replayed requests must back up the original saved payload,
    // never replacement content supplied with a reused submission reference.
    const record = {
      id: submissionId, type, name: String(storedMetadata.submittedName || name),
      email: identity.email, title: stored.title, prompt: stored.prompt,
      response: stored.response_text, wordCount: Number(stored.word_count || 0),
      score: stored.score || "", resultLabel: stored.result_label || "",
      timeSpent: stored.time_spent || "Untimed",
      diagnosticAnswers: Array.isArray(storedMetadata.diagnosticAnswers) ? storedMetadata.diagnosticAnswers : []
    };
    const notified = insert.meta && Number(insert.meta.changes) > 0 ? await notifyInstructor(env, record) : null;
    let backupStatus = stored.backup_status || "pending";
    if (backupStatus !== "synced") {
      const backup = await backupToGoogleSheets(env, record);
      backupStatus = backup.ok ? "synced" : "failed";
      await env.FEX_DB.prepare("UPDATE student_submissions SET backup_status=?,backup_synced_at=?,backup_error=? WHERE submission_id=? AND learner_id=?")
        .bind(backupStatus, backup.ok ? new Date().toISOString() : null, backup.ok ? null : backup.error, submissionId, identity.learnerId).run();
    }
    return json(200, { ok: true, submissionId, wordCount, recorded: true, instructorNotified: notified, backupStatus });
  } catch (error) {
    if (error instanceof SubmissionError) return json(error.status, { ok: false, error: error.message });
    return json(500, { ok: false, error: "Your submission could not be recorded. Please try again." });
  }
}
