# Fex Practice — teacher dashboard design and security contract

**Status:** design specification only. No teacher dashboard, teacher API, database migration, Cloudflare Access policy or production setting is created by this document.

## Purpose and first release boundary

Provide a private teacher workspace for the Retail Business English pilot. The first release should let an authorised teacher:
- See a roster of enrolled Retail learners without exposing one learner's record to another.
- Review each learner's module completion and most recent saved-progress timestamp.
- Open a learner's progress summary and identify modules that may need support.
- Review written assignments only when the learner has deliberately submitted them for teacher review.
- Record teacher feedback and a review status (not started, submitted, in review, feedback returned).
- Filter by programme/module/status and export only the minimum information needed for teaching.

The dashboard is not a public page and must not be treated as private because its URL is difficult to guess. It must not provide an unauthenticated roster or a client-side-only teacher check.

## Authentication and authorisation

1. Protect the teacher UI and every teacher API route with a dedicated Cloudflare Access application. Keep the teacher application separate from the student /students/retail application and from preview access.
2. Verify the Access JWT on the server for every request: RS256 signature, exact issuer, exact audience, expiry, optional not-before, and non-empty subject. Fail closed if configuration or JWKS verification is unavailable.
3. Authorise the verified subject against a server-managed teacher allowlist or a future server-managed role table. Do not accept role, isTeacher, email, student ID or teacher ID from request JSON as proof of authority.
4. Keep student endpoints and teacher endpoints separate. A valid student token must never grant teacher access.
5. Apply authorisation before any database query. Never send the full D1 roster or all assignment bodies to the browser and filter them client-side.
6. Use a distinct least-privilege teacher identity list for production and preview. No wildcard allow policy and no shared student/teacher account.

**Important:** Cloudflare Access authentication proves identity, not teaching authority. The server-side teacher allowlist/role check is mandatory.

## Existing progress data: safe read model

The staged Retail progress schema currently contains one row per (student_sub, course_id) and stores:
- Pseudonymous student_sub from the verified Access JWT.
- Fixed course ID retail-business-english.
- JSON containing selected answer indexes and the case-study self-review flag.
- updated_at.

It intentionally does not store student names, emails, job titles, written case-study drafts, profile selections, scores or correctness flags.

For the first dashboard, return only a teacher-authorised, minimised summary:
- A pseudonymous internal learner reference (never the raw Access subject in UI or logs).
- Enrolment/display label from a separately managed roster, if and when that roster is deliberately introduced.
- Course/module completion state and last saved timestamp.
- Objective practice scores calculated server-side from a versioned answer key; never trust browser-supplied scores.
- A clear label that these are practice indicators, not formal grades or certification.

Do not expose raw answer arrays by default. If a teacher needs to inspect question-level attempts, require an explicit learner-specific request and return only that learner's authorised data. Do not include written work in progress summaries.

The current progress table alone is not an enrolment roster. Do not invent student names or infer enrolment from a public page. Decide how learners are invited and linked to an internal roster before building roster screens.

## Written assignments and teacher feedback

Written case-study work is currently page-session data and is not uploaded by the progress-sync endpoint. Preserve that privacy boundary.

A later assignment workflow should require a deliberate learner action to submit a specific piece of work. Before submission, show what will be shared and with whom. Store only the submitted assignment, course/module reference, submission timestamp, learner ownership key, and a version/status marker. Keep draft text local until submission.

Teacher feedback must be created only by an authorised teacher. Every read, create, update and delete must be scoped server-side. Keep a basic audit trail (actor subject, action, assignment reference, timestamp) without copying assignment text into logs. Do not automatically grade free-text writing or speaking. Speaking assessment remains teacher-supervised and should not be recorded unless a separate consent, retention and access design is approved.

## Proposed API shape (not implemented)

- GET /students/retail/teacher/api/learners — teacher-only paginated roster summary.
- GET /students/retail/teacher/api/learners/:learnerRef — teacher-only single-learner progress summary.
- GET /students/retail/teacher/api/assignments?status=submitted — teacher-only assignment queue with metadata, not full text.
- GET /students/retail/teacher/api/assignments/:assignmentRef — teacher-only view of one submitted assignment.
- POST /students/retail/teacher/api/assignments/:assignmentRef/feedback — teacher-only feedback submission.
- Student-side assignment routes should be separately authenticated and always derive learner ownership from the verified student JWT.

Use opaque, random internal references for roster and assignment records. Never accept a learner's database key from a browser and use it without checking the authenticated teacher's permission to access that learner.

## Data model decisions before implementation

Do not extend the current progress JSON to hold names, email addresses, written assignments or teacher comments. Prefer separate tables with explicit constraints and indexes, for example:
- retail_enrolments: opaque learner reference, Access subject mapping, course ID, status, created timestamp. Access subject mapping must be protected and never returned to other learners.
- retail_assignments: opaque assignment reference, learner reference, course/module ID, submitted text, submission version, status, submitted timestamp.
- retail_feedback: opaque feedback reference, assignment reference, teacher subject, feedback text, created/updated timestamp.
- retail_teacher_roles: verified Access subject, role, active status (only if a server-managed allowlist is not sufficient).

Before migration, decide: invitation/enrolment flow; whether learners can see past feedback; whether teachers can edit feedback; retention and deletion periods; backup/deletion expectations; and whether more than one teacher can access a cohort. Enforce foreign keys, fixed course/module allowlists, payload limits, prepared statements and indexes. Avoid storing emails unless there is a clear operational need and an approved retention policy.

## Required security and QA cases

- Signed-out requests to every teacher page/API are denied.
- A valid student Access identity is denied by every teacher API.
- An authenticated but non-allowlisted Access identity is denied.
- A teacher identity can access only the permitted course/cohort.
- Tampered, wrong-issuer, wrong-audience, expired and not-yet-valid JWTs are rejected.
- Missing Access configuration, role configuration or D1 binding fails closed.
- A learner cannot retrieve another learner's progress or assignment.
- A teacher cannot access a learner outside the teacher's assigned cohort.
- Client-supplied subject, email, role, score and ownership fields are ignored or rejected.
- Assignment body is absent from roster responses and progress summaries.
- Feedback writes are teacher-only and have an audit event.
- Oversized, malformed and unexpected payloads are rejected.
- Responses containing private learner data use Cache-Control: no-store, private.
- No student work, JWT, email or assignment body appears in application logs.
- Mobile and desktop layout, keyboard navigation and empty/error/loading states are tested.
- Automated tests use synthetic identities and synthetic assignment text only.

## Release gates and non-goals

Do not build or enable a production teacher dashboard until:
1. Student Access and progress persistence have been tested against a dedicated non-production Cloudflare Access application and D1 database.
2. A teacher identity/role model and cohort-access rule are approved.
3. Enrolment/invitation and account recovery processes are decided.
4. Assignment consent, retention, deletion and feedback visibility are decided.
5. Automated authorisation/isolation tests and manual mobile/desktop browser tests pass.
6. Rate limiting, audit logging and backup/deletion procedures are designed.
7. The user explicitly approves the required Cloudflare configuration and eventual production release.

This specification does not authorise production deployment, PR merging, DNS/hosting changes, Cloudflare configuration, D1 creation/migration, or use of real student data.
