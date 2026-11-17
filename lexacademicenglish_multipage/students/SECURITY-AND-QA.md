# Lex Practice — Security and QA plan

## Current state

The student pages and shared submission endpoint are present in the repository's `main` branch. The application is still a prototype:

- There is no application-level login or server-side per-student authorisation.
- Quiz progress and the Retail case-study response are stored in browser `localStorage` only; they do not synchronise between devices.
- The Retail results form is a manual submission step. It sends a learner-reported progress summary to `/api/submit-ielts`; the case-study response is excluded unless the learner explicitly selects the consent checkbox.
- The shared endpoint forwards submitted details to the configured Google Sheets webhook and Resend email service. Do not describe this as automatic tracking or independently verified scoring.
- Browser storage is not a teacher dashboard and is not an access-control mechanism.
- The changes in this feature branch harden request validation and email rendering, but do not create authentication. They are not live until merged and deployed.
- Do not enter real student personal data, sensitive work information, or confidential employer data until Access protection and the tests below are in place.

## Submission endpoint safeguards in this branch

The proposed `functions/api/submit-ielts.js` changes:

- Require JSON and cap request bodies at 64 KiB.
- Validate required text fields, email addresses and field lengths.
- Limit the plain-text details field to 20,000 characters.
- Ignore client-supplied `detailsHtml`; escape plain text before rendering email HTML.
- Prefix formula-leading text before forwarding it to the Google Sheets webhook.
- Return generic errors to the browser and check the HTTP status of all three upstream services.

These controls reduce malformed requests and HTML injection risk. **They do not authenticate the caller or prevent automated abuse by themselves.** The current `main` branch still has the earlier endpoint implementation until this branch is reviewed and merged.

## Required Cloudflare Access coverage

Protect both of these paths with the same narrowly scoped student allow policy:

1. The student pages: `https://lexacademicenglish.co.uk/students/*`
2. The submission API: `https://lexacademicenglish.co.uk/api/submit-ielts`

Protecting only `/students/*` does not automatically protect the separate `/api/submit-ielts` endpoint. Add the exact API path as its own Self-hosted Access application (or an equivalent more-specific application rule) and test the POST request while signed in and signed out.

Also:

- Configure and test the equivalent paths on `www.lexacademicenglish.co.uk` if it serves content independently rather than redirecting to the apex domain.
- Protect the Cloudflare Pages preview hostname separately while testing.
- Add a Cloudflare rate-limiting rule for POST requests to `/api/submit-ielts` (for example, begin with a low per-IP threshold and tune it for legitimate retries).
- Keep the allow policy restricted to the intended student identity or identity group. Do not use an unlisted URL as a substitute.

## Recommended Cloudflare Access setup

Use Cloudflare Access as the first access gate for the static student area. It is preferable to an unlisted URL because Access checks identity against an allow policy.

### Production custom domain

1. In Cloudflare Zero Trust, open **Access controls → Applications** and create a **Self-hosted** application.
2. Select the custom hostname `lexacademicenglish.co.uk` and set the application path to `/students/*`. Create a separate Self-hosted application for the exact path `/api/submit-ielts` using the same allow policy.
3. Create an **Allow** policy for only the specific student email address or a tightly controlled identity-provider group. Leave all other visitors denied.
4. Test both `https://lexacademicenglish.co.uk/students/` and `https://lexacademicenglish.co.uk/students/retail/` while signed out and while signed in as an authorised user.
5. If the no-trailing-slash route `/students` is reachable separately, add and test an exact path rule for it as well.
6. If `www.lexacademicenglish.co.uk` serves the site independently rather than redirecting to the apex domain, configure and test the corresponding Access application for that hostname too.

Cloudflare documents path-specific Access applications and more-specific policy precedence in [Application paths](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/). Its [self-hosted application guide](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/) explains identity providers and allow policies.

### Cloudflare Pages preview domains

Keep preview testing separate from production access. Cloudflare Pages has a project-level **Enable access policy** setting for protecting the `pages.dev` domain and preview deployments. If you enable it, review the generated policies and confirm that the custom production hostname also has its own Access application; Cloudflare documents this as a required separate step for custom domains.

See [Cloudflare Pages known issues — Enable Access on your pages.dev domain](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain).

Do not enable a project-wide policy without checking its effect on the public website's `pages.dev` hostname and preview workflow.

## Student-specific records — next phase

Cloudflare Access can restrict who opens the pages, but it does not by itself provide a student database or per-student score ownership.

Before teacher-visible progress or individual student accounts are introduced:

1. Select an authentication and data backend (for example, Supabase Auth with row-level security, or a Cloudflare-native Workers/D1 design).
2. Assign each authenticated student a stable user ID.
3. Enforce record ownership on the server/database, not with JavaScript checks or a hidden URL.
4. Store only the minimum necessary learner information.
5. Keep API secrets in platform secrets, never in repository files or browser JavaScript.
6. Test that one student cannot read or modify another student's work.
7. Define how long submissions are retained and how they can be corrected or deleted.

Do not connect a database or collect real student submissions until the data model, access rules and retention approach have been reviewed.

## Manual QA checklist

### Navigation and layout

- [ ] `/students/` loads and links to the Retail Business English programme.
- [ ] `/students/retail/` loads and the hub link returns to `/students/`.
- [ ] Layout remains usable on a narrow mobile screen and a desktop screen.
- [ ] Keyboard focus is visible and module controls are operable.

### Learning interactions

- [ ] Vocabulary contains 10 questions.
- [ ] Business grammar contains 8 questions.
- [ ] Professional communication contains 5 scenarios.
- [ ] Final assessment contains 10 questions.
- [ ] Each question accepts one answer and then shows correct/incorrect feedback and an explanation.
- [ ] Continue, Back, retry and next-module controls work.
- [ ] Module percentages and completion status update correctly.
- [ ] Results & completion displays module status and the combined score for completed scored quizzes.
- [ ] Case-study response can be saved locally, model response can be shown, and completion can be marked.
- [ ] Case-study completion is not presented as an automatically assessed mark.

### Privacy and access

- [ ] A signed-out visitor is blocked from `/students/` and `/students/retail/`.
- [ ] A signed-out POST to `/api/submit-ielts` is blocked by Access.
- [ ] An explicitly authorised student can open both routes.
- [ ] An unauthorised signed-in account is blocked.
- [ ] Public homepage and unrelated public pages remain accessible.
- [ ] Both apex and `www` hostnames are tested if both serve content.
- [ ] Preview-domain access is tested separately from production.
- [ ] No real student personal data appears in repository files, page source, URLs, or unnecessary browser storage.
- [ ] The Retail submission includes only Retail programme data, not unrelated localStorage entries.
- [ ] The case-study response is omitted unless the learner explicitly opts in.
- [ ] Client-supplied HTML is ignored and plain-text submissions are escaped in email output.
- [ ] Spreadsheet-bound text beginning with formula characters is stored as text, not evaluated as a formula.
- [ ] Oversized, malformed and invalid-email requests are rejected before upstream services are called.
- [ ] Rate limiting is enabled for POST requests to the submission endpoint.

## Release gate

Do not distribute the student route until the access tests pass. Do not merge additional changes into `main` or change Cloudflare production settings without explicit approval.
