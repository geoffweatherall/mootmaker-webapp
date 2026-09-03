#!/usr/bin/env bash
# Builds the React webapp and deploys it to AWS (S3 + CloudFront) via Terraform,
# into the given environment (e.g. an ephemeral name, "production", or a developer's own
# name for a personal sandbox - see the mootmaker project README for the
# full multi-environment how-to). Talks to the mootmaker-api deployment of
# the SAME environment name in the sibling checkout.
# NOTE: `terraform apply -auto-approve` creates real AWS resources in whatever
# account/credentials are active. Run this deliberately, not from automation.
#
# --skip-build deploys the webapp/dist/ that is already present instead of reinstalling,
# regenerating and rebuilding it. This is what makes Decision 8 of
# mootmaker/designs/ci-cd-pipeline.md ("build once, promote the same artifact") actually true:
# the release pipeline builds dist/ once, then deploys those identical files to test and then
# production. What is deliberately NOT skipped is everything environment-specific - the schema
# compatibility check against the target API, the env-config.js written after the build, and the
# S3 sync and CloudFront invalidation. That split is the whole point: one build, per-environment
# configuration applied at deploy time. Not useful interactively - omit it and this script
# behaves as it always has.
set -euo pipefail
cd "$(dirname "$0")"

skip_build=0
args=()
for arg in "$@"; do
  if [[ "${arg}" == "--skip-build" ]]; then
    skip_build=1
  else
    args+=("${arg}")
  fi
done
set -- "${args[@]+"${args[@]}"}"

environment="${1:-}"
if [[ -z "${environment}" ]]; then
  echo "Usage: ./deploy.sh <environment>   (e.g. an ephemeral name, or production)" >&2
  exit 1
fi
if [[ ! "${environment}" =~ ^[a-z0-9-]+$ ]]; then
  echo "environment must contain only lowercase letters, digits, and hyphens: '${environment}'" >&2
  exit 1
fi
# "production" deploys to www.mootmaker.com (see deploy/terraform/domain.tf);
# every other environment gets www.<environment>.mootmaker.com. Anything
# starting with "prod" but not exactly "production" is refused outright,
# rather than silently deploying to a subdomain that looks production-like
# but isn't.
if [[ "${environment}" == prod* && "${environment}" != "production" ]]; then
  echo "environment '${environment}' starts with 'prod' but isn't exactly 'production' - refusing, to avoid confusion with the real production environment." >&2
  exit 1
fi

echo "Deploying mootmaker-webapp to '${environment}'..."

api_dir="../mootmaker-api"
if [[ ! -f "${api_dir}/authenticate.sh" ]]; then
  echo "Expected to find the mootmaker-api checkout at ${api_dir} (as a sibling of this directory)." >&2
  exit 1
fi

# Populates GRAPHQL_API_URL, the COGNITO_* variables, and the DEMO_* demo-user
# credentials from the deployed API's Terraform outputs for this same environment.
source "${api_dir}/authenticate.sh" "${environment}"

# Isolates this environment's Terraform provider cache/backend pointer from
# other environments, so deploying two different environments from the same
# checkout (even concurrently) can't cross-contaminate each other.
export TF_DATA_DIR=".terraform-${environment}"

terraform -chdir=deploy/terraform init -backend-config=backend.hcl -backend-config="key=${environment}/mootmaker-webapp/terraform.tfstate"
terraform -chdir=deploy/terraform apply -auto-approve -var="environment=${environment}"

site_bucket="$(terraform -chdir=deploy/terraform output -raw site_bucket_name)"
distribution_id="$(terraform -chdir=deploy/terraform output -raw cloudfront_distribution_id)"
site_url="$(terraform -chdir=deploy/terraform output -raw site_url)"

if [[ "${skip_build}" == "1" ]]; then
  if [[ ! -d webapp/dist ]]; then
    echo "--skip-build given but webapp/dist does not exist - nothing to deploy." >&2
    exit 1
  fi
  echo "Skipping install/codegen/build; deploying the existing webapp/dist."
else
  npm --prefix webapp install

  # Regenerate from the schema this build will actually be compiled against, rather than trusting
  # whatever is committed. See mootmaker/designs/graphql-schema-sharing.md.
  npm --prefix webapp run codegen
fi

# Refuse to deploy against an API that does not serve the schema this build expects - two
# independent pipelines have no ordering guarantee, and compiling proves only that the webapp
# agrees with a schema, not that the target environment serves it. See Decision 8.
schema_access_token="$(curl -sS -X POST "${COGNITO_TOKEN_URL}" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=client_credentials&client_id=${COGNITO_TEST_CLIENT_ID}&client_secret=${COGNITO_TEST_CLIENT_SECRET}&scope=${COGNITO_TEST_SCOPE}" \
  | jq -r .access_token)"
./deploy/verify-schema-compatibility.sh "${GRAPHQL_API_URL}" "${schema_access_token}" \
  "${api_dir}/api/mootmaker.graphql"

if [[ "${skip_build}" == "0" ]]; then
  npm --prefix webapp run build
fi

# Written AFTER the build, into dist/ directly, not as a Vite env file consumed at build time -
# this is what lets the exact same build be deployed to another environment unmodified (e.g.
# promoted from test to production without rebuilding). See webapp/src/vite-env.d.ts and
# mootmaker/designs/ci-cd-pipeline.md Decision 8. index.html loads this before main.tsx runs.
cat > webapp/dist/env-config.js <<EOF
window.__MOOTMAKER_CONFIG__ = {
  "GRAPHQL_API_URL": "${GRAPHQL_API_URL}",
  "COGNITO_USER_POOL_ID": "${COGNITO_USER_POOL_ID}",
  "COGNITO_CLIENT_ID": "${COGNITO_WEBAPP_CLIENT_ID}",
  "DEMO_USER_EMAIL": "${DEMO_USER_EMAIL}",
  "DEMO_USER_PASSWORD": "${DEMO_USER_PASSWORD}"
}
EOF

aws s3 sync webapp/dist "s3://${site_bucket}" --delete
aws cloudfront create-invalidation --distribution-id "${distribution_id}" --paths "/*" >/dev/null

echo "Deployed (${environment}): ${site_url}"
