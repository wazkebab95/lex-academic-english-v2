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

## D. Access is not API authentication

Protecting static pages does not by itself authenticate an API request. The staged Retail progress route is:

- Page: /students/retail/learning-path/
- API: /students/retail/api/progress
- Pages Function: functions/students/retail/api/progress.js

The API verifies the Cloudflare Access JWT signature, issuer, audience, expiry and optional not-before claim on the server. It derives the record owner from the verified token subject, not from request JSON. The Access application for /students/retail/* must cover this nested API path, and the exact parent /students/retail must also be protected.

The API stores only answer indexes and the case-study self-review flag in a dedicated D1 table. It does not accept written responses, names, email addresses, employer information, profile selections or client-supplied scores. The learner can load, save or delete their own record. A teacher dashboard is not yet implemented.

Before enabling real student progress storage:

- Configure the dedicated D1 binding named RETAIL_PROGRESS_DB.
- Set ACCESS_TEAM_DOMAIN and ACCESS_AUD for the exact preview or production Access application.
- Apply migrations/0001_retail_student_progress.sql to the dedicated database.
- Add a Cloudflare rate-limit rule for the progress route.
- Define retention and deletion policy; the first version has no automatic expiry.
- Test signed-out, unauthorised, authorised and second-student isolation cases against the actual Cloudflare deployment.

See docs/LEX-PRACTICE-RETAIL-PROGRESS-SYNC.md for the setup sequence. No Access application, D1 database, binding or environment variable has been configured by this code change.

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
