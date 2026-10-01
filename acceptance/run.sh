#!/usr/bin/env bash
# Runs this directory's acceptance suite (tests/) against a genuinely deployed webapp + API - see
# README.md for what belongs here versus ../e2e/. Structurally identical to ../e2e/run.sh (same
# ephemeral-environment lifecycle, same shared email pipeline); kept as a separate script rather
# than a shared one so each suite's own run script stays a one-line-obvious entry point.
#
# Usage:
#   ./run.sh                 create a fresh web-acc-<date>-<rand> environment (named for exactly
#                             this suite - see mootmaker-ephemeral-envs/create-ephemeral-env.sh's usage
#                             comment for the convention), run the suite, tear it down afterward
#                             regardless of the result (pass, fail, or a script error)
#   ./run.sh <environment>   run against an already-deployed environment instead (e.g. one you're
#                             iterating against) - this script never creates or tears down an
#                             environment you passed in explicitly, that's yours to manage
set -euo pipefail

# Deliberately no `cd "$(dirname "$0")"` here - script_dir below already resolves an absolute
# path from BASH_SOURCE via a subshell cd (which doesn't affect this script's own cwd), and every
# path used after this is built from it. A prior version of this script did also `cd
# "$(dirname "$0")"` first, which broke when invoked as `./acceptance/run.sh` from the repo root
# (the documented usage - see this file's own header comment): $0 is then "./acceptance/run.sh",
# so that cd moved into acceptance/ - and BASH_SOURCE[0] below is the *same* unchanged relative
# string, so the subshell then tried to cd into "./acceptance" a second time, now relative to a
# cwd already inside acceptance/, which fails with "No such file or directory".
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="${script_dir}/.."
# Only for creating and tearing down an environment when none is given. Everything else this
# script needs is looked up in SSM (deploy/ssm-config.sh).
ephemeral_envs_dir="${repo_root}/../mootmaker-ephemeral-envs"
# shellcheck source=../deploy/ssm-config.sh
source "${repo_root}/deploy/ssm-config.sh"

owns_environment=""
environment="${1:-}"
# Everything after the environment is passed straight through to Playwright, so a single spec or a
# --grep can be iterated on without paying for the whole suite. The full run takes ~47 minutes
# against a real environment, which is long enough that not being able to narrow it changes how
# people work: they stop re-running it.
if [[ $# -gt 0 ]]; then
  shift
fi
playwright_args=("$@")

if [[ -z "${environment}" ]]; then
  echo "No environment given - creating a fresh one..." >&2
  environment="$("${ephemeral_envs_dir}/create-ephemeral-env.sh" web-acc)"
  owns_environment="true"
fi

cleanup() {
  if [[ -n "${owns_environment}" ]]; then
    echo "Tearing down '${environment}' (created for this run)..." >&2
    "${ephemeral_envs_dir}/teardown-ephemeral-env.sh" "${environment}" --yes || true
  fi
}
trap cleanup EXIT

echo "Running the acceptance suite against '${environment}'..." >&2

# Everything the suite needs - the API's endpoint and clients, the site URL, the shared email
# queue, the reset function and the test fixture users - is looked up in SSM Parameter Store,
# where each component publishes it (mootmaker-api#94), and exported to Playwright only.
export_test_config "${environment}"

# No reset here: every test resets the environment itself, before it starts (tests/support/test.ts,
# mootmaker-webapp#138), so any test can run alone or in any order.

cd "${repo_root}"
npm run test:acceptance -- "${playwright_args[@]}"
