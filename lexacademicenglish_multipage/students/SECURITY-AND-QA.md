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

### Privacy and access

- [ ] No student personal data is included in repository files or page source.
- [ ] The new learning path makes no network requests and does not persist answers in browser storage.
- [ ] A signed-out visitor is blocked from the chosen protected student route.
- [ ] An authorised student can open the protected route.
- [ ] An unauthorised signed-in account is blocked.
- [ ] Public homepage and any intentionally public resources remain accessible.
- [ ] Apex and `www` hostnames are tested if both serve content.
- [ ] Preview-domain access is tested separately from production.
- [ ] Retail submissions cannot be made without the intended server-side identity check.

## Release gate

The five-module page is a learning prototype, not a private student account system. Do not distribute it for real student work until the preview tests and access-control tests pass. Do not merge to `main`, change Cloudflare settings, alter DNS or deploy to production without explicit approval.

## Automated regression check

Run the dependency-free QA script from the repository root:

`node scripts/verify-retail-learning-path.mjs`

The script checks the five-module structure and question counts, answer-key/explanation integrity, duplicate and unresolved DOM IDs, inline-script syntax (without executing it), external dependency absence, browser-storage/network/unsafe HTML sink absence, and basic accessibility hooks. GitHub Actions runs this check on pull requests that touch the learning path or its test script.

This static check is not a substitute for manual interaction testing on real mobile and desktop browsers or for Cloudflare Access testing.
