# Lex Practice Retail pilot — Cloudflare Access setup runbook

**Purpose:** protect the Retail student pilot without accidentally restricting the public homepage or all IELTS/resource pages. This is a manual change guide; no Cloudflare settings have been changed.

## Recommended initial scope

Protect the entire Retail area, including the legacy foundation page and the new five-module path:

- Hostname: lexacademicenglish.co.uk
- Exact path: /students/retail
- Descendant paths: /students/retail/*

Do **not** protect all /students/* for the initial pilot unless you intend to restrict existing IELTS and resource pages as well. Access path wildcards do not cover their parent path, so test both the exact path and trailing-slash/nested paths. If the Access UI cannot express the exact and descendant paths cleanly in one application, create two applications with the same restrictive policy.

## A. Create the production Access applications

1. In Cloudflare, open **Zero Trust → Access → Applications** (label names may vary).
2. Create a **Self-hosted** application for the exact hostname and path /students/retail.
3. Add a second path application for /students/retail/* if needed to cover descendants.
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
| /students/retail (no slash) | Access login/deny | Denied | Allowed |
| /students/retail/ | Access login/deny | Denied | Allowed |
| /students/retail/learning-path/ | Access login/deny | Denied | Allowed |
| /students/retail/learning-path/index.html | Access login/deny | Denied | Allowed |
| /students/ and IELTS/resource paths | Confirm intended existing behaviour | Confirm intended existing behaviour | Confirm intended existing behaviour |
| Preview hostname | Teacher-only | Denied | Denied unless deliberately authorised |

Also test the apex and www hostnames, redirects, browser refreshes, direct deep links, and a second device. Capture the result of the test without recording student work or credentials.

**Release gate:** do not distribute the pilot link until the unauthorised and signed-out tests are denied and the intended identity can access every required route.

## D. Retail submission endpoint and server-side identity

The Retail form now posts to:

`POST https://lexacademicenglish.co.uk/students/retail/submit`

This route is implemented by `functions/students/retail/submit.js`. It is deliberately beneath the protected Retail path so Cloudflare Access can add the `Cf-Access-Jwt-Assertion` header. The legacy public IELTS endpoint `/api/submit-ielts` is not changed.

The Pages Function verifies the JWT signature using the team's Access JWKS and checks:

- `iss` exactly matches the configured team origin;
- `aud` contains the Retail Access application's AUD;
- `exp`, `nbf` and future `iat` constraints;
- the verified `email` claim is in a server-side allowlist.

It ignores any email supplied by the browser. The score is validated server-side, request bodies are limited to 16 KB, the Origin header must match the request origin when present, and learner-provided text is HTML-escaped before being included in the instructor email.

### Pages environment configuration

In **Workers & Pages → lex-academic-english-v2 → Settings → Variables and Secrets**, configure these for the production environment only after the Access application has been tested:

| Variable / secret | Value |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | Your Cloudflare Access team domain, e.g. `https://your-team.cloudflareaccess.com` |
| `RETAIL_ACCESS_AUD` | AUD value shown in the Retail Access application |
| `RETAIL_ALLOWED_EMAILS` | Comma-separated exact email allowlist for the Retail pilot |
| `RESEND_API_KEY` | Resend API key (secret) |
| `INSTRUCTOR_EMAIL` | Tutor mailbox that should receive Retail submissions |

Keep `RETAIL_ACCESS_AUD`, `RETAIL_ALLOWED_EMAILS` and `RESEND_API_KEY` as secrets. Do not put real student emails or credentials in source files, GitHub Actions variables, or a committed example file. The team domain and instructor mailbox may be ordinary Pages variables if preferred.

The endpoint sends the submission to the configured instructor mailbox through Resend. It does not write to Google Sheets and does not create a student database. A score-consent checkbox is required. A separate optional checkbox controls whether the written response is included; without it, the server discards the response even if the browser sends one.

### Rate limiting and operational safeguards

A Cloudflare WAF rate-limiting rule is still required for POST requests to `/students/retail/submit`. This is not configured by the repository and is not included in the endpoint itself. Set a conservative per-IP threshold suitable for a single learner and test that legitimate retries still work. The Access allowlist is an identity gate, not a substitute for rate limiting.

Expected fail-closed responses include:

- `401`: missing or invalid Access JWT;
- `403`: identity is not in the Retail allowlist or the Origin is not same-origin;
- `413`: request exceeds the body limit;
- `503`: Access or delivery configuration is missing/unavailable;
- `502`: Resend does not accept the message.

Do not test the production endpoint with real learner work until the Access application, Pages secrets, instructor mailbox and WAF rate limit have all been configured and verified. Use test identities and synthetic content in the preview first.

### Automated endpoint tests

From the repository root:

`node --test scripts/test-retail-submit.mjs`

The tests create signed JWTs locally and mock the Access JWKS and Resend endpoints. They do not call Cloudflare or send real email.

## E. Rollback

If a policy blocks the homepage, an unrelated student resource, or the intended student:

1. Remove or disable only the newly created Retail path application/policy.
2. Re-test the homepage and existing resource routes.
3. Recreate the policy with corrected path coverage and precedence.
4. Do not change DNS or Pages hosting as a rollback measure.

## Cloudflare documentation

- [Application paths and wildcard behaviour](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
- [Pages known issues: Access on pages.dev and custom domains](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain)
- [Preview deployment access](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
