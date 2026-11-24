# Fex Practice — full student-area Cloudflare Access runbook

**Status:** implementation guide only. No Cloudflare settings, DNS, hosting, database or production deployment have been changed.

## 1. Intended access boundary

The agreed requirement is to protect the entire student area, not only the Retail pilot.

Production hostname:
- `lexacademicenglish.co.uk`
- Also cover `www.lexacademicenglish.co.uk` if it serves the site independently rather than redirecting to the apex hostname.

Required path coverage:
- Exact parent route: `/students`
- Student-area descendants: `/students/*`

Do not assume the wildcard covers the exact parent path. Configure and test both. Confirm Cloudflare's path matching in the current dashboard before saving. If the dashboard requires separate applications for exact and descendant paths, create both with the same student access policy.

This scope intentionally makes existing IELTS, Retail and other resources underneath `/students/` private too. The public homepage and pages outside `/students/` must remain public.

## 2. Identity and policy model

### Students
- Use a supported identity provider (for example, email one-time PIN or an already configured Google/Microsoft identity).
- Allow only explicitly approved student identities or a tightly managed student group.
- Do not use a broad email-domain rule unless every account in that domain is intended to have access.
- Do not create a Bypass policy for the student area.
- Unmatched and unauthorised visitors must be denied.
- Choose a reasonable session duration and review policy precedence.

### Teachers and administrators
- Student access is not teacher authorisation.
- Reserve a separate teacher route namespace, proposed as `/students/teacher` and `/students/teacher/*`, if the dashboard is implemented there.
- When that route exists, create a more-specific teacher Access application/policy for the exact teacher route and descendants, allowing only approved teacher identities. Test precedence against the broader student application.
- Verify teacher authority again on every teacher API request on the server. A valid Access login alone proves identity, not permission to view student records.
- Never accept a browser-supplied role, `isTeacher`, email or student ID as proof of authority.
- Keep teacher and student API audiences/authorisation checks distinct. A student identity must never gain teacher access.

Do not create a teacher application before its route and identity list are ready. The route reservation is a design requirement, not an existing dashboard.

## 3. Production setup — do this only after preview tests

1. Open Cloudflare Zero Trust → Access → Applications.
2. Create a Self-hosted application for `lexacademicenglish.co.uk/students` (exact path).
3. Create a second Self-hosted application for `lexacademicenglish.co.uk/students/*` if needed for descendant coverage.
4. Attach the restrictive student Allow policy to both applications.
5. Confirm there is no Bypass or public policy and that unmatched visitors are denied.
6. If `www.lexacademicenglish.co.uk` serves content independently, repeat the required path coverage on that hostname. If it redirects to the apex, test the redirect and resulting Access flow.
7. Review application precedence, identity provider configuration, session duration and policy membership.
8. Save only after confirming the exact hostnames and paths. Do not change DNS or the Pages build/output directory as part of this setup.

Cloudflare's path matching and wildcard behaviour can change; consult its current [Application paths documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/) while configuring.

## 4. Preview protection is separate

Cloudflare Pages preview URLs and `pages.dev` hostnames are separate from the production custom domain.

1. Identify the active Pages project and its preview deployment hostname.
2. Configure preview access separately, restricting it to maintainers/testers by default.
3. Do not assume protecting the custom domain protects `pages.dev`, or that the preview policy protects production.
4. Do not distribute a preview URL to students until its access policy has been tested.
5. Keep preview and production identity policies distinct.

See Cloudflare's [Pages preview deployment documentation](https://developers.cloudflare.com/pages/configuration/preview-deployments/) and [Pages Access guidance](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain).

## 5. Required route test matrix

Run these tests in a clean/private browser session and with separate test identities. Use synthetic accounts only.

| Route | Signed out | Signed in, not approved | Approved student |
|---|---|---|---|
| `/` | Public | Public | Public |
| `/students` | Blocked | Blocked | Allowed |
| `/students/` | Blocked | Blocked | Allowed |
| `/students/retail/` | Blocked | Blocked | Allowed |
| `/students/retail/learning-path/` | Blocked | Blocked | Allowed |
| Existing IELTS pages under `/students/` | Blocked | Blocked | Allowed |
| Other student resources under `/students/` | Blocked | Blocked | Allowed |
| Pages outside `/students/` | Preserve current public behaviour | Preserve current public behaviour | Preserve current public behaviour |
| Teacher route (once implemented) | Blocked | Blocked | Student must be blocked; approved teacher only |

Repeat relevant route tests on apex and `www` hostnames. Test direct deep links, refresh, trailing-slash and no-trailing-slash variants, redirects and a second device. Confirm public homepage behaviour is unchanged.

**Release gate:** do not share student links until signed-out and unapproved users are blocked on every student route and approved test students can reach the intended routes.

## 6. Access does not replace API security

Cloudflare Access protects the route at the edge. Pages Functions and other APIs must still verify the Access JWT server-side for every private operation.

- Validate signature, exact issuer, expected audience, expiry and not-before where present.
- Derive the student identity from the verified token, never from a form field.
- Enforce per-student record ownership in the database/API.
- Use separate teacher authorisation on every teacher API route.
- Apply request-size limits, input validation, rate limiting and same-origin protections as appropriate.
- Keep Resend, database and other credentials in Cloudflare secrets, never in browser code or repository files.
- Return private data with appropriate no-store caching.
- Define collection purpose, consent, retention and deletion before real student work is collected.

Do not put the public IELTS submission endpoint behind assumptions intended for the new private student APIs. Review legacy IELTS submission behaviour separately before changing it.

## 7. Rollback

If the new Access policy blocks the public homepage, an unrelated route, or an intended test student:

1. Disable only the newly created student-area Access application/policy.
2. Re-test the public homepage and existing routes.
3. Correct path coverage or policy precedence.
4. Re-run the complete route matrix before enabling it again.

Do not change DNS, Pages hosting or the output directory as a workaround for an Access policy issue.

## 8. Production approval gate

This document does not authorise a production change. Before production configuration, confirm:
- The preview route matrix passes.
- The student allowlist and identity provider are ready.
- Apex and `www` behaviour is understood.
- Existing IELTS/resource pages are intentionally included in the private area.
- Teacher route precedence is documented for the later dashboard.
- API JWT validation and data ownership have been tested before accepting real submissions.

Obtain explicit approval before applying production Access settings, changing DNS/hosting, merging release PRs or collecting real student data.
