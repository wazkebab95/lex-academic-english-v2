# Lex Practice — Retail Business English

Lex Practice is the student learning area for Lex Academic English. The first programme is a standalone Retail Business English prototype.

## Location and deployment

- Website repository: `wazkebab95/lex-academic-english-v2`
- Website files: `lexacademicenglish_multipage/`
- Student hub: `lexacademicenglish_multipage/students/index.html`
- Retail programme: `lexacademicenglish_multipage/students/retail/index.html`
- Hosting and previews: Cloudflare Pages
- Production branch: `main`

The initial student-area implementation was merged into `main` in pull request #1. Continue future work on a separate feature branch and review its Cloudflare Pages preview before merging. Do not change DNS, hosting settings, or production deployment configuration as part of routine content work.

## Learning modules

The current Retail page is a reduced prototype:

1. Retail vocabulary — one diagnostic multiple-choice question.
2. Business grammar — one diagnostic multiple-choice question.
3. Professional communication — one diagnostic multiple-choice question.
4. Retail case study — one diagnostic scenario question.
5. Final assessment — a written supplier-escalation email task.

This is **not yet** the intended expanded question bank (10 vocabulary, 8 grammar, 5 communication and 10 final-assessment questions). The current page does not yet provide the complete per-question feedback, module retry flow and comprehensive results dashboard described in the product brief. These remain development work, not delivered features.

## Configuration

The `STUDENT_PROFILE` object is intentionally generic. Confirm the learner's English level, professional role and priorities before adapting the content. Do not put a student's name, email address, employer-confidential information or identifiable assessment data in this public repository.

## Data and privacy status

- Quiz progress and the case-study response are stored in the learner's current browser using `localStorage`.
- This prototype does not send work or scores to the teacher and does not synchronise between devices.
- There is currently no application-level login, database, or per-student authorisation.
- Do not use this prototype for confidential student work or tell learners that their results are privately stored until the access and data architecture has been configured and tested.

See [SECURITY-AND-QA.md](SECURITY-AND-QA.md) for the Cloudflare Access plan and release checks.

## Submission and data handling

The Retail page submits to the shared `/api/submit-ielts` endpoint, which is also used by the IELTS diagnostic form. The endpoint accepts both the canonical fields (`studentName`, `studentEmail`, `category`, `detailsPlain`) and the legacy form fields (`name`, `email`, `module`, `essay`). It ignores client-supplied HTML and treats written responses as plain text.

The Retail page asks for explicit consent before including the written case-study response in an email submission. Learner name and email are entered for each submission and are not saved by the Retail page to browser storage. The optional draft remains in the current browser until cleared.

The shared endpoint remains publicly callable unless separately protected at the Cloudflare edge. Do not apply Access to `/api/submit-ielts` without first separating the public IELTS submission route, because that could break the public IELTS form. Add and test rate limiting. The student pages still require Cloudflare Access before they are described as private.

## Local preview

Serve `lexacademicenglish_multipage/` with a static HTTP server and open `/students/`. The pages use Tailwind CSS and Google Fonts from their CDNs; an internet connection is needed for those external assets.

## Release safeguards

- Keep further changes on a non-production feature branch.
- Check the Cloudflare Pages preview for the branch.
- Test authorised and unauthorised access before sharing the student route.
- Keep student data out of GitHub and client-side-only storage.
- Merge to `main` only with explicit approval after review.
