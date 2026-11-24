# Fex Practice — Security and QA plan

## Current state

The student pages are a prototype and the repository contains multiple staged Retail learning-path changes.

- Static HTML pages do not create student accounts or teacher permissions.
- Browser storage and page memory are not server-side access control or a teacher dashboard.
- Do not enter real student personal data, sensitive work information or confidential employer data into an unapproved preview.
- Cloudflare Access, Pages Functions and D1 require separate configuration and testing; code in a branch does not mean those services are configured.

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

Preview deployments and `pages.dev` hostnames are separate from the production custom domain. Protect and test them separately. Do not assume a production Access application secures previews, or vice versa. Restrict previews to maintainers/testers until student testing is deliberately approved.

## API and data requirements

Access page protection is not a substitute for server-side API authentication.

Before accepting real student submissions or saving progress:
1. Verify the Access JWT signature, exact issuer, expected audience, expiry and not-before where present on every private API request.
2. Derive identity from the verified JWT; never trust identity fields supplied by the browser.
3. Enforce student record ownership server-side and test that one student cannot read or change another student's records.
4. Keep teacher APIs separate and require a server-side teacher allowlist/role check.
5. Add request-size limits, validation, rate limiting and same-origin protections as appropriate.
6. Keep credentials in Cloudflare secrets, not repository files or browser JavaScript.
7. Define consent, data minimisation, retention and deletion before collecting real student work.
8. Do not alter the public IELTS submission endpoint without a separate compatibility review.

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

### Teacher boundary
- [ ] Student identities cannot access the teacher route or teacher APIs.
- [ ] Only approved teacher identities can access teacher routes once implemented.
- [ ] Teacher API authorisation is checked server-side on every request.
- [ ] A client-supplied role, email or student identifier cannot grant access.

### Learning experience
- [ ] All learning modules, navigation, answer feedback, scoring and reset behaviour work.
- [ ] Case-study completion is not represented as an automatically assessed mark.
- [ ] Mobile, desktop, keyboard navigation and error/empty states are tested.

### API and privacy
- [ ] Missing, invalid, expired, wrong-issuer and wrong-audience tokens are rejected.
- [ ] One student cannot read or modify another student's data.
- [ ] Oversized and malformed requests are rejected.
- [ ] Real student data is not used in automated tests or unapproved previews.
- [ ] Secrets are not exposed in source code or browser responses.
- [ ] Retention and deletion rules are documented before real submissions.

## Release gate

Do not distribute student links or collect real student work until the preview route matrix, API identity checks and data-isolation tests pass. Do not merge release changes, alter production Cloudflare settings, change DNS/hosting or deploy to production without explicit approval.
