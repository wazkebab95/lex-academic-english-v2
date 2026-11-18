const MAX_BODY_BYTES = 64 * 1024;
const MAX_DETAILS_CHARS = 20000;

class SubmissionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function readJsonBody(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new SubmissionError("A JSON request is required.", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new SubmissionError("The submission is too large.", 413);
  }

  const reader = request.body && request.body.getReader();
  if (!reader) throw new SubmissionError("A submission body is required.", 400);

  const chunks = [];
  let total = 0;

  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;

    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new SubmissionError("The submission is too large.", 413);
    }

    chunks.push(part.value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SubmissionError("The submission is not valid JSON.", 400);
  }
}

function readText(payload, keys, options = {}) {
  const required = Boolean(options.required);
  const max = options.max || 500;
  const fallback = options.fallback || "";
  const allowNumber = Boolean(options.allowNumber);
  const key = keys.find(candidate =>
    Object.prototype.hasOwnProperty.call(payload, candidate) &&
    payload[candidate] !== undefined &&
    payload[candidate] !== null
  );

  if (!key) {
    if (required) throw new SubmissionError("A required field is missing.", 400);
    return fallback;
  }

  const raw = payload[key];
  if (typeof raw !== "string" && !(allowNumber && typeof raw === "number" && Number.isFinite(raw))) {
    throw new SubmissionError("A submission field has an invalid type.", 400);
  }

  const value = String(raw).trim();
  if (required && !value) throw new SubmissionError("A required field is missing.", 400);
  if (value.length > max) throw new SubmissionError("A submission field is too long.", 400);
  return value;
}

function isValidEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

