# mootmaker-webapp

The React single-page app: TypeScript, MUI, Apollo Client, Vite, deployed to S3 behind CloudFront.

**Start by reading [README.md](README.md).** It describes the architecture, how the app calls the API
(auth, error handling, progress indicators, client versus server validation), hosting, the directory
structure, the build and deploy scripts, and how to run the tests. Keep it up to date.

## Working here

- **Expect `../mootmaker-api` as a sibling checkout.** `deploy.sh` passes the environment name
  through to the API's `authenticate.sh` to discover the GraphQL URL and Cognito IDs. Use the local
  checkout rather than looking anything up on GitHub.
- **`npm install` at the repository root as well as in `webapp/`.** They are separate `package.json`
  files. Missing the root one produces a silent `playwright: not found`, which has wasted time
  before.
- **Four test layers**, described in [testing-strategy.md](testing-strategy.md): unit and mocked
  integration under `webapp/`, then `e2e/` and `acceptance/` against a real deployed environment.
- **Tests locate elements by role and accessible name**, not by test IDs. That is deliberate — it
  keeps the app accessible as a side effect and survives refactoring. Be careful with substring
  matching: `getByRole('link', { name: 'Calendar' })` will also match a meeting whose subject
  contains "Calendar". Use `exact: true`.
- **`webapp/src/graphql/generated/` is generated from the API's schema — never edit it.** Change the
  schema in `mootmaker-api`, then `npm run codegen` here. `npm run codegen:check` regenerates and
  fails on any diff, so drift is caught rather than discovered. This replaces the old rule that
  `types.ts` had to be mirrored by hand; it no longer does, and `types.ts` now derives its shapes
  from the generated operations.

---

## Project-wide rules

This repository is part of the **mootmaker** project. The workflow rules that apply everywhere live
in the hub repository, which you should find checked out as a sibling directory:

    ../mootmaker/docs/process/README.md

On GitHub: <https://github.com/geoffweatherall/mootmaker/blob/main/docs/process/README.md>

**Read it before doing any non-trivial work here.** The short version:

- Work of any real size starts with a **design document** (`../mootmaker/designs/`), not with code.
- Bugs and small changes start with a **GitHub issue in this repository**, so `Closes #N` works.
- All work happens on a **branch** and lands via a **pull request**. There is no approval step —
  reading the diff is the review, merging is the approval.
- **A green acceptance run against a real deployed environment** is the definition of working — not
  a passing unit suite, and not a successful deploy.
- **Environments are `production` or ephemeral.** Tear down any ephemeral environment you create;
  that is part of finishing, not a tidy-up afterwards.
- **If your change makes a document wrong, fixing it is part of the change.**
- **Verify against reality, not your own output.** A script exiting zero is not evidence that the
  thing it was meant to do happened.
- **Say what actually happened.** Failing tests get reported with their output; skipped steps get
  named.

Also useful: [`../mootmaker/docs/roles/`](https://github.com/geoffweatherall/mootmaker/blob/main/docs/roles/)
for which kind of work you are doing, and
[`../mootmaker/tools/workstation/check.sh`](https://github.com/geoffweatherall/mootmaker/blob/main/tools/workstation/check.sh)
if something is not installed.

`CLAUDE.md` in this repository is a symlink to this file.
