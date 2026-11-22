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

Protecting static pages does not make a submission endpoint or another origin private. Before collecting student work or providing teacher-visible results:

- Create a dedicated Retail submission endpoint rather than reusing the public IELTS endpoint.
- Validate the Cloudflare Access JWT server-side, including signature, issuer and the endpoint's audience (AUD); do not trust client-side checks or email text supplied by a form.
- Enforce size limits, validation and rate limits; keep secrets in Cloudflare environment secrets.
- Enforce student record ownership server-side if accounts or stored progress are added.
- Define retention and deletion rules and collect only necessary information.

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
