# Fex Practice — Security and QA plan

## Current state

The Retail programme includes a standalone five-module learning path at:

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

The case study is deliberately not represented as an automatically graded result. Combined accuracy uses attempted questions from the four scored modules only.

The learner profile offers optional level and role settings. These are session-only context fields; they do not establish a formal CEFR level or alter the question bank. The learner's actual level, job responsibilities and priorities still need to be confirmed before individual personalisation.

### Data handling in the new learning path

- Answers, profile settings and written case-study text remain in page memory only.
- The page does not call an API, submit results or use browser storage.
- The page does not load external scripts or styles.
- Refreshing or closing the page clears the session.
- No student name, email address or employer information is requested by this page.

The Retail foundation assessment is a separate submission flow. It does not store learner identity or written drafts in browser storage. It sends the four-item score to a Retail-specific Pages Function; the learner must consent to score submission and separately opt in before written work is included. The server derives identity from the verified Cloudflare Access JWT and sends the submission only to the configured instructor mailbox. It does not create a student database.

Static HTML pages do not create student accounts or teacher permissions. Browser storage and page memory are not server-side access control or a teacher dashboard.

Do not enter real student personal data, sensitive work information or confidential employer data into an unapproved preview.

## Agreed access boundary

The intended production access boundary is the **entire `/students/` area**, including existing IELTS, Retail and other student resources.

Protect both:
- Exact parent route: `/students`
- Descendant routes: `/students/*`

Do not assume the wildcard includes the exact parent path. Test both forms, with and without trailing slashes. Apply equivalent coverage to `www.lexacademicenglish.co.uk` if it serves content independently; otherwise test its redirect to the apex hostname.

The public homepage and routes outside `/students/` must retain their current public behaviour.

The implementation guide is [Fex Practice — full student-area Cloudflare Access runbook](../../docs/FEX-PRACTICE-STUDENT-ACCESS.md).

## Identity and role separation

### Student access

- Use an approved identity provider and an explicit student allowlist or tightly managed group.
- Do not use broad domain-wide access unless every identity in that domain is intended to be a student.
- No Bypass/public policy for student routes; unmatched visitors must be denied.
- Keep preview access separate from production access.

### Teacher access

- Reserve `/students/teacher` and `/students/teacher/*` for a future teacher workspace.
- When implemented, protect those exact and descendant paths with a more-specific teacher Access application and a teacher-only identity policy.
- Verify teacher authority server-side for every teacher API request. Access authentication proves identity, not teaching authority.
- A student identity must never gain teacher permissions. Never trust browser-supplied role, email, `isTeacher` or learner identifiers.
- Test Access application precedence where the teacher path overlaps the broader student-area policy.

The teacher dashboard design contract is documented separately. The teacher UI, APIs, enrolment model and feedback workflow must be implemented and tested before the dashboard is used.

## Cloudflare Pages preview

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

Preview deployments and `pages.dev` hostnames are separate from the production custom domain. Protect and test them separately. Do not assume a production Access application secures previews, or vice versa. Restrict previews to maintainers/testers until student testing is deliberately approved.

A preview URL is not authentication. A route that is difficult to guess is not authentication either.

## API and data requirements

Access page protection is not a substitute for server-side API authentication. The Retail foundation submission endpoint is implemented at `POST /students/retail/submit`; it is separate from the public IELTS endpoint.

Before accepting real student submissions or saving progress:

1. Verify the Access JWT signature, exact issuer, expected audience, expiry and not-before where present on every private API request.
2. Derive identity from the verified JWT; never trust identity fields supplied by the browser.
3. Enforce student record ownership server-side and test that one student cannot read or change another student's records.
4. Keep teacher APIs separate and require a server-side teacher allowlist/role check.
5. Add request-size limits, validation, rate limiting and same-origin protections as appropriate.
6. Keep credentials in Cloudflare secrets, not repository files or browser JavaScript.
7. Define consent, data minimisation, retention and deletion before collecting real student work.
8. Do not alter the public IELTS submission endpoint without a separate compatibility review.

