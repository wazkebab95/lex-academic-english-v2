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

- Quiz answers and written case-study drafts remain in page memory until the learner leaves or resets the page.
- The page has optional account progress controls. No progress is sent automatically; the learner must choose Load, Save or Delete.
- The only network destination is the same-origin Retail progress endpoint under /students/retail/api/progress.
- The progress payload contains selected answer indexes and the case-study self-review flag only.
- Written case-study responses, profile settings, student name, email address, employer and job title are not sent or stored by this feature.
- The server derives the record owner from a verified Cloudflare Access JWT and stores the row in a dedicated D1 binding.
- If Access verification or D1 is not configured, the endpoint fails closed. The page-session work remains local.
- Refreshing or closing the page clears unsaved work. Saved account progress remains until the learner deletes it or the agreed retention process removes it.

The existing Retail foundation page and other legacy student pages remain separate. They have their own form and browser-storage behaviour and must not be assumed to inherit the new page's data-handling properties.

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

For the stated goal of a private `/students/` area, the natural scope is a self-hosted Access application covering:

`lexacademicenglish.co.uk/students/*`

Create a restrictive Allow policy for the intended student identity and leave all other visitors denied. Also test the no-trailing-slash route `/students` and the `www` hostname if it serves content independently.

**Scope decision required before configuration:** protecting `/students/*` also protects existing IELTS and resource pages beneath that path. If those pages must remain public, use a narrower application such as `/students/retail/*` instead. Do not configure either scope until the intended access boundary is confirmed.

Protect the Cloudflare Pages preview hostname separately. Enabling Access for a `pages.dev` hostname does not automatically secure the production custom domain.

References:
- [Cloudflare Access application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
- [Cloudflare self-hosted applications](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/)
- [Cloudflare Pages Access guidance](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain)

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
- [ ] The learning path makes no request until the learner explicitly selects Load, Save or Delete.
- [ ] Progress sync calls only the same-origin Retail endpoint and sends answer indexes plus the case-study review flag; it never sends written responses or profile/personal details.
- [ ] The API rejects requests without a valid Access JWT and scopes records to the verified subject.
- [ ] A signed-out visitor is blocked from the chosen protected student route.
- [ ] An authorised student can open the protected route.
- [ ] An unauthorised signed-in account is blocked.
- [ ] Public homepage and any intentionally public resources remain accessible.
- [ ] Apex and `www` hostnames are tested if both serve content.
- [ ] Preview-domain access is tested separately from production.
- [ ] Retail submissions cannot be made without the intended server-side identity check.

## Release gate

The five-module page is a learning prototype, not a private student account system. Do not distribute it for real student work until the preview tests and access-control tests pass. Do not merge to `main`, change Cloudflare settings, alter DNS or deploy to production without explicit approval.

## Automated regression checks

Run both dependency-free checks from the repository root:

- node scripts/verify-retail-learning-path.mjs
- node scripts/verify-retail-progress-api.mjs

The learning-path script checks the five-module structure, question counts, answer/explanation integrity, duplicate and unresolved DOM IDs, inline-script syntax, dependency boundaries, accessibility hooks, print layout and the explicit same-origin progress-sync payload.

The progress API script imports the Pages Function as an ES module, generates temporary RSA keys, mocks the Cloudflare Access JWKS endpoint and uses a mock D1 binding. It checks missing/invalid/expired tokens, audience and signature validation, subject isolation, GET/PUT/DELETE, payload allowlisting, body limits, content type, missing configuration and JWKS failures.

These tests do not connect to a real Cloudflare account or database. They are not substitutes for preview browser tests, real Access identity tests, D1 binding tests, or rate-limit verification.

## Retail Access and progress-sync runbooks

- [Cloudflare Access setup](../../docs/LEX-PRACTICE-RETAIL-ACCESS.md)
- [Retail progress sync and D1 setup](../../docs/LEX-PRACTICE-RETAIL-PROGRESS-SYNC.md)

No Cloudflare configuration, DNS, hosting, production deployment or student data was changed as part of this staged implementation.
