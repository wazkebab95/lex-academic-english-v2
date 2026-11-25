const encoder = new TextEncoder();

class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function decodeBase64Url(value) {
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised + "=".repeat((4 - normalised.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function decodeJsonSegment(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

function normaliseTeamOrigin(value) {
  const input = String(value || "").trim();
  if (!input) throw new AuthError(503, "Teacher authentication is not configured.");
  let url;
  try {
    url = new URL(/^https:\/\//i.test(input) ? input : "https://" + input);
  } catch {
    throw new AuthError(503, "Teacher authentication is not configured.");
  }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new AuthError(503, "Teacher authentication is not configured.");
  }
  return url.origin;
}

async function verifyTeacherIdentity(request, env) {
  const teamOrigin = normaliseTeamOrigin(env.CF_ACCESS_TEAM_DOMAIN);
  const audience = String(env.TEACHER_ACCESS_AUD || "").trim();
  const allowedEmails = String(env.TEACHER_ALLOWED_EMAILS || "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  if (!audience || allowedEmails.length === 0) {
    throw new AuthError(503, "Teacher authentication is not configured.");
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new AuthError(401, "An authorised teacher sign-in is required.");

  const parts = token.split(".");
  if (parts.length !== 3) throw new AuthError(401, "The teacher sign-in could not be verified.");

  let header;
  let claims;
  try {
    header = decodeJsonSegment(parts[0]);
    claims = decodeJsonSegment(parts[1]);
  } catch {
    throw new AuthError(401, "The teacher sign-in could not be verified.");
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new AuthError(401, "The teacher sign-in could not be verified.");
  }

  let jwksResponse;
  try {
    jwksResponse = await fetch(teamOrigin + "/cdn-cgi/access/certs", {
      headers: { Accept: "application/json" }
    });
  } catch {
    throw new AuthError(503, "Teacher sign-in verification is temporarily unavailable.");
  }
  if (!jwksResponse.ok) {
    throw new AuthError(503, "Teacher sign-in verification is temporarily unavailable.");
  }

  let jwks;
  try {
    jwks = await jwksResponse.json();
  } catch {
    throw new AuthError(503, "Teacher sign-in verification is temporarily unavailable.");
  }

  const jwk = Array.isArray(jwks.keys)
    ? jwks.keys.find(key => key.kid === header.kid && key.kty === "RSA")
    : null;
  if (!jwk || (jwk.use && jwk.use !== "sig") || (jwk.alg && jwk.alg !== "RS256")) {
    throw new AuthError(401, "The teacher sign-in could not be verified.");
  }

  let validSignature = false;
  try {
    const publicKey = await globalThis.crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    validSignature = await globalThis.crypto.subtle.verify(
      { name: "RSASSA-PKCS1-v1_5" },
      publicKey,
      decodeBase64Url(parts[2]),
      encoder.encode(parts[0] + "." + parts[1])
    );
  } catch {
    throw new AuthError(401, "The teacher sign-in could not be verified.");
  }
  if (!validSignature) throw new AuthError(401, "The teacher sign-in could not be verified.");

  const now = Math.floor(Date.now() / 1000);
  const tokenAudiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    claims.iss !== teamOrigin ||
    !tokenAudiences.includes(audience) ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 60)) ||
    (claims.iat !== undefined && (!Number.isFinite(claims.iat) || claims.iat > now + 60))
  ) {
    throw new AuthError(401, "The teacher sign-in could not be verified.");
  }

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!email || !allowedEmails.includes(email)) {
    throw new AuthError(403, "This account is not authorised to view teacher records.");
  }

  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
  if (accessEmail && accessEmail.trim().toLowerCase() !== email) {
    throw new AuthError(401, "The teacher sign-in could not be verified.");
  }

  return { email };
}

async function fetchTeacherSheetData(webhookUrl) {
  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(webhookUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });

      if (!response.ok) {
        if (response.status !== 429 && response.status < 500) {
          throw new AuthError(502, "Teacher data is temporarily unavailable.");
        }
        lastError = new Error("Temporary Google Sheets response: " + response.status);
      } else {
        let data;
        try {
          data = await response.json();
        } catch {
          lastError = new Error("Google Sheets returned unreadable data.");
        }
        if (data !== undefined) {
          if (
            !data || typeof data !== "object" || Array.isArray(data) ||
            !Array.isArray(data.ieltsResults) ||
            !Array.isArray(data.writingSubmissions)
          ) {
            lastError = new Error("Google Sheets returned an invalid dashboard payload.");
          } else {
            return data;
          }
        }
      }
    } catch (error) {
      if (error instanceof AuthError) throw error;
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 200 * (2 ** (attempt - 1))));
    }
  }

  throw new AuthError(502, "Teacher data is temporarily unavailable.");
}

