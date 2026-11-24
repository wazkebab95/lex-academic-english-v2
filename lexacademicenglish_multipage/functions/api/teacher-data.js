export async function onRequestGet(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  };

  try {
    if (!env.GOOGLE_SHEET_WEBHOOK_URL) {
      return new Response(
        JSON.stringify({ ok: false, error: 'GOOGLE_SHEET_WEBHOOK_URL is not configured.' }),
        { status: 500, headers: corsHeaders }
      );
    }

    // Optional Cloudflare Zero Trust identity passthrough
    const authenticatedEmail =
      request.headers.get('Cf-Access-Authenticated-User-Email') ||
      env.INSTRUCTOR_EMAIL ||
      'instructor@lexacademicenglish.co.uk';

    const webhookUrl = new URL(env.GOOGLE_SHEET_WEBHOOK_URL);
    webhookUrl.searchParams.set('action', 'teacher_dashboard');

    const sheetResponse = await fetch(webhookUrl.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });

    if (!sheetResponse.ok) {
      throw new Error(`Apps Script upstream responded with ${sheetResponse.status}`);
    }

    const data = await sheetResponse.json();

    return new Response(
      JSON.stringify({
        ok: true,
        instructor: authenticatedEmail,
        generatedAt: data.generatedAt || new Date().toISOString(),
        ieltsResults: Array.isArray(data.ieltsResults) ? data.ieltsResults : [],
        writingSubmissions: Array.isArray(data.writingSubmissions) ? data.writingSubmissions : []
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message || 'Failed to load teacher ledger.' }),
      { status: 500, headers: corsHeaders }
    );
  }
}
