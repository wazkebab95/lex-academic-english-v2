# Lex Practice — Retail Business English

This is the first standalone learning-space prototype for Lex Academic English.

## Preview locally
Open \`index.html\` in a browser, or serve the repository with any static HTTP server. No build step is required. The page uses Tailwind CDN and Google Fonts.

## Current modules
- Retail vocabulary: 10 scored multiple-choice questions.
- Business grammar: 8 scored multiple-choice questions.
- Professional communication: 5 scenario-based questions.
- Retail case study: written response, local save, and example response.
- Final assessment: 10 mixed-skills questions.

## Current limitations
- Student profile fields are deliberately unconfirmed and configurable in \`STUDENT_PROFILE\`.
- Quiz progress and case-study text are stored in the current browser's localStorage only. They are not sent to a teacher or shared across devices.
- This prototype has no authentication or server-side authorisation. Do not distribute it to students or place confidential/personal student data in it until access control is configured.
- The question set is an initial generic prototype; calibrate difficulty and content once the student's level, role and learning priorities are confirmed.

## Secure deployment plan
1. Keep this feature branch separate from \`main\` and review its Netlify deploy preview.
2. Before production exposure, configure Cloudflare Access (or another server-side authentication layer) for the student path and test both authorised and unauthorised accounts.
3. Verify the hostname is correctly proxied through Cloudflare and test the Access policy against the exact path.
4. For individual student records, replace localStorage with a backend and enforce per-student authorisation server-side (for example, Supabase Auth + row-level security). Never rely on a hidden URL or client-side checks for privacy.
5. Merge to \`main\` only after explicit approval and successful preview/security tests.

## Student profile configuration
Update the \`STUDENT_PROFILE\` object in the page after confirming the learner's English level, professional role and target skills. Do not add a student's name or identifying details to a public repository.
