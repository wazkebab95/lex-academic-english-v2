# Lex Practice — Security, QA and deployment notes

## Current implementation

The Retail programme now has a standalone five-module learning path at:

`/students/retail/learning-path/`

The learning path contains:

| Module | Format | Scored questions |
|---|---|---:|
| Retail vocabulary | Interactive quiz with instant explanations | 6 |
| Business grammar | Interactive quiz with instant explanations | 6 |
| Professional communication | Scenario quiz with instant explanations | 5 |
| Retail case study | Written response and self-review checklist | Not graded |
| Comprehensive assessment | Mixed interactive quiz | 10 |
| **Total** | **Four scored modules** | **27** |

The case study is deliberately not represented as an automatically graded result. The combined score uses attempted questions from the four scored modules.

The learner profile offers optional level and role settings. These are session-only context fields; they do not establish a formal CEFR level or alter the question bank. The learner's actual level, job responsibilities and priorities still need to be confirmed before individual personalisation.

### Data handling in the new learning path

- Answers and written case-study text remain in page memory only.
- The page does not call an API, submit results, use browser storage or load external scripts/styles.
- Refreshing or closing the page clears the session.
- No student name, email address or employer information is requested by this page.

The legacy Retail foundation page has now been changed on this development branch: it no longer asks the learner to type a name or email, no longer saves identity or written drafts in browser storage, and no longer calls the shared IELTS endpoint. Other legacy student pages remain separate and must not be assumed to inherit these data-handling properties.

## Deployment and preview

The intended source path is:

`lexacademicenglish_multipage/students/retail/learning-path/index.html`

The repository does not contain a `wrangler.toml`, `wrangler.json`, `wrangler.jsonc`, package manifest or checked-in Pages build workflow that independently confirms the Cloudflare Pages output directory. Verify the Cloudflare Pages project settings before testing the route. If the configured output directory is `lexacademicenglish_multipage`, the expected route is `/students/retail/learning-path/`.

For each non-production branch:

1. Wait for Cloudflare Pages to finish the preview deployment.
2. Open the preview hostname with `/students/retail/learning-path/` appended.
3. Confirm the page returns successfully and all styles and controls render.
4. Test the five modules, feedback, Back/Continue, retry, results and reset.
5. Test at a narrow mobile viewport and a desktop viewport.
6. Keep preview access separate from production access.

A preview URL is not authentication. A route that is difficult to guess is not authentication either.

### Printable results report

The results view includes a **Print / Save PDF** action for a learner who wants to keep a copy or bring it to a tutorial.

- It uses the browser's native print dialog; no API call, upload or browser storage is used.
- The print layout shows the results summary, module scores, completion status and report date.
- Written case-study responses are explicitly excluded from the printable report.
- The report contains no student name, email address or employer information.
- The browser's “Save as PDF” option can be used to create a local copy.

## Recommended access control

Use Cloudflare Access as the initial identity gate for the student area.

For the initial pilot, protect the Retail route only, including the exact path and descendants:

`lexacademicenglish.co.uk/students/retail`
`lexacademicenglish.co.uk/students/retail/*`

This covers the learning path and the dedicated POST endpoint at `/students/retail/submit` without automatically restricting existing IELTS and resource pages. The broader `/students/*` scope remains a separate decision for a later rollout. Also test the `www` hostname if it serves content independently.

Protect the Cloudflare Pages preview hostname separately. Enabling Access for a `pages.dev` hostname does not automatically secure the production custom domain.

