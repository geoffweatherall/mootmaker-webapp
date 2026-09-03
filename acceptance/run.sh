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
api_dir="${repo_root}/../mootmaker-api"
# Two separate repos since the 2026-09-03 split of mootmaker-test-infra (see
# mootmaker-ephemeral-envs' and mootmaker-email-testing's own READMEs): the ephemeral-environment
# scripts below vs. the persistent email pipeline's Terraform further down.
ephemeral_envs_dir="${repo_root}/../mootmaker-ephemeral-envs"
email_testing_dir="${repo_root}/../mootmaker-email-testing"

owns_environment=""
environment="${1:-}"

if [[ -z "${environment}" ]]; then
  echo "No environment given - creating a fresh one..." >&2
  environment="$("${ephemeral_envs_dir}/create-ephemeral-env.sh" web-acc)"
  owns_environment="true"
fi

cleanup() {
  if [[ -n "${owns_environment}" ]]; then
    echo "Tearing down '${environment}' (created for this run)..." >&2
    yes yes | "${ephemeral_envs_dir}/teardown-ephemeral-env.sh" "${environment}" || true
  fi
}
trap cleanup EXIT

echo "Running the acceptance suite against '${environment}'..." >&2

# Populates GRAPHQL_API_URL, COGNITO_USER_POOL_ID, COGNITO_WEBAPP_CLIENT_ID, DEMO_USER_EMAIL,
# DEMO_USER_PASSWORD, etc.
source "${api_dir}/authenticate.sh" "${environment}"

webapp_tf_data_dir="${repo_root}/deploy/terraform/.terraform-${environment}"
TF_DATA_DIR="${webapp_tf_data_dir}" terraform -chdir="${repo_root}/deploy/terraform" init \
  -backend-config=backend.hcl \
  -backend-config="key=${environment}/mootmaker-webapp/terraform.tfstate" \
  -input=false >/dev/null
export WEBAPP_URL="$(TF_DATA_DIR="${webapp_tf_data_dir}" terraform -chdir="${repo_root}/deploy/terraform" output -raw site_url)"

# Only needed for scenarios that actually read a real emailed code (see README.md) - harmless to
# populate unconditionally, same as e2e/run.sh.
terraform -chdir="${email_testing_dir}/deploy/terraform" init -backend-config=backend.hcl -input=false >/dev/null
export SQS_QUEUE_URL="$(terraform -chdir="${email_testing_dir}/deploy/terraform" output -raw sqs_queue_url)"

cd "${repo_root}"
npm run test:acceptance
