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

1. Retail vocabulary — 10 scored multiple-choice questions.
2. Business grammar — 8 scored multiple-choice questions.
3. Professional communication — 5 workplace scenarios.
4. Retail case study — written analysis, local save, and example response.
5. Final assessment — 10 mixed-skills questions.

The quiz modules provide instant feedback, explanations, module scores and completion status. The Results & completion view summarises completed modules and the combined score from completed scored quizzes.

## Configuration

The `STUDENT_PROFILE` object is intentionally generic. Confirm the learner's English level, professional role and priorities before adapting the content. Do not put a student's name, email address, employer-confidential information or identifiable assessment data in this public repository.

## Data and privacy status

- Quiz progress and the case-study response are stored in the learner's current browser using `localStorage`.
- This prototype does not send work or scores to the teacher and does not synchronise between devices.
- There is currently no application-level login, database, or per-student authorisation.
- Do not use this prototype for confidential student work or tell learners that their results are privately stored until the access and data architecture has been configured and tested.

See [SECURITY-AND-QA.md](SECURITY-AND-QA.md) for the Cloudflare Access plan and release checks.

## Local preview

Serve `lexacademicenglish_multipage/` with a static HTTP server and open `/students/`. The pages use Tailwind CSS and Google Fonts from their CDNs; an internet connection is needed for those external assets.

## Release safeguards

- Keep further changes on a non-production feature branch.
- Check the Cloudflare Pages preview for the branch.
- Test authorised and unauthorised access before sharing the student route.
- Keep student data out of GitHub and client-side-only storage.
- Merge to `main` only with explicit approval after review.
