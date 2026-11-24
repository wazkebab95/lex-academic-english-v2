# Lex Practice Retail pilot — Cloudflare Access setup runbook

**Purpose:** document the Cloudflare Access boundary for the full Fex Practice student area and the protected Retail submission endpoint, while keeping the public homepage and non-student routes public. This is a manual change guide; no Cloudflare settings have been changed.

## Agreed production scope

Protect the **entire `/students/` area**, including IELTS, Retail, learning paths and student resources:

- Hostname: `lexacademicenglish.co.uk`
- Exact parent path: `/students`
- Descendant paths: `/students/*`

Do not protect the public homepage or routes outside `/students/`. Access path wildcards may not cover the exact parent route, so test `/students`, `/students/` and nested paths independently. If the Access UI cannot express the exact and descendant paths cleanly in one application, create two applications with the same restrictive student policy.

The future teacher workspace will use a more-specific teacher-only application for `/students/teacher` and `/students/teacher/*`, with server-side teacher authorisation.

## A. Create the production Access applications

1. In Cloudflare, open **Zero Trust → Access → Applications** (label names may vary).
2. Create a **Self-hosted** application for the exact hostname and path /students/retail.
3. Add a second path application for /students/* if needed to cover descendants.
4. Set an **Allow** policy that includes only the intended student's verified email address (or a tightly managed identity group).
5. Use a suitable identity provider, such as email OTP or an already configured Google/Microsoft identity. If available, require MFA for that identity.
6. Do not add a **Bypass** or public policy. Ensure unmatched visitors are denied.
7. Set a conservative session duration, then save. Review policy precedence and application paths.
8. If www.lexacademicenglish.co.uk serves the website independently, repeat the protection for the same paths on that hostname. If www only redirects to the apex, test the redirect and resulting Access flow rather than assuming it is covered.

## B. Protect preview deployments separately

Preview URLs and pages.dev hostnames are separate from the custom-domain application.

1. In **Workers & Pages → lex-academic-english-v2 → Settings → General**, review and enable the Pages **preview deployment access policy**.
2. Review the generated Access application/policy and restrict it to your own teacher/maintainer identities for previews. Do not invite the student to previews by default.
3. Follow Cloudflare's current documented steps if you also need to protect the project's main pages.dev hostname; enabling preview access alone does not automatically protect that hostname or the custom domain.
4. Keep preview access and the custom-domain student policy separate. Never treat a preview URL as private because it is unlisted.

## C. Test before distributing the route

Use a clean browser/private window and test the matrix below. Do not use real learner submissions during this stage.

| URL | Signed out | Unauthorised account | Intended student |
|---|---|---|---|
| https://lexacademicenglish.co.uk/ | Public homepage loads | Public homepage loads | Public homepage loads |
| /students (no slash) | Access login/deny | Denied | Allowed |
| /students/ | Access login/deny | Denied | Allowed |
| /students/retail/ | Access login/deny | Denied | Allowed |
| /students/retail/learning-path/ | Access login/deny | Denied | Allowed |
| /students/retail/submit | Access login/deny | Denied | Allowed only with a valid Access session |
| IELTS and other student resources | Access login/deny | Denied | Allowed |
| Preview hostname | Teacher-only | Denied | Denied unless deliberately authorised |

Also test the apex and www hostnames, redirects, browser refreshes, direct deep links, and a second device. Capture the result of the test without recording student work or credentials.

**Release gate:** do not distribute the pilot link until the unauthorised and signed-out tests are denied and the intended identity can access every required route.

## D. Retail submission endpoint and server-side identity

Protecting a page is not a substitute for authenticating its API. The Retail foundation form posts to:

`POST /students/retail/submit`

The Pages Function is implemented in `functions/students/retail/submit.js`. It verifies the Cloudflare Access JWT signature against the team's JWKS and checks the exact issuer, the configured Access application audience, expiry, not-before and issued-at claims. It derives the learner email from the verified token and checks it against the server-side `RETAIL_ALLOWED_EMAILS` allowlist. Browser-supplied identity fields are not trusted.

The endpoint requires explicit consent to submit the score, includes written work only when the learner separately opts in, validates the four-item score, limits request bodies to 16 KB, checks the Origin header when present and HTML-escapes learner-provided text. It sends the submission to the configured instructor mailbox through Resend. It does not write to Google Sheets or create a student database.

### Pages environment variables and secrets

Configure these in **Workers & Pages → lex-academic-english-v2 → Settings → Variables and Secrets** for the intended environment:

| Variable / secret | Purpose |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | Cloudflare Access team origin, e.g. `https://your-team.cloudflareaccess.com` |
| `RETAIL_ACCESS_AUD` | Audience value for the Access application protecting the student area |
| `RETAIL_ALLOWED_EMAILS` | Comma-separated exact email allowlist for the Retail pilot |
| `RESEND_API_KEY` | Resend API key; store as a secret |
| `INSTRUCTOR_EMAIL` | Tutor mailbox that receives submissions |

Keep the audience, allowlist and Resend API key as secrets. Never commit real student addresses, credentials or API keys. Confirm that the Access application covering `/students/` supplies the audience configured in `RETAIL_ACCESS_AUD`.

A Cloudflare WAF rate-limiting rule is still required for POST requests to `/students/retail/submit`. The endpoint does not configure this rule itself. Use a conservative threshold and test legitimate retries.

Run automated tests with `node --test scripts/test-retail-submit.mjs`. They generate signed test JWTs locally and mock the JWKS and Resend services; they do not contact Cloudflare or send real email.

Do not submit real learner work until the Access policy, Pages variables/secrets, instructor mailbox and WAF rate limit have been configured and verified in a restricted preview. The public IELTS endpoint `/api/submit-ielts` remains separate and unchanged.

## E. Rollback

If a policy blocks the homepage, an unrelated student resource, or the intended student:

1. Adjust or disable only the student-area Access application/policy that caused the issue.
2. Re-test the public homepage and the intended student routes.
3. Recreate the policy with corrected path coverage and precedence.
4. Do not change DNS or Pages hosting as a rollback measure.

## Cloudflare documentation

- [Application paths and wildcard behaviour](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
- [Pages known issues: Access on pages.dev and custom domains](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain)
- [Preview deployment access](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
