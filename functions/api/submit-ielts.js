export async function onRequestPost({ request, env }) {
  try {
    const payload = await request.json();
    const {
      studentName,
      studentEmail,
      category,
      score,
      bandEstimate,
      timeTaken,
      detailsHtml,
      detailsPlain
    } = payload;

    if (!studentName || !studentEmail || !category) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required student fields." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const timestamp = new Date().toLocaleString("en-GB", {
      timeZone: "Europe/Istanbul",
      dateStyle: "medium",
      timeStyle: "short"
    });

    // 1. Append row to Google Sheets ('Results' tab)
    const sheetTask = fetch(env.GOOGLE_SHEET_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp,
        studentName,
        studentEmail,
        category,
        score,
        bandEstimate,
        timeTaken,
        details: detailsPlain || ""
      })
    });

    // 2. Prepare Resend API headers
    const resendHeaders = {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    };

    // 3. Student Diagnostic Receipt Email
    const studentEmailTask = fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: resendHeaders,
      body: JSON.stringify({
        from: "Lex Academic English <assessments@lexacademicenglish.co.uk>",
        to: [studentEmail],
        subject: `IELTS ${category} Diagnostic Result — ${bandEstimate} (${score})`,
        html: `
          <div style="font-family: Georgia, serif; max-width: 640px; margin: 0 auto; color: #1C1C1C; background: #FAF9F6; padding: 32px; border: 1px solid #E2DFD7;">
            <p style="font-family: sans-serif; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #1B365D; margin: 0 0 8px;">Lex Academic English</p>
            <h1 style="font-size: 24px; font-weight: normal; margin: 0 0 20px; border-bottom: 1px solid #E2DFD7; padding-bottom: 16px;">
              IELTS ${category} Assessment Receipt
            </h1>
            <table style="width: 100%; font-family: sans-serif; font-size: 14px; margin-bottom: 24px; border-collapse: collapse;">
              <tr><td style="padding: 6px 0; color: #5C5B57;">Candidate:</td><td style="padding: 6px 0; font-weight: 600;">${studentName}</td></tr>
              <tr><td style="padding: 6px 0; color: #5C5B57;">Score:</td><td style="padding: 6px 0; font-weight: 600;">${score} (${bandEstimate})</td></tr>
              <tr><td style="padding: 6px 0; color: #5C5B57;">Duration:</td><td style="padding: 6px 0;">${timeTaken || "N/A"}</td></tr>
              <tr><td style="padding: 6px 0; color: #5C5B57;">Recorded:</td><td style="padding: 6px 0;">${timestamp}</td></tr>
            </table>
            <div style="background: #FFFFFF; border: 1px solid #E2DFD7; padding: 20px; font-family: sans-serif; font-size: 14px; line-height: 1.6;">
              ${detailsHtml || detailsPlain}
            </div>
          </div>
        `
      })
    });

    // 4. Instructor Copy Email
    const instructorEmailTask = fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: resendHeaders,
      body: JSON.stringify({
        from: "Lex Assessment System <system@lexacademicenglish.co.uk>",
        to: [env.INSTRUCTOR_EMAIL],
        subject: `[IELTS Submission] ${studentName} — ${category} (${score})`,
        html: `
          <div style="font-family: sans-serif; max-width: 640px; margin: 0 auto; color: #1C1C1C; padding: 24px; border: 1px solid #E2DFD7;">
            <h2 style="margin-top: 0; color: #1B365D;">New IELTS Module Submission</h2>
            <p><strong>Student:</strong> ${studentName} (${studentEmail})</p>
            <p><strong>Module:</strong> ${category}  |  <strong>Score:</strong> ${score} (${bandEstimate})  |  <strong>Time:</strong> ${timeTaken}</p>
            <p style="font-size: 13px; color: #2E5A44;">✓ Automatically logged to Google Sheets ('Results' tab).</p>
            <hr style="border: none; border-top: 1px solid #E2DFD7; margin: 16px 0;" />
            <div style="font-size: 14px; line-height: 1.6;">${detailsHtml || detailsPlain}</div>
          </div>
        `
      })
    });

    await Promise.all([sheetTask, studentEmailTask, instructorEmailTask]);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
