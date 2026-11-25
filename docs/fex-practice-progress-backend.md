# Fex Practice learner progress backend

## What this adds

- A private student progress endpoint at `/students/api/progress`, covered by the existing Cloudflare Access student route (`/students/*`).
- Per-account module progress and saved quiz choices, with scores recalculated by the server from the current Retail module answer key.
- A personal learner page at `/students/progress/` showing module status, topics covered, assessment history, teacher feedback and a vocabulary review library.
- Vocabulary review scheduling with Again, Difficult, Remembered and Very easy ratings.
- Teacher-only progress reads and feedback writes through the existing protected `/api/teacher-data` endpoint.
- A D1 migration that creates learner, enrolment, module progress, vocabulary, assessment and teacher feedback tables.

## Identity and privacy

The student identity is taken from a verified Cloudflare Access JWT. The learner ID is derived server-side from the Access issuer and verified email; request-body email or learner IDs are never used to select the learner's own progress. The API returns only the signed-in learner's records. The teacher endpoint uses the existing teacher JWT verifier and resolves feedback recipients from active enrolments.

Written case-study drafts are deliberately not transmitted or stored by this first version. Only the self-review completion flag is saved. This keeps personal written work out of the progress database until a separately consented submission/review workflow is implemented.

## Cloudflare setup required before live use

The code is committed, but this repository currently has no verified D1 binding configuration. Do not expect persistent progress to work on the live site until the following infrastructure steps are completed:

1. Create a Cloudflare D1 database for Fex Practice.
2. In the Cloudflare Pages project serving `lexacademicenglish_multipage`, add a D1 database binding named exactly `FEX_DB` and select that database.
3. Apply `migrations/0001_fex_learner_progress.sql` to that database (using Wrangler with the database name/ID, or the Cloudflare D1 console).
4. Confirm the Pages deployment has the existing student Access audience and email allowlist variables: `CF_ACCESS_TEAM_DOMAIN`, `RETAIL_ACCESS_AUD`, and `RETAIL_ALLOWED_EMAILS`.
5. Confirm the teacher API has its existing teacher Access variables and the same `FEX_DB` binding.

The current student Access hostname pattern `www.lexacademicenglish.co.uk/students/*` covers both the learner progress page and its API route. Keep the teacher Access application separate. Do not widen either policy.

## Current limitations / next phase

- The Retail pilot currently creates an active course enrolment when an allowlisted student first accesses the API. A teacher-facing enrolment/pause control is a follow-up feature.
- The teacher dashboard can display saved module progress, vocabulary review counts, assessment attempts and teacher feedback once D1 is connected.
- The five-module Retail answer key is versioned in the API. If curriculum questions or answer order change, update the API answer key and regression tests in the same change.
- Student progress is a learning record, not a certified result. The teacher should review written work separately.
- No D1 database, Cloudflare binding, Access policy, production secret or live deployment has been created or changed by this PR.