Cloudflare Access, Pages Functions and D1 require separate configuration and testing; code in a branch does not mean those services are configured.

## Manual QA checklist

### Public and student route access

- [ ] Public homepage remains accessible while signed out.
- [ ] `/students` is blocked when signed out and allowed for an approved student.
- [ ] `/students/` is blocked when signed out and allowed for an approved student.
- [ ] All nested student routes, including IELTS, Retail and other resources, are blocked when signed out.
- [ ] An authenticated but unapproved identity is blocked from all student routes.
- [ ] Approved students can open intended student routes through direct links and page refreshes.
- [ ] Apex and `www` hostnames are tested if both serve content.
- [ ] Routes outside `/students/` preserve their intended public behaviour.
- [ ] Preview and production hostnames have separate, tested policies.

### Learning experience

- [ ] `/students/retail/` displays a clear link to the five-module learning path.
- [ ] `/students/retail/learning-path/` loads from the Cloudflare preview.
- [ ] The learning path's brand link returns to the Retail foundation page.
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
- [ ] Layout works at mobile and desktop widths.
- [ ] Keyboard focus is visible and controls are operable with a keyboard.
- [ ] No console errors occur during a complete learning session.

### Teacher boundary

- [ ] Student identities cannot access the teacher route or teacher APIs.
- [ ] Only approved teacher identities can access teacher routes once implemented.
- [ ] Teacher API authorisation is checked server-side on every request.
- [ ] A client-supplied role, email or student identifier cannot grant access.

### API and privacy

- [ ] The Retail endpoint rejects missing, invalid, expired, malformed temporal, wrong-issuer and wrong-audience tokens.
- [ ] The Retail endpoint derives learner identity from the signed Access JWT and rejects identities outside its server-side allowlist.
- [ ] Score consent is required and written work is omitted unless separately authorised by the learner.
- [ ] The Retail endpoint reports success only after the instructor email provider accepts the message.
- [ ] The public IELTS submission endpoint remains unchanged.
- [ ] One student cannot read or modify another student's data.
- [ ] Oversized and malformed requests are rejected.
- [ ] Real student data is not used in automated tests or unapproved previews.
- [ ] Secrets are not exposed in source code or browser responses.
- [ ] Retention and deletion rules are documented before real submissions.

## Release gate

Do not distribute student links or collect real student work until the preview route matrix, API identity checks and data-isolation tests pass. Do not merge release changes, alter production Cloudflare settings, change DNS/hosting or deploy to production without explicit approval.

## Automated regression check

Run the dependency-free QA script from the repository root:

`node scripts/verify-retail-learning-path.mjs`

The script checks the five-module structure and question counts, answer-key/explanation integrity, duplicate and unresolved DOM IDs, inline-script syntax (without executing it), external dependency absence, browser-storage/network/unsafe HTML sink absence, and basic accessibility hooks.

GitHub Actions runs this check on pull requests that touch the learning path or its test script.

This static check is not a substitute for manual interaction testing on real mobile and desktop browsers or for Cloudflare Access testing.


## Printable results report

The results view includes a **Print / Save PDF** action for a learner who wants to keep a copy or bring it to a tutorial.

- It uses the browser's native print dialog; no API call, upload or browser storage is used.
- The print layout shows the results summary, module scores, completion status and report date.
- Written case-study responses are explicitly excluded from the printable report.
- The report contains no student name, email address or employer information.
- The browser's “Save as PDF” option can be used to create a local copy.

## Retail Access configuration runbook

For the detailed student-area Access setup, Retail endpoint configuration and route-testing checklist, see [docs/LEX-PRACTICE-RETAIL-ACCESS.md](../../docs/LEX-PRACTICE-RETAIL-ACCESS.md). This runbook does not change Cloudflare configuration and is not a substitute for server-side API authentication.
