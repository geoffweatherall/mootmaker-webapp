#!/usr/bin/env bash
# Runs this directory's full-stack Playwright suite (tests/) against a genuinely deployed webapp +
# API, including real Cognito email delivery through mootmaker-test-infra's persistent SES/SNS/SQS
# pipeline (a separate, always-on piece of infrastructure, not created or torn down by this
# script).
#
# Usage:
#   ./run.sh                 create a fresh web-e2e-<date>-<rand> environment (named for exactly
#                             this suite - see mootmaker-test-infra/create-ephemeral-env.sh's usage
#                             comment for the convention), run the suite, tear it down afterward
#                             regardless of the result (pass, fail, or a script error)
#   ./run.sh <environment>   run against an already-deployed environment instead (e.g. one you're
#                             iterating against) - this script never creates or tears down an
#                             environment you passed in explicitly, that's yours to manage
set -euo pipefail
cd "$(dirname "$0")"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="${script_dir}/.."
api_dir="${repo_root}/../mootmaker-api"
test_infra_dir="${repo_root}/../mootmaker-test-infra"

owns_environment=""
environment="${1:-}"

if [[ -z "${environment}" ]]; then
  echo "No environment given - creating a fresh one..." >&2
  environment="$("${test_infra_dir}/create-ephemeral-env.sh" web-e2e)"
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
    yes yes | "${test_infra_dir}/teardown-ephemeral-env.sh" "${environment}" || true
  fi
}
trap cleanup EXIT

echo "Running the e2e suite against '${environment}'..." >&2

# Populates GRAPHQL_API_URL, COGNITO_USER_POOL_ID, COGNITO_WEBAPP_CLIENT_ID, etc. - only the
# COGNITO_* ones are actually used here (support/cognitoAdmin.ts), but sourcing the whole thing is
# simpler and more robust than hand-picking outputs.
source "${api_dir}/authenticate.sh" "${environment}"

webapp_tf_data_dir="${repo_root}/deploy/terraform/.terraform-${environment}"
TF_DATA_DIR="${webapp_tf_data_dir}" terraform -chdir="${repo_root}/deploy/terraform" init \
  -backend-config=backend.hcl \
  -backend-config="key=${environment}/mootmaker-webapp/terraform.tfstate" \
  -input=false >/dev/null
export WEBAPP_URL="$(TF_DATA_DIR="${webapp_tf_data_dir}" terraform -chdir="${repo_root}/deploy/terraform" output -raw site_url)"

# The email pipeline is persistent/shared, owned by mootmaker-test-infra - not per environment or
# per frontend, so this is the same queue regardless of which webapp/API environment is under test.
terraform -chdir="${test_infra_dir}/deploy/terraform" init -backend-config=backend.hcl -input=false >/dev/null
export SQS_QUEUE_URL="$(terraform -chdir="${test_infra_dir}/deploy/terraform" output -raw sqs_queue_url)"

cd "${repo_root}"
npm run test:e2e
