# Lex Practice — Student Learning Area

Lex Practice is the student learning area for Lex Academic English. The repository's current programmes include IELTS practice, Retail Business English, and reference resources.

## Location and deployment

- Website repository: `wazkebab95/lex-academic-english-v2`
- Website files: `lexacademicenglish_multipage/`
- Student hub: `lexacademicenglish_multipage/students/index.html`
- Retail programme: `lexacademicenglish_multipage/students/retail/index.html`
- Hosting and previews: Cloudflare Pages
- Production branch: `main`

Continue development on non-production feature branches. Review the Cloudflare Pages preview before merging. Do not change DNS, hosting settings, or production deployment configuration as part of routine content work.

## Retail Business English modules

1. Retail vocabulary — 10 scored multiple-choice questions.
2. Business grammar — 8 scored multiple-choice questions.
3. Professional communication — 5 workplace scenarios.
4. Retail case study — written analysis, local save, and example response.
5. Final assessment — 10 mixed-skills questions.

Quiz modules provide instant feedback, explanations, module scores and completion status. The Results & completion view summarises completed modules and the combined score from completed scored quizzes. The written case study is self-reviewed and is not automatically graded.

## Student configuration

The `STUDENT_PROFILE` object in the Retail programme is intentionally generic. Confirm the learner's English level, professional role and priorities before adapting the content. Do not put a student's name, email address, employer-confidential information or identifiable assessment data in this public repository.

## Progress and submission data

- Learning progress and the case-study response are saved in the current browser's `localStorage`; they do not synchronise between devices.
- The Retail results form is a separate, explicit submission step. It sends a learner-reported progress summary to the `/api/submit-ielts` endpoint.
- The Retail case-study response is excluded by default and is sent only when the learner selects the case-study consent checkbox.
- The shared endpoint sends submissions to the configured Google Sheets webhook and Resend email service. A successful browser confirmation means the configured services accepted the request; it does not independently verify a learner's score.
- The hardened endpoint and clearer student-facing disclosures in this feature branch are not live until reviewed and merged.
- There is no application-level student account system or teacher dashboard. Browser storage and an unlisted URL are not access control.

Do not enter real student personal data or confidential employer information until Cloudflare Access protects both the student pages and the submission endpoint, and the access tests in [SECURITY-AND-QA.md](SECURITY-AND-QA.md) pass.

## Local preview

Serve `lexacademicenglish_multipage/` with a static HTTP server and open `/students/`. The pages use Tailwind CSS and Google Fonts from their CDNs; an internet connection is needed for those external assets.

## Release safeguards

- Keep further changes on a non-production feature branch.
- Check the Cloudflare Pages preview for the branch.
- Protect `/students/*` and `/api/submit-ielts` with a matching Cloudflare Access allow policy before accepting student submissions.
- Configure a rate-limiting rule for POST requests to `/api/submit-ielts`.
- Test authorised and unauthorised access, invalid submissions, and the email rendering path.
- Keep student data out of GitHub.
- Merge to `main` only with explicit approval after review.
