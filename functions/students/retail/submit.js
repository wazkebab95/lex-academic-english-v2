const encoder = new TextEncoder();
const MAX_BODY_BYTES = 16 * 1024;
const MAX_RESPONSE_CHARS = 10000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class HttpError extends Error {
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
  if (!input) throw new HttpError(503, "Retail authentication is not configured.");
  let url;
  try {
    url = new URL(/^https:\/\//i.test(input) ? input : "https://" + input);
  } catch {
    throw new HttpError(503, "Retail authentication is not configured.");
  }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new HttpError(503, "Retail authentication is not configured.");
  }
  return url.origin;
}

async function verifyAccessIdentity(request, env) {
  const teamOrigin = normaliseTeamOrigin(env.CF_ACCESS_TEAM_DOMAIN);
  const audience = String(env.RETAIL_ACCESS_AUD || "").trim();
  const allowedEmails = String(env.RETAIL_ALLOWED_EMAILS || "")
    .split(",")
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  if (!audience || allowedEmails.length === 0) {
    throw new HttpError(503, "Retail authentication is not configured.");
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new HttpError(401, "An authorised student sign-in is required.");

  const parts = token.split(".");
  if (parts.length !== 3) throw new HttpError(401, "The student sign-in could not be verified.");

  let header;
  let claims;
  try {
    header = decodeJsonSegment(parts[0]);
    claims = decodeJsonSegment(parts[1]);
  } catch {
    throw new HttpError(401, "The student sign-in could not be verified.");
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
    throw new HttpError(401, "The student sign-in could not be verified.");
  }

  let jwksResponse;
  try {
    jwksResponse = await fetch(teamOrigin + "/cdn-cgi/access/certs", {
      headers: { Accept: "application/json" }
    });
  } catch {
    throw new HttpError(503, "Student sign-in verification is temporarily unavailable.");
  }
  if (!jwksResponse.ok) {
    throw new HttpError(503, "Student sign-in verification is temporarily unavailable.");
  }

  let jwks;
  try {
    jwks = await jwksResponse.json();
  } catch {
    throw new HttpError(503, "Student sign-in verification is temporarily unavailable.");
  }

  const jwk = Array.isArray(jwks.keys)
    ? jwks.keys.find(key => key.kid === header.kid && key.kty === "RSA")
    : null;
  if (!jwk || (jwk.use && jwk.use !== "sig") || (jwk.alg && jwk.alg !== "RS256")) {
    throw new HttpError(401, "The student sign-in could not be verified.");
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
    throw new HttpError(401, "The student sign-in could not be verified.");
  }
  if (!validSignature) throw new HttpError(401, "The student sign-in could not be verified.");

  const now = Math.floor(Date.now() / 1000);
  const tokenAudiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    claims.iss !== teamOrigin ||
    !tokenAudiences.includes(audience) ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= now ||
    (Number.isFinite(claims.nbf) && claims.nbf > now + 60) ||
    (Number.isFinite(claims.iat) && claims.iat > now + 60)
  ) {
    throw new HttpError(401, "The student sign-in could not be verified.");
  }

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email)) throw new HttpError(401, "The student sign-in has no valid email identity.");
  if (!allowedEmails.includes(email)) throw new HttpError(403, "This account is not authorised for the Retail pilot.");

  return { email };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function onRequestPost({ request, env }) {
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) {
      throw new HttpError(415, "Send the assessment as JSON.");
    }

    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) {
      throw new HttpError(403, "This submission origin is not allowed.");
    }

    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_BODY_BYTES) throw new HttpError(413, "The submission is too large.");

    const rawBody = await request.text();
    if (encoder.encode(rawBody).byteLength > MAX_BODY_BYTES) {
      throw new HttpError(413, "The submission is too large.");
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new HttpError(400, "The submission is not valid JSON.");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new HttpError(400, "The submission format is invalid.");
    }

    const identity = await verifyAccessIdentity(request, env);

    if (payload.consentToSubmit !== true) {
      throw new HttpError(400, "Confirm that you agree to send the assessment score to your tutor.");
    }

    const correct = payload.correct;
    const total = payload.total;
    if (!Number.isInteger(correct) || !Number.isInteger(total) || total !== 4 || correct < 0 || correct > total) {
      throw new HttpError(400, "The assessment score is invalid.");
    }

    const role = typeof payload.role === "string" ? payload.role.trim() : "";
    const missedTopics = typeof payload.missedTopics === "string" ? payload.missedTopics.trim() : "";
    if (role.length > 120 || missedTopics.length > 500) {
      throw new HttpError(400, "One or more assessment fields are too long.");
    }

    const includeWrittenResponse = payload.includeWrittenResponse === true;
    const writtenResponse = includeWrittenResponse && typeof payload.writtenResponse === "string"
      ? payload.writtenResponse.trim()
      : "";
    if (includeWrittenResponse && (!writtenResponse || writtenResponse.length > MAX_RESPONSE_CHARS)) {
      throw new HttpError(400, "The written response is empty or too long.");
    }

    const instructorEmail = String(env.INSTRUCTOR_EMAIL || "").trim();
    const resendKey = String(env.RESEND_API_KEY || "").trim();
    if (!EMAIL_PATTERN.test(instructorEmail) || !resendKey) {
      throw new HttpError(503, "The assessment delivery service is not configured.");
    }

    const timestamp = new Date().toLocaleString("en-GB", {
      timeZone: "Europe/Istanbul",
      dateStyle: "medium",
      timeStyle: "short"
    });
    const percentage = Math.round((correct / total) * 100);
    const scoreLabel = correct + " / " + total + " (" + percentage + "%)";
    const safeWrittenResponse = includeWrittenResponse
      ? '<h2>Written response (student opted in)</h2><pre style="white-space:pre-wrap;font:14px/1.6 sans-serif;background:#f6f8fa;padding:16px;border:1px solid #dce3e9;">' + escapeHtml(writtenResponse) + "</pre>"
      : "<p>The student did not opt in to sharing the written response.</p>";

    const html = [
      '<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#182536;line-height:1.6">',
      "<h1>Retail Business English assessment</h1>",
      "<p><strong>Verified Access identity:</strong> " + escapeHtml(identity.email) + "</p>",
      "<p><strong>Score:</strong> " + escapeHtml(scoreLabel) + "</p>",
      "<p><strong>Retail focus / role:</strong> " + escapeHtml(role || "Not supplied") + "</p>",
      "<p><strong>Topics to review:</strong> " + escapeHtml(missedTopics || "None reported") + "</p>",
      "<p><strong>Received:</strong> " + escapeHtml(timestamp) + "</p>",
      safeWrittenResponse,
      "</div>"
    ].join("");

    let delivery;
    try {
      delivery = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + resendKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "Lex Academic English <assessments@lexacademicenglish.co.uk>",
          to: [instructorEmail],
          subject: "Retail Business English assessment submission",
          html
        })
      });
    } catch {
      throw new HttpError(502, "The assessment could not be delivered. Please try again later.");
    }
    if (!delivery.ok) {
      throw new HttpError(502, "The assessment could not be delivered. Please try again later.");
    }

    return json(200, {
      success: true,
      message: "Your assessment has been sent to your tutor.",
      writtenResponseIncluded: includeWrittenResponse
    });
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { success: false, error: error.message });
    return json(500, { success: false, error: "The assessment could not be processed." });
  }
}
