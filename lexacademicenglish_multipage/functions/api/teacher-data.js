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

    let sheetResponse;
    try {
      sheetResponse = await fetch(webhookUrl.toString(), {
        method: "GET",
        headers: { Accept: "application/json" }
      });
    } catch {
      throw new AuthError(502, "Teacher data is temporarily unavailable.");
    }
    if (!sheetResponse.ok) throw new AuthError(502, "Teacher data is temporarily unavailable.");

    let data;
    try {
      data = await sheetResponse.json();
    } catch {
      throw new AuthError(502, "Teacher data is temporarily unavailable.");
    }

    return json(200, {
      ok: true,
      instructor: identity.email,
      generatedAt: data.generatedAt || new Date().toISOString(),
      ieltsResults: Array.isArray(data.ieltsResults) ? data.ieltsResults : [],
      writingSubmissions: Array.isArray(data.writingSubmissions) ? data.writingSubmissions : []
    });
  } catch (error) {
    if (error instanceof AuthError) return json(error.status, { ok: false, error: error.message });
    return json(500, { ok: false, error: "Teacher data could not be loaded." });
  }
}