References:
- [Cloudflare Access application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
- [Cloudflare self-hosted applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Cloudflare Pages Access guidance](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain)

## Submission and student records — not yet ready

Cloudflare Access can gate page access, but it does not create student accounts, teacher-visible progress or per-student data ownership.

The existing `/api/submit-ielts` endpoint is shared by legacy IELTS/Retail flows. Do not apply a blanket authentication requirement to it without first separating the Retail submission route, as doing so may break public IELTS submissions.

Before collecting real student work:

1. Create a dedicated Retail submission endpoint.
2. Verify the Cloudflare Access JWT on the server for that endpoint; do not rely on front-end checks or an unlisted URL.
3. Add request-size limits, validation and rate limiting.
4. Choose a student identity/data backend if cross-device progress or a teacher dashboard is required.
5. Enforce record ownership on the server/database.
6. Store only the minimum necessary information and define retention/deletion rules.
7. Keep API credentials in Cloudflare secrets, never in repository files or browser JavaScript.
8. Test that one student cannot read or modify another student's records.

Do not collect real student submissions until these controls are implemented and tested.

## Retail progress records — implementation staged, Cloudflare configuration outstanding

A dedicated Pages Function is now staged at /students/retail/api/progress. It is separate from the shared public /api/submit-ielts endpoint.

The Retail progress function:

1. Accepts GET, PUT and DELETE only.
2. Verifies the Cloudflare Access JWT signature, issuer, audience, expiry and optional not-before claim.
3. Derives the record key from the verified JWT subject; it does not trust an email or student ID supplied by the browser.
4. Uses a fixed course identifier and allowlisted module IDs.
5. Stores only answer indexes and the case-study self-review flag in a dedicated D1 table.
6. Rejects written case-study text, profile fields, scores, correctness flags and unexpected payload properties.
7. Limits JSON writes to 8 KB and uses prepared D1 statements.
8. Allows an authenticated student to read, update or delete only their own record.
9. Returns no-store responses and fails closed when Access configuration or the D1 binding is missing.

The page offers explicit Load, Save and Delete actions. It does not send progress in the background. The written case-study responses remain local and are never included in the progress payload.

**Important limitations:**

- Cloudflare Access applications, Pages environment variables and D1 bindings have not been configured.
- The D1 migration has not been applied to any database.
- The endpoint has not yet been tested against a real Cloudflare Access application or D1 instance.
- A teacher dashboard and teacher-side record access are not implemented.
- Scores are reconstructed in the browser from answer indexes. They are practice results, not authoritative or tamper-proof grades.
- No automatic retention expiry or rate-limit rule is configured. Agree a retention period and add rate limiting before real student use.

Setup instructions are in [docs/LEX-PRACTICE-RETAIL-PROGRESS-SYNC.md](../../docs/LEX-PRACTICE-RETAIL-PROGRESS-SYNC.md).

The shared /api/submit-ielts endpoint remains unchanged for legacy IELTS forms. Do not apply a blanket Access requirement to that endpoint without first separating and testing its public IELTS use.


## Manual QA checklist

### Navigation and layout

- [ ] `/students/retail/` displays a clear link to the five-module learning path.
- [ ] `/students/retail/learning-path/` loads from the Cloudflare preview.
- [ ] The learning path's brand link returns to the Retail foundation page.
- [ ] Layout works at mobile and desktop widths.
- [ ] Keyboard focus is visible and controls are operable with a keyboard.
- [ ] No console errors occur during a complete learning session.

### Learning interactions

- [ ] Vocabulary contains 6 questions.
- [ ] Business grammar contains 6 questions.
- [ ] Professional communication contains 5 scenarios.
- [ ] Comprehensive assessment contains 10 questions.
- [ ] Every scored question has a valid answer and a non-empty explanation.
- [ ] Selecting an answer shows immediate correct/incorrect feedback and its explanation.
- [ ] Back, Continue, retry and next-module controls work.
- [ ] Module scores and completion status update correctly.
- [ ] Results distinguish attempted questions from unanswered questions.
- [ ] Combined accuracy uses scored quiz questions only.
- [ ] Case-study completion is self-reviewed and is not presented as a numeric mark.
- [ ] Reset clears the current in-memory session.
- [ ] Print / Save PDF opens the browser print dialog and excludes written case-study responses.

### Privacy and access

- [ ] No student personal data is included in repository files or page source.
- [ ] The new learning path makes no automatic network requests and does not persist answers in browser storage.
- [ ] A signed-out visitor is blocked from the chosen protected student route.
- [ ] An authorised student can open the protected route.
- [ ] An unauthorised signed-in account is blocked.
- [ ] Public homepage and any intentionally public resources remain accessible.
- [ ] Apex and `www` hostnames are tested if both serve content.
- [ ] Preview-domain access is tested separately from production.
- [ ] Retail submissions cannot be made without a valid Access JWT and allowlisted email.
- [ ] The score-consent checkbox is required before submission.
- [ ] Written case-study text is excluded unless the learner separately opts in.
- [ ] The Retail form does not save name, email or written drafts in browser storage.
- [ ] A WAF rate-limit rule is active for POST /students/retail/submit before real use.

## Release gate

The five-module page is a learning prototype, not a private student account system. Do not distribute it for real student work until the preview tests and access-control tests pass. Do not merge to `main`, change Cloudflare settings, alter DNS or deploy to production without explicit approval.

## Automated regression check

Run the checks from the repository root:

`node scripts/verify-retail-learning-path.mjs`
`node --test scripts/test-retail-submit.mjs`

The first script checks the five-module structure and question counts, answer-key/explanation integrity, duplicate and unresolved DOM IDs, inline-script syntax, dependency absence, browser-storage/network/unsafe HTML sink absence, accessibility hooks and the local score-only print report. The second creates signed test JWTs and exercises the Pages Function for missing/invalid signatures, incorrect audiences, allowlist rejection, consent handling, HTML escaping, request limits, origin checks and provider failures. GitHub Actions runs both checks for the Retail development branch and matching pull requests.

This static check is not a substitute for manual interaction testing on real mobile and desktop browsers or for Cloudflare Access testing.


## Retail Access configuration runbook

For a detailed manual setup and route-testing checklist, see [docs/LEX-PRACTICE-RETAIL-ACCESS.md](../../docs/LEX-PRACTICE-RETAIL-ACCESS.md). This runbook does not change Cloudflare configuration and is not a substitute for server-side API authentication.
