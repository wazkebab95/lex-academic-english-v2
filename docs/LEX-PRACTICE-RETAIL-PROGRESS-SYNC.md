# Lex Practice Retail progress sync — setup and security notes

**Status:** implementation is staged in GitHub only. No Cloudflare D1 database, Access application, binding, environment variable or production setting has been created or changed.

## What the feature does

The learning page has three optional account actions:

- **Load saved progress** — restores quiz selections and the case-study self-review flag for the signed-in Access identity.
- **Save current progress** — stores the same limited progress snapshot.
- **Delete saved copy** — deletes that account's saved Retail record.

The page calls only the same-origin route:

/students/retail/api/progress

The Cloudflare Pages Function is:

functions/students/retail/api/progress.js

The route is intentionally nested under /students/retail/ so the recommended Cloudflare Access application for /students/retail/* covers the page and its API. The exact parent path /students/retail should also be protected separately.

## Data minimisation

The API stores only:

- A pseudonymous Cloudflare Access subject (sub) taken from a verified JWT.
- The fixed course identifier retail-business-english.
- Selected answer indexes for the 27 scored quiz questions.
- The case-study self-review boolean.
- An update timestamp.

It does **not** store or accept:

- Student name or email address.
- Employer, store or job-title information.
- The written case-study responses.
- Profile level or role selections.
- Browser-calculated scores or correctness flags.
- Raw Access JWTs.

Scores are reconstructed by the browser from the selected answer indexes and the public curriculum. They are practice results, not tamper-proof examination grades or certification evidence.

The learner can delete their own saved row using the Delete saved copy action. There is no automatic retention expiry in this first version; decide and document a retention period before production use.

## Server-side controls

The Pages Function:

1. Accepts only GET, PUT and DELETE.
2. Requires the Cf-Access-Jwt-Assertion header.
3. Verifies the JWT signature using the Cloudflare Access JWKS endpoint and RS256.
4. Checks issuer, audience, expiry, optional not-before time and subject.
5. Derives the database key from the verified JWT subject, never from request JSON.
6. Uses a fixed course identifier and an allowlist of module IDs and question counts.
7. Accepts only integer answer indexes from 0 to 2 or null.
8. Rejects extra fields, including free-text or client-supplied scores.
9. Limits PUT bodies to 8 KB and requires JSON content type.
10. Returns private no-store responses and uses prepared D1 statements.
11. Scopes GET, PUT and DELETE to the authenticated subject.

The endpoint fails closed if Access configuration or the D1 binding is missing. The page does not automatically upload anything: the learner must choose Load, Save or Delete.

## Cloudflare Pages prerequisites

Before configuring this feature, confirm the Pages project uses the repository root as its project root so the existing root-level functions/api/submit-ielts.js and the new nested function are discovered. The current repository does not contain a Wrangler configuration file or Pages build manifest that independently proves the dashboard's root-directory setting.

### 1. Create a dedicated D1 database

Create a new database for Retail progress. Do not reuse a production database that contains unrelated student or IELTS records.

Using Wrangler from a trusted local environment:

npx wrangler d1 create lex-retail-progress

Record the database name and ID in your private deployment notes. Do not commit credentials or account identifiers.

### 2. Apply the schema

Apply the migration file:

migrations/0001_retail_student_progress.sql

For example, with Wrangler:

npx wrangler d1 execute lex-retail-progress --remote --file=migrations/0001_retail_student_progress.sql

Alternatively, use the D1 dashboard's SQL console and paste the migration. Confirm the table exists before enabling the page controls.

### 3. Bind D1 to the Pages Function

In **Workers & Pages → lex-academic-english-v2 → Settings → Functions → D1 database bindings**, add:

| Setting | Value |
|---|---|
| Variable name | RETAIL_PROGRESS_DB |
| Database | The dedicated Retail progress D1 database |

Configure Preview and Production separately. Do not bind a production student database to an unprotected preview deployment.

### 4. Configure Access verification variables

In the Pages project's Functions environment variables, configure the following values for the relevant environment:

| Variable | Value |
|---|---|
| ACCESS_TEAM_DOMAIN | The exact HTTPS issuer origin shown by the Cloudflare Access team, for example https://your-team.cloudflareaccess.com |
| ACCESS_AUD | The audience tag of the Access application protecting the Retail route |

Use the correct audience for the hostname/environment being tested. A preview hostname protected by a separate Access application may have a different audience from production.

These values are not private signing keys, but they must be accurate. Never accept a token solely because it contains an email address; the function verifies the signature, issuer and audience.

### 5. Configure the Access application

Follow docs/LEX-PRACTICE-RETAIL-ACCESS.md.

For this endpoint, the Access application must cover:

- Exact path /students/retail
- Descendant path /students/retail/*

The descendant application includes /students/retail/api/progress. Its Allow policy must include only the intended student identity for the pilot. Keep preview access separate and teacher-only.

Do not enable the production route until the unauthorised and signed-out tests pass.

## Test sequence

1. Apply the D1 migration to a dedicated test database.
2. Bind the test database only to the Pages Preview environment.
3. Configure a teacher-only Preview Access application and use its own issuer/audience values.
4. Confirm signed-out requests to /students/retail/api/progress receive 401.
5. Confirm a valid Access identity with a correctly configured D1 binding can GET an empty record.
6. Save progress and confirm a subsequent GET returns the same answer indexes.
7. Sign in as a second authorised test identity and confirm it cannot read the first identity's row.
8. Delete the first identity's row and confirm GET returns null.
9. Confirm the request payload and D1 row contain no written case-study response, name, email, employer, score or correctness flag.
10. Confirm missing D1 or Access configuration returns a safe error and does not fall back to local or public storage.
11. Add a Cloudflare rate-limit rule for the progress route before real student use.
12. Repeat the route and identity tests on the production custom domain only after explicit approval.

The repository's automated tests are run with:

- node scripts/verify-retail-learning-path.mjs
- node scripts/verify-retail-progress-api.mjs

The API tests create a temporary RSA key pair and mock the Access JWKS and D1 binding. They do not connect to a real Cloudflare account or database.

## Not included yet

- Teacher dashboard or teacher API for viewing progress.
- Server-side marking or authoritative score calculation.
- Written assignment submission or tutor feedback storage.
- Automatic retention expiry or scheduled deletion.
- Rate limiting configuration.
- Cloudflare Access application creation or D1 binding setup.

Do not use this as a production student record system until the Cloudflare configuration and browser-level identity tests are complete.
