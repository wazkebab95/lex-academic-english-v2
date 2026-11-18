export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const payload = await request.json();
    const {
      studentName = "Student",
      department = "General",
      chapter = "Chapter 01",
      score = "N/A",
      answers = []
    } = payload;

    const submittedAt = new Date().toLocaleString("en-GB", {
      timeZone: "Europe/Istanbul",
      dateStyle: "medium",
      timeStyle: "short"
    });

    // 1. Log to Google Sheets via your existing Google Apps Script webhook
    if (env.GOOGLE_SCRIPT_URL) {
      await fetch(env.GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "homework_submission",
          submittedAt,
          studentName,
          department,
          chapter,
          score,
          answers: answers.map((a, i) => `${i + 1}. ${a}`).join(" | ")
        })
      });
    }

    // 2. Send formatted pre-lesson brief to your inbox via Resend API
    if (env.RESEND_API_KEY && env.TUTOR_EMAIL) {
      const formattedList = answers
        .map((ans, idx) => `<p><strong>Prompt ${idx + 1}:</strong><br/>${ans || "<em>(Blank)</em>"}</p>`)
        .join("");

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: env.RESEND_FROM_EMAIL || "Fex Studio <noreply@lexacademicenglish.co.uk>",
          to: [env.TUTOR_EMAIL],
          subject: `[Fex Homework] ${studentName} · ${department} (${chapter}) — ${score}`,
          html: `
            <div style="font-family: -apple-system, sans-serif; color: #1C1C1C; max-width: 600px;">
              <h2 style="margin-bottom: 4px;">Fex Studio · Homework Submission</h2>
              <p style="color: #5E5D5A; font-size: 13px; margin-top: 0;">Submitted ${submittedAt} (Istanbul Time)</p>
              <hr style="border: none; border-top: 1px solid #E2E1DF; margin: 16px 0;" />
              <p><strong>Student:</strong> ${studentName}<br/>
                 <strong>Track:</strong> ${department} · ${chapter}<br/>
                 <strong>Auto-Graded Score:</strong> ${score}</p>
              <hr style="border: none; border-top: 1px solid #E2E1DF; margin: 16px 0;" />
              ${formattedList}
            </div>
          `
        })
      });
    }

    return new Response(JSON.stringify({ ok: true, submittedAt }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