function safeSubject(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeSheetValue(value) {
  const text = String(value ?? "");
  return /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
}

function normaliseDetails(payload) {
  if (Object.prototype.hasOwnProperty.call(payload, "detailsPlain")) {
    return readText(payload, ["detailsPlain"], { max: MAX_DETAILS_CHARS });
  }

  // Compatibility with the current IELTS and Retail forms, which still send
  // the original name/email/module/essay payload contract.
  const wordCount = readText(payload, ["wordCount"], {
    max: 30,
    fallback: "Not supplied",
    allowNumber: true
  });
  const missedTopics = readText(payload, ["missedTopics"], {
    max: 2000,
    fallback: "Not supplied"
  });
  const essay = readText(payload, ["essay"], {
    max: 16000,
    fallback: ""
  });

  const lines = [
    "Word count: " + wordCount,
    "Topics to review: " + missedTopics
  ];
  if (essay) {
    lines.push("", "Written response:", essay);
  }

  const details = lines.join("\n");
  if (details.length > MAX_DETAILS_CHARS) {
    throw new SubmissionError("The submission details are too long.", 400);
  }
  return details;
}

export async function onRequestPost({ request, env }) {
  try {
    const payload = await readJsonBody(request);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return jsonResponse({ success: false, error: "Invalid submission." }, 400);
    }

    // Accept both the canonical field names and the legacy names still used
    // by the published IELTS and Retail forms.
    const studentName = readText(payload, ["studentName", "name"], { required: true, max: 120 });
    const studentEmail = readText(payload, ["studentEmail", "email"], { required: true, max: 254 });
    const category = readText(payload, ["category", "module"], { required: true, max: 120 });
    const score = readText(payload, ["score"], { max: 100, fallback: "Not supplied", allowNumber: true });
    const bandEstimate = readText(payload, ["bandEstimate"], { max: 80, fallback: "Pending instructor review" });
    const timeTaken = readText(payload, ["timeTaken"], { max: 40, fallback: "Not recorded" });
    const detailsPlain = normaliseDetails(payload);

    if (!isValidEmail(studentEmail)) {
      return jsonResponse({ success: false, error: "Please provide a valid email address." }, 400);
    }

    if (!env || !env.GOOGLE_SHEET_WEBHOOK_URL || !env.RESEND_API_KEY || !env.INSTRUCTOR_EMAIL) {
      return jsonResponse({ success: false, error: "Submission service is not configured." }, 503);
    }

    const instructorEmail = String(env.INSTRUCTOR_EMAIL).trim();
    if (!isValidEmail(instructorEmail)) {
      return jsonResponse({ success: false, error: "Submission service is not configured." }, 503);
    }

    let sheetUrl;
    try {
      sheetUrl = new URL(env.GOOGLE_SHEET_WEBHOOK_URL);
    } catch {
      return jsonResponse({ success: false, error: "Submission service is not configured." }, 503);
    }
    if (sheetUrl.protocol !== "https:") {
      return jsonResponse({ success: false, error: "Submission service is not configured." }, 503);
    }

    const timestamp = new Date().toLocaleString("en-GB", {
      timeZone: "Europe/Istanbul",
      dateStyle: "medium",
      timeStyle: "short"
    });

    // Only plain text is accepted from the browser. Client-supplied HTML is ignored.
    const safeDetailsHtml = detailsPlain
      ? '<div style="font-size:14px;line-height:1.6;white-space:normal;">' +
        escapeHtml(detailsPlain).replace(/\r?\n/g, "<br>") +
        "</div>"
      : "<p>No additional submission details were provided.</p>";

    const safeName = escapeHtml(studentName);
    const safeEmail = escapeHtml(studentEmail);
    const safeCategory = escapeHtml(category);
    const safeScore = escapeHtml(score);
    const safeBandEstimate = escapeHtml(bandEstimate);
    const safeTimeTaken = escapeHtml(timeTaken);
    const safeTimestamp = escapeHtml(timestamp);

    const resendHeaders = {
      Authorization: "Bearer " + env.RESEND_API_KEY,
      "Content-Type": "application/json"
    };

    const requests = [
      fetch(sheetUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timestamp: safeSheetValue(timestamp),
          studentName: safeSheetValue(studentName),
          studentEmail: safeSheetValue(studentEmail),
          category: safeSheetValue(category),
          score: safeSheetValue(score),
          bandEstimate: safeSheetValue(bandEstimate),
          timeTaken: safeSheetValue(timeTaken),
          details: safeSheetValue(detailsPlain)
        })
      }),
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: resendHeaders,
        body: JSON.stringify({
          from: "Lex Academic English <assessments@lexacademicenglish.co.uk>",
          to: [studentEmail],
          subject: "Lex Academic English assessment receipt — " + safeSubject(category) + " (" + safeSubject(score) + ")",
          html:
            '<div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;color:#1C1C1C;background:#FAF9F6;padding:32px;border:1px solid #E2DFD7;">' +
            '<p style="font-family:sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#1B365D;margin:0 0 8px;">Lex Academic English</p>' +
            '<h1 style="font-size:24px;font-weight:normal;margin:0 0 20px;border-bottom:1px solid #E2DFD7;padding-bottom:16px;">' + safeCategory + " Assessment Receipt</h1>" +
            '<table style="width:100%;font-family:sans-serif;font-size:14px;margin-bottom:24px;border-collapse:collapse;">' +
            "<tr><td>Candidate:</td><td><strong>" + safeName + "</strong></td></tr>" +
            "<tr><td>Score:</td><td><strong>" + safeScore + " (" + safeBandEstimate + ")</strong></td></tr>" +
            "<tr><td>Duration:</td><td>" + safeTimeTaken + "</td></tr>" +
            "<tr><td>Recorded:</td><td>" + safeTimestamp + "</td></tr>" +
            "</table>" +
            '<div style="background:#FFFFFF;border:1px solid #E2DFD7;padding:20px;font-family:sans-serif;">' +
            safeDetailsHtml +
            "</div></div>"
        })
      }),
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: resendHeaders,
        body: JSON.stringify({
          from: "Lex Assessment System <system@lexacademicenglish.co.uk>",
          to: [instructorEmail],
          subject: "[Student Submission] " + safeSubject(studentName) + " — " + safeSubject(category) + " (" + safeSubject(score) + ")",
          html:
            '<div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#1C1C1C;padding:24px;border:1px solid #E2DFD7;">' +
            '<h2 style="margin-top:0;color:#1B365D;">New Student Module Submission</h2>' +
            "<p><strong>Student:</strong> " + safeName + " (" + safeEmail + ")</p>" +
            "<p><strong>Module:</strong> " + safeCategory + " | <strong>Score:</strong> " + safeScore + " (" + safeBandEstimate + ") | <strong>Time:</strong> " + safeTimeTaken + "</p>" +
            '<p style="font-size:13px;color:#2E5A44;">Submission received for instructor review.</p>' +
            '<hr style="border:none;border-top:1px solid #E2DFD7;margin:16px 0;" />' +
            safeDetailsHtml +
            "</div>"
        })
      })
    ];

    const results = await Promise.allSettled(requests);
    const statuses = results.map(result =>
      result.status === "fulfilled" ? result.value.status : 0
    );

    if (statuses.some(status => status < 200 || status >= 300)) {
      console.error("Assessment submission upstream failure", { statuses });
      return jsonResponse({
        success: false,
        error: "Submission could not be completed. Please try again later."
      }, 502);
    }

    return jsonResponse({ success: true }, 200);
  } catch (error) {
    if (error instanceof SubmissionError) {
      return jsonResponse({ success: false, error: error.message }, error.status);
    }
    console.error("Assessment submission failed:", error && error.message ? error.message : "Unknown error");
    return jsonResponse({
      success: false,
      error: "Submission could not be completed. Please try again later."
    }, 500);
  }
}
