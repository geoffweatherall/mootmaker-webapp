#!/usr/bin/env bash
# Runs this directory's full-stack Playwright suite (tests/) against a genuinely deployed webapp +
# API, including real Cognito email delivery through mootmaker-email-testing's persistent SES/SNS/SQS
# pipeline (a separate, always-on piece of infrastructure, not created or torn down by this
# script).
#
# Usage:
#   ./run.sh                 create a fresh web-e2e-<date>-<rand> environment (named for exactly
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
# "$(dirname "$0")"` first, which broke when invoked as `./e2e/run.sh` from the repo root (the
# documented usage - see this file's own header comment): $0 is then "./e2e/run.sh", so that cd
# moved into e2e/ - and BASH_SOURCE[0] below is the *same* unchanged relative string, so the
# subshell then tried to cd into "./e2e" a second time, now relative to a cwd already inside e2e/,
# which fails with "No such file or directory".
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="${script_dir}/.."
# Only for creating and tearing down an environment when none is given. Everything else this
# script needs is looked up in SSM (deploy/ssm-config.sh).
ephemeral_envs_dir="${repo_root}/../mootmaker-ephemeral-envs"
# shellcheck source=../deploy/ssm-config.sh
source "${repo_root}/deploy/ssm-config.sh"

owns_environment=""
environment="${1:-}"

if [[ -z "${environment}" ]]; then
  echo "No environment given - creating a fresh one..." >&2
  environment="$("${ephemeral_envs_dir}/create-ephemeral-env.sh" web-e2e)"
  owns_environment="true"
fi

cleanup() {
  if [[ -n "${owns_environment}" ]]; then
    echo "Tearing down '${environment}' (created for this run)..." >&2
    # Each undeploy.sh prompts for its own interactive "yes" (deliberately, for a human running it
    # directly) - piped here so this promised "tears down regardless of outcome" actually holds
    # with no TTY attached. Safe to auto-approve unconditionally at this call site only:
    # teardown-ephemeral-env.sh's own regex check already refuses anything that doesn't look like a
    # recognized ephemeral name, so by the time either destroy prompt is reached, that's already
    # guaranteed.
    "${ephemeral_envs_dir}/teardown-ephemeral-env.sh" "${environment}" --yes || true
  fi
}
trap cleanup EXIT

echo "Running the e2e suite against '${environment}'..." >&2

# Everything the suite needs - the API's endpoint and clients, the site URL, the shared email
# queue, the reset function and the test fixture users - is looked up in SSM Parameter Store,
# where each component publishes it (mootmaker-api#94), and exported to Playwright only.
export_test_config "${environment}"

cd "${repo_root}"
npm run test:e2e
