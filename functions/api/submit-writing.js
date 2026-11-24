export async function onRequestPost(context) {
  const { request, env } = context;

  const headers = {
    'Content-Type': 'application/json'
  };

  try {
    const body = await request.json();
    const studentName = (body.studentName || '').trim();
    const studentEmail = (body.studentEmail || '').trim();
    const taskType = (body.taskType || 'Task 2').trim();
    const promptTitle = (body.promptTitle || '').trim();
    const essayText = (body.essayText || '').trim();
    const timeSpent = (body.timeSpent || 'Untimed').trim();

    if (!studentName || !studentEmail || !essayText) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Name, email, and essay text are required.' }),
        { status: 400, headers }
      );
    }

    const words = essayText.split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const submissionId = `WR-${Date.now().toString().slice(-6)}`;

    // 1. Log to Google Sheets via Apps Script Webhook
    if (env.GOOGLE_SHEET_WEBHOOK_URL) {
      const sheetRes = await fetch(env.GOOGLE_SHEET_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'log_writing',
          submissionId,
          studentName,
          studentEmail,
          taskType,
          promptTitle,
          wordCount,
          timeSpent,
          essayText
        })
      });

      if (!sheetRes.ok) {
        throw new Error(`Google Sheets logging failed (${sheetRes.status})`);
      }
    }

    // 2. Send Dual Receipts via Resend API
    if (env.RESEND_API_KEY) {
      const instructorEmail = env.INSTRUCTOR_EMAIL || 'fawwazizeddin@gmail.com';
      const escapedEssay = essayText
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/\n/g, '<br/>');

      const emailHtml = `
        <div style="font-family: Georgia, serif; background:#FAF9F6; padding:32px; color:#1A1A1A;">
          <div style="max-width:640px; margin:0 auto; background:#FFFFFF; border:1px solid #E5E2DC; padding:28px;">
            <p style="font-family:sans-serif; font-size:11px; text-transform:uppercase; letter-spacing:2px; color:#3B5B8C; margin:0 0 8px;">
              Fex Studio · Academic Writing Submission
            </p>
            <h2 style="margin:0 0 16px; font-size:24px; font-weight:600;">
              ${taskType} Received (${submissionId})
            </h2>
            <table style="width:100%; font-family:sans-serif; font-size:13px; border-collapse:collapse; margin-bottom:20px;">
              <tr><td style="padding:6px 0; color:#767676;">Candidate:</td><td style="padding:6px 0; font-weight:600;">${studentName} (${studentEmail})</td></tr>
              <tr><td style="padding:6px 0; color:#767676;">Prompt:</td><td style="padding:6px 0;">${promptTitle}</td></tr>
              <tr><td style="padding:6px 0; color:#767676;">Word Count:</td><td style="padding:6px 0; font-weight:600;">${wordCount} words</td></tr>
              <tr><td style="padding:6px 0; color:#767676;">Duration:</td><td style="padding:6px 0;">${timeSpent}</td></tr>
            </table>
            <div style="background:#FAF9F6; border:1px solid #E5E2DC; padding:18px; font-family:sans-serif; font-size:14px; line-height:1.75;">
              ${escapedEssay}
            </div>
            <p style="font-family:sans-serif; font-size:12px; color:#767676; margin-top:20px;">
              Fex Studio · lexacademicenglish.co.uk
            </p>
          </div>
        </div>
      `;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Fex Studio <noreply@lexacademicenglish.co.uk>',
          to: [studentEmail, instructorEmail],
          reply_to: instructorEmail,
          subject: `[Fex Studio] ${taskType} Submission — ${studentName} (${wordCount} words)`,
          html: emailHtml
        })
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        submissionId,
        wordCount
      }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message || 'Submission failed.' }),
      { status: 500, headers }
    );
  }
}