export async function onRequestGet({ request, env }) {
  try {
    const identity = await verifyTeacherIdentity(request, env);

    if (!env.GOOGLE_SHEET_WEBHOOK_URL) {
      throw new AuthError(503, "Teacher data service is not configured.");
    }

    let webhookUrl;
    try {
      webhookUrl = new URL(env.GOOGLE_SHEET_WEBHOOK_URL);
    } catch {
      throw new AuthError(503, "Teacher data service is not configured.");
    }
    webhookUrl.searchParams.set("action", "teacher_dashboard");

    const data = await fetchTeacherSheetData(webhookUrl.toString());

    let learnerProgress = [];
    let vocabularyReviews = [];
    let assessmentAttempts = [];
    let teacherFeedback = [];
    if (env.FEX_DB) {
      const [progressRows, reviewRows, attemptRows, feedbackRows] = await Promise.all([
        env.FEX_DB.prepare("SELECT l.learner_id,l.email,mp.module_id,mp.status,mp.correct_answers,mp.total_questions,mp.attempts,mp.completed_at,mp.updated_at FROM learners l JOIN course_enrolments e ON e.learner_id=l.learner_id AND e.course_id=? AND e.status='active' LEFT JOIN module_progress mp ON mp.learner_id=l.learner_id AND mp.course_id=e.course_id ORDER BY l.email,mp.module_id").bind("retail-business-english").all(),
        env.FEX_DB.prepare("SELECT learner_id,item_id,repetitions,interval_days,due_at,last_reviewed_at,last_rating FROM vocabulary_reviews WHERE course_id=?").bind("retail-business-english").all(),
        env.FEX_DB.prepare("SELECT attempt_id,learner_id,assessment_id,score,total,submitted_at FROM assessment_attempts WHERE course_id=? ORDER BY submitted_at DESC LIMIT 500").bind("retail-business-english").all(),
        env.FEX_DB.prepare("SELECT feedback_id,learner_id,module_id,teacher_email,feedback,created_at FROM teacher_feedback WHERE course_id=? ORDER BY created_at DESC LIMIT 500").bind("retail-business-english").all()
      ]);
      learnerProgress = progressRows.results || [];
      vocabularyReviews = reviewRows.results || [];
      assessmentAttempts = attemptRows.results || [];
      teacherFeedback = feedbackRows.results || [];
    }

    return json(200, {
      ok: true,
      instructor: identity.email,
      generatedAt: data.generatedAt || new Date().toISOString(),
      ieltsResults: Array.isArray(data.ieltsResults) ? data.ieltsResults : [],
      writingSubmissions: Array.isArray(data.writingSubmissions) ? data.writingSubmissions : [],
      learnerProgress,
      vocabularyReviews,
      assessmentAttempts,
      teacherFeedback
    });
  } catch (error) {
    if (error instanceof AuthError) return json(error.status, { ok: false, error: error.message });
    return json(500, { ok: false, error: "Teacher data could not be loaded." });
  }
}


export async function onRequestPost({ request, env }) {
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) {
      throw new AuthError(415, "Send teacher feedback as JSON.");
    }
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) throw new AuthError(403, "This request origin is not allowed.");
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 6000) throw new AuthError(413, "The feedback is too long.");
    let payload;
    try { payload = JSON.parse(raw); } catch { throw new AuthError(400, "The feedback request is invalid."); }
    const identity = await verifyTeacherIdentity(request, env);
    if (!env.FEX_DB) throw new AuthError(503, "Learner progress storage is not configured.");
    if (!payload || payload.action !== "teacher_feedback") throw new AuthError(400, "The requested teacher action is not supported.");
    const learnerEmail = typeof payload.learnerEmail === "string" ? payload.learnerEmail.trim().toLowerCase() : "";
    const moduleId = typeof payload.moduleId === "string" ? payload.moduleId : "";
    const feedback = typeof payload.feedback === "string" ? payload.feedback.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(learnerEmail) || !["vocabulary","grammar","communication","case-study","assessment"].includes(moduleId) || !feedback || feedback.length > 2000) {
      throw new AuthError(400, "Check the learner, module and feedback fields.");
    }
    const learner = await env.FEX_DB.prepare("SELECT l.learner_id FROM learners l JOIN course_enrolments e ON e.learner_id=l.learner_id WHERE lower(l.email)=? AND e.course_id=? AND e.status='active'").bind(learnerEmail,"retail-business-english").first();
    if (!learner) throw new AuthError(404, "The active learner record was not found.");
    await env.FEX_DB.prepare("INSERT INTO teacher_feedback (feedback_id,learner_id,course_id,module_id,teacher_email,feedback) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),learner.learner_id,"retail-business-english",moduleId,identity.email,feedback).run();
    return json(200,{ok:true,message:"Feedback saved to the learner's private progress record."});
  } catch (error) {
    if (error instanceof AuthError) return json(error.status,{ok:false,error:error.message});
    return json(500,{ok:false,error:"Teacher feedback could not be saved."});
  }
}
