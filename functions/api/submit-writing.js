const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'The submission could not be read. Please check your response and try again.' }, 400);
    }

    const studentName = String(body.studentName || '').trim();
    const studentEmail = String(body.studentEmail || '').trim();
    const taskType = String(body.taskType || '').trim();
    const promptTitle = String(body.promptTitle || '').trim();
    const essayText = String(body.essayText || '').trim();
    const timeSpent = String(body.timeSpent || 'Untimed').trim();

    if (!studentName || !studentEmail || !essayText || !taskType || !promptTitle) {
      return json({ ok: false, error: 'Name, email, task, prompt and written response are required.' }, 400);
    }
    if (studentName.length > 160 || studentEmail.length > 254 || promptTitle.length > 500 || essayText.length > 30000) {
      return json({ ok: false, error: 'One or more submission fields exceed the permitted length.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentEmail)) {
      return json({ ok: false, error: 'Please provide a valid email address.' }, 400);
    }
    if (!['Task 1', 'Task 2'].includes(taskType)) {
      return json({ ok: false, error: 'The selected writing task is not recognised.' }, 400);
    }

    if (!env.GOOGLE_SHEET_WEBHOOK_URL || !env.RESEND_API_KEY || !env.INSTRUCTOR_EMAIL) {
      return json({
        ok: false,
        error: 'Writing submissions are temporarily unavailable because the instructor delivery service is not fully configured. Your response has not been submitted.'
      }, 503);
    }

    const wordCount = essayText.split(/\s+/).filter(Boolean).length;
    const submissionId = `WR-${crypto.randomUUID()}`;
    const instructorEmail = String(env.INSTRUCTOR_EMAIL).trim();

    const emailHtml = `
      <div style="font-family:Arial,sans-serif;background:#F8FAFC;padding:28px;color:#0F172A">
        <div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;padding:26px">
          <p style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#1E3A8A">Fex Studio · Writing submission</p>
          <h2 style="font-size:22px;margin:8px 0 18px">${escapeHtml(taskType)} received</h2>
          <p><strong>Reference:</strong> ${escapeHtml(submissionId)}</p>
          <p><strong>Candidate:</strong> ${escapeHtml(studentName)} (${escapeHtml(studentEmail)})</p>
          <p><strong>Prompt:</strong> ${escapeHtml(promptTitle)}</p>
          <p><strong>Word count:</strong> ${wordCount}</p>
          <p><strong>Time spent:</strong> ${escapeHtml(timeSpent)}</p>
          <hr style="border:0;border-top:1px solid #E2E8F0;margin:20px 0">
          <div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.75">${escapeHtml(essayText)}</div>
          <p style="font-size:12px;color:#64748B;margin-top:24px">Fex Studio · lexacademicenglish.co.uk</p>
        </div>
      </div>
    `;

    // Deliver the full script to the instructor and send the learner a receipt.
    const emailResponse = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Fex Studio <noreply@lexacademicenglish.co.uk>',
        to: [instructorEmail, studentEmail],
        reply_to: instructorEmail,
        subject: `[Fex Studio] ${taskType} — ${studentName} (${wordCount} words)`,
        html: emailHtml
      })
    });

    if (!emailResponse.ok) {
      return json({
        ok: false,
        error: 'The writing service could not deliver your script to the instructor. Nothing has been recorded; please try again shortly.'
      }, 502);
    }

    // Record the same submission for the teacher dashboard.
    const sheetResponse = await fetchWithTimeout(env.GOOGLE_SHEET_WEBHOOK_URL, {
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

    if (!sheetResponse.ok) {
      return json({
        ok: false,
        submissionId,
        emailDelivered: true,
        error: 'Your script was emailed to the instructor, but the instructor ledger could not be updated. Please contact your instructor and quote reference ' + submissionId + '.'
      }, 502);
    }

    return json({ ok: true, submissionId, wordCount, emailDelivered: true, recorded: true });
  } catch (error) {
    const message = error && error.name === 'AbortError'
      ? 'The submission service timed out. Please try again shortly.'
      : 'The submission service encountered an error. Please try again shortly.';
    return json({ ok: false, error: message }, 502);
  }
}
