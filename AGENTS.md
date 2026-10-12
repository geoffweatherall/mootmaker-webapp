# mootmaker-webapp

The React single-page app: TypeScript, MUI, Apollo Client, Vite, served from S3 behind CloudFront.

**Read [README.md](README.md) first**, then [docs/architecture.md](docs/architecture.md), which states the
rules every page follows (loading and empty states, errors, validation, dates). Keep both true in the same
pull request as any change that affects them.

## Working here

- **`webapp/src/graphql/generated/` is generated; never edit it.** After changing an operation, run
  `npm run codegen`. `codegen:check` in CI fails on any difference. A schema change starts in mootmaker-api.
- **Every new error code needs wording** in `validationMessages.ts`; the map is typed by the generated
  enums, so the build fails until it has one.
- **The API enforces every rule.** The UI only prevents what is cheap to prevent and shows what the API
  refuses. An admin-only control hidden in the UI is a courtesy, not the check.
- **Never show an empty state while a refetch is in flight**, and keep last-known data on screen under a
  progress bar while refreshing. See the loading rules in the architecture doc.
- **Times are zone-less local strings.** Format them with `formatDateTime.ts`; never `new Date(str)`.
- **Meeting details render through `MeetingDetailContent`** everywhere; change it there, not in a page.
- **Tests find elements by role and accessible name**, not test ids. Use `exact: true` where a name could
  also match a meeting subject (a meeting called "Calendar" matches the Calendar link).
- **`npm install` in both the repository root and `webapp/`.** They are separate `package.json` files;
  missing the root one gives a silent `playwright: not found`.
- **Deploy needs the API first.** `deploy.sh` reads the API's settings from SSM and refuses to deploy
  against an API that does not serve the fields this build uses.
- **Acceptance tests reset the environment they run against.** Point them at an ephemeral environment.

---

## Project-wide rules

This repository is part of **Mootmaker**. The hub repository, checked out as a sibling at
`../mootmaker`, holds what applies everywhere:

- How work is done: [`../mootmaker/docs/process/README.md`](https://github.com/geoffweatherall/mootmaker/blob/main/docs/process/README.md).
  Read it before any non-trivial work.
- How the system fits together: [`../mootmaker/docs/overview/`](https://github.com/geoffweatherall/mootmaker/tree/main/docs/overview).
- What to do when something is wrong: [`../mootmaker/docs/runbooks/`](https://github.com/geoffweatherall/mootmaker/blob/main/docs/runbooks/README.md).

The short version:

- Work of any real size starts with a **design** (`../mootmaker/designs/`); a bug or small change starts
  with a **GitHub issue in this repository**, so `Closes #N` works.
- Everything lands on a **branch** through a **pull request**. Reading the diff is the review; merging is
  the approval.
- **A green acceptance run against a real deployed environment** is the definition of working.
- **`test` and `production` change only through a release** (`release.yml` in mootmaker-release). Use an
  ephemeral environment for your own work, and tear it down when you finish.
- **Say what something costs in AWS before creating it.** Under NZ$1 one-off, go ahead and state it;
  more, or anything recurring, ask first.
- **Keep documentation and comments true and current.** If a change makes a document wrong, fixing it is
  part of the change. Describe what is, not how it got here; a comment says what and why.
- **Verify against reality, not your own output**, and **say what actually happened**, including
  failures and skipped steps.

Something not installed? [`../mootmaker/tools/workstation/check.sh`](https://github.com/geoffweatherall/mootmaker/blob/main/tools/workstation/check.sh).

`CLAUDE.md` in this repository is a symlink to this file.
