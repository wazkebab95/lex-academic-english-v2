const COURSE_ID = "retail-business-english";
const MODULE_LIMITS = Object.freeze({
  vocabulary: 6,
  grammar: 6,
  communication: 5,
  assessment: 10
});
const MAX_BODY_BYTES = 8192;
const MAX_TOKEN_LENGTH = 8192;
const JWKS_TTL_MS = 5 * 60 * 1000;

let jwksCache = null;
let jwksCacheIssuer = "";
let jwksCacheExpires = 0;

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function normaliseIssuer(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const candidate = value.trim().includes("://") ? value.trim() : "https://" + value.trim();
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function decodeBase64Url(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function decodeJsonSegment(value) {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
}

async function loadJwks(issuer, forceRefresh) {
  const now = Date.now();
  if (!forceRefresh && jwksCache && jwksCacheIssuer === issuer && now < jwksCacheExpires) {
    return jwksCache;
  }
  const response = await fetch(issuer + "/cdn-cgi/access/certs", {
    headers: { "Accept": "application/json" },
    redirect: "error"
  });
  if (!response.ok) throw new Error("Access signing keys are unavailable");
  const document = await response.json();
  if (!document || !Array.isArray(document.keys)) throw new Error("Invalid Access signing-key response");
  jwksCache = document;
  jwksCacheIssuer = issuer;
  jwksCacheExpires = now + JWKS_TTL_MS;
  return document;
}

async function authenticate(request, env) {
  const issuer = normaliseIssuer(env.ACCESS_TEAM_DOMAIN);
  const audience = typeof env.ACCESS_AUD === "string" ? env.ACCESS_AUD.trim() : "";
  if (!issuer || !audience) {
    return { error: "Access verification is not configured.", status: 503 };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    return { error: "Access authentication is required.", status: 401 };
  }

  const parts = token.split(".");
  if (parts.length !== 3 || parts.some(function (part) { return !part; })) {
    return { error: "Access authentication is invalid.", status: 401 };
  }

  let header;
  let claims;
  try {
    header = decodeJsonSegment(parts[0]);
    claims = decodeJsonSegment(parts[1]);
  } catch {
    return { error: "Access authentication is invalid.", status: 401 };
  }

  if (!header || header.alg !== "RS256" || typeof header.kid !== "string") {
    return { error: "Access authentication is invalid.", status: 401 };
  }

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    claims.iss !== issuer ||
    !audiences.includes(audience) ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > now + 5)) ||
    typeof claims.sub !== "string" ||
    !claims.sub.trim() ||
    claims.sub.length > 255
  ) {
    return { error: "Access authentication is invalid or expired.", status: 401 };
  }

  let keySet;
  try {
    keySet = await loadJwks(issuer, false);
  } catch {
    return { error: "Access verification is temporarily unavailable.", status: 503 };
  }

  let jwk = keySet.keys.find(function (key) {
    return key && key.kid === header.kid && key.kty === "RSA" &&
      (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256");
  });

  if (!jwk) {
    try {
      keySet = await loadJwks(issuer, true);
      jwk = keySet.keys.find(function (key) {
        return key && key.kid === header.kid && key.kty === "RSA" &&
          (!key.use || key.use === "sig") && (!key.alg || key.alg === "RS256");
      });
    } catch {
      return { error: "Access verification is temporarily unavailable.", status: 503 };
    }
  }
  if (!jwk) return { error: "Access authentication is invalid.", status: 401 };

  try {
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1])
    );
    if (!valid) return { error: "Access authentication is invalid.", status: 401 };
  } catch {
    return { error: "Access authentication is invalid.", status: 401 };
  }

  return { identity: { sub: claims.sub } };
}

