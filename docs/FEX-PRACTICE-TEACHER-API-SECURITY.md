# Fex Practice — teacher data API security

**Status:** development implementation and configuration checklist. No production Cloudflare settings or deployments are changed by this document.

## Why this is required

The teacher dashboard calls `GET /api/teacher-data`. The previous function accepted the Access email header as optional and fell back to a configured/default instructor address. That meant the function itself did not establish teacher authorisation before fetching and returning student records.

The hardened function now verifies the Cloudflare Access JWT server-side before contacting the Google Apps Script webhook. It checks the RS256 signature against the team's published JWKS, exact issuer, a dedicated teacher audience, expiry/not-before/issued-at claims, and an explicit teacher email allowlist. A present Access email header must agree with the verified JWT. The endpoint fails closed when configuration is missing and returns generic upstream errors.

## Required Cloudflare configuration (approval required)

Configure these values in the intended Pages environment only after the preview tests pass:

| Variable | Purpose |
|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | Access team domain (hostname or HTTPS origin) |
| `TEACHER_ACCESS_AUD` | Audience tag for the dedicated teacher Access application |
| `TEACHER_ALLOWED_EMAILS` | Comma-separated exact teacher email allowlist |
| `GOOGLE_SHEET_WEBHOOK_URL` | Existing Apps Script Web App URL; store as a Secret |

Do not reuse the student/Retail audience. Keep the teacher audience distinct from student audiences. Do not commit actual email addresses or secret values.

## Access application coverage

The Access application must cover both:
- `www.lexacademicenglish.co.uk/teacher/*` (and the exact `/teacher` route if it is served separately)
- `www.lexacademicenglish.co.uk/api/teacher-data`

Apply a teacher-only Allow policy to both. Verify apex and `www` hostnames and any Pages preview hostname separately. Protecting the HTML dashboard does not automatically protect its API. An unlisted API URL is not access control.

## Local verification

Run:

```sh
node --test scripts/test-teacher-data-auth.mjs
```

The tests generate synthetic Access JWTs, mock the JWKS endpoint and Google Apps Script response, and use empty assessment arrays. They do not contact Cloudflare, Google Sheets, Resend or real student data.

## Release gate

Before merging or deploying:
1. Configure the dedicated teacher Access application and audience in a restricted preview.
2. Verify signed-out, student, unapproved and approved-teacher access to both the dashboard and API.
3. Confirm the API rejects missing/invalid JWTs and an unapproved identity.
4. Confirm the teacher dashboard works for the approved teacher.
5. Review the separate Pages preview hostname and prevent public bypass.
6. Obtain explicit approval before changing production Access settings, merging or deploying.

This change does not authorise production configuration or deployment.
