# Lex Practice — Security and QA plan

## Current state

The initial student pages are in the repository's `main` branch. The application is still a prototype:

- There is no login or server-side authorisation in the HTML application.
- Progress and the case-study response are stored in browser `localStorage` only.
- A browser's local storage is not a teacher dashboard, not cross-device storage, and not an access-control mechanism.
- Do not enter or store real student personal data, sensitive work information, or confidential employer data.

## Recommended Cloudflare Access setup

Use Cloudflare Access as the first access gate for the static student area. It is preferable to an unlisted URL because Access checks identity against an allow policy.

### Production custom domain

1. In Cloudflare Zero Trust, open **Access controls → Applications** and create a **Self-hosted** application.
2. Select the custom hostname `lexacademicenglish.co.uk` and set the application path to `/students/*`.
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
- [ ] An explicitly authorised student can open both routes.
- [ ] An unauthorised signed-in account is blocked.
- [ ] Public homepage and unrelated public pages remain accessible.
- [ ] Both apex and `www` hostnames are tested if both serve content.
- [ ] Preview-domain access is tested separately from production.
- [ ] No real student personal data appears in repository files, page source, URLs, or browser storage.

## Release gate

Do not distribute the student route until the access tests pass. Do not merge additional changes into `main` or change Cloudflare production settings without explicit approval.


## Five-module learning path — additional privacy boundary

The preview-only /students/retail/learning-path/ page is deliberately session-only:
- No learner name, email address or employer information is requested.
- Quiz answers and written case-study responses remain in JavaScript memory while the page is open.
- No browser local storage, session storage, cookies, submission endpoint or external database is used by this page.
- Refreshing or closing the page clears answers. Learners must copy any written work they want to keep.
- The profile selectors are optional and session-only. They do not personalise the question bank yet.

This does not secure the existing /students/ routes or legacy submission endpoints. Cloudflare Access and server-side identity checks remain release requirements before the student area is shared.


## Repository privacy finding requiring owner action

The current main branch contains an accidentally nested duplicate Retail workbook with a learner's first name in its page content. The five-module feature branch removes that duplicate from its current file tree, but this does not erase the file from main or from Git commit history. Do not treat this branch change as a complete privacy purge. Removing the content from public history would require an owner-approved history rewrite and force-push, followed by cache and access review. No such operation has been performed.

The existing root-level submission function and the separately nested functions/functions/api/submit-homework.js also require deployment-root and authentication review. Do not use either endpoint for confidential learner submissions until the actual Cloudflare Pages project root, route mapping, input handling and server-side identity checks have been verified.