async function readLimitedBody(request) {
  if (!request.body) return { text: "" };
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;

  while (true) {
    const item = await reader.read();
    if (item.done) break;
    total += item.value.byteLength;
    if (total > MAX_BODY_BYTES) {
      try { await reader.cancel(); } catch {}
      return { tooLarge: true };
    }
    chunks.push(item.value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(merged) };
}

function validateProgress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "answers,caseReviewed,courseId,version") return null;
  if (value.version !== 1 || value.courseId !== COURSE_ID || typeof value.caseReviewed !== "boolean") return null;
  if (!value.answers || typeof value.answers !== "object" || Array.isArray(value.answers)) return null;

  const allowedModules = Object.keys(MODULE_LIMITS);
  if (Object.keys(value.answers).some(function (id) { return !allowedModules.includes(id); })) return null;

  const answers = {};
  for (const id of allowedModules) {
    const submitted = value.answers[id] === undefined ? [] : value.answers[id];
    if (!Array.isArray(submitted) || submitted.length > MODULE_LIMITS[id]) return null;
    const cleaned = [];
    for (const choice of submitted) {
      if (choice === null) {
        cleaned.push(null);
      } else if (Number.isInteger(choice) && choice >= 0 && choice <= 2) {
        cleaned.push(choice);
      } else {
        return null;
      }
    }
    answers[id] = cleaned;
  }

  return {
    version: 1,
    courseId: COURSE_ID,
    answers: answers,
    caseReviewed: value.caseReviewed
  };
}

export async function onRequest({ request, env }) {
  const method = request.method.toUpperCase();
  if (!["GET", "PUT", "DELETE"].includes(method)) {
    return jsonResponse({ success: false, error: "Method not allowed." }, 405);
  }

  const auth = await authenticate(request, env);
  if (!auth.identity) {
    return jsonResponse({ success: false, error: auth.error }, auth.status);
  }

  const database = env.RETAIL_PROGRESS_DB;
  if (!database || typeof database.prepare !== "function") {
    return jsonResponse({ success: false, error: "Retail progress storage is not configured." }, 503);
  }

  const studentSub = auth.identity.sub;

  try {
    if (method === "GET") {
      const row = await database.prepare(
        "SELECT progress_json, updated_at FROM retail_student_progress WHERE student_sub = ? AND course_id = ? LIMIT 1"
      ).bind(studentSub, COURSE_ID).first();

      if (!row) return jsonResponse({ success: true, progress: null, updatedAt: null }, 200);

      let progress;
      try {
        progress = validateProgress(JSON.parse(row.progress_json));
      } catch {
        progress = null;
      }
      if (!progress) return jsonResponse({ success: false, error: "The saved progress record is invalid." }, 500);
      return jsonResponse({ success: true, progress: progress, updatedAt: row.updated_at }, 200);
    }

    if (method === "DELETE") {
      await database.prepare(
        "DELETE FROM retail_student_progress WHERE student_sub = ? AND course_id = ?"
      ).bind(studentSub, COURSE_ID).run();
      return jsonResponse({ success: true, deleted: true }, 200);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      return jsonResponse({ success: false, error: "Content-Type must be application/json." }, 415);
    }

    const body = await readLimitedBody(request);
    if (body.tooLarge) return jsonResponse({ success: false, error: "Progress payload exceeds the 8 KB limit." }, 413);

    let parsed;
    try {
      parsed = JSON.parse(body.text);
    } catch {
      return jsonResponse({ success: false, error: "Request body must be valid JSON." }, 400);
    }

    const progress = validateProgress(parsed);
    if (!progress) {
      return jsonResponse({ success: false, error: "Progress payload has an unsupported or invalid format." }, 400);
    }

    const updatedAt = new Date().toISOString();
    await database.prepare(
      "INSERT INTO retail_student_progress (student_sub, course_id, progress_json, updated_at) VALUES (?, ?, ?, ?) " +
      "ON CONFLICT(student_sub, course_id) DO UPDATE SET progress_json = excluded.progress_json, updated_at = excluded.updated_at"
    ).bind(studentSub, COURSE_ID, JSON.stringify(progress), updatedAt).run();

    return jsonResponse({ success: true, updatedAt: updatedAt }, 200);
  } catch {
    return jsonResponse({ success: false, error: "Retail progress could not be processed." }, 500);
  }
}
