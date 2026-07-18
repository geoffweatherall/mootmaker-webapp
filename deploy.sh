#!/usr/bin/env bash
# Builds the React webapp and deploys it to AWS (S3 + CloudFront) via Terraform,
# into the given environment (e.g. "test", "production", or a developer's own
# name for a personal sandbox - see the mootmaker project README for the
# full multi-environment how-to). Talks to the mootmaker-api deployment of
# the SAME environment name in the sibling checkout.
# NOTE: `terraform apply -auto-approve` creates real AWS resources in whatever
# account/credentials are active. Run this deliberately, not from automation.
set -euo pipefail
cd "$(dirname "$0")"

environment="${1:-}"
if [[ -z "${environment}" ]]; then
  echo "Usage: ./deploy.sh <environment>   (e.g. test, production, or your own name)" >&2
  exit 1
fi
if [[ ! "${environment}" =~ ^[a-z0-9-]+$ ]]; then
  echo "environment must contain only lowercase letters, digits, and hyphens: '${environment}'" >&2
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
# other environments, so deploying "test" and "production" from the same
# checkout (even concurrently) can't cross-contaminate each other.
export TF_DATA_DIR=".terraform-${environment}"

terraform -chdir=deploy/terraform init -backend-config=backend.hcl -backend-config="key=${environment}/mootmaker-webapp/terraform.tfstate"
terraform -chdir=deploy/terraform apply -auto-approve -var="environment=${environment}"

site_bucket="$(terraform -chdir=deploy/terraform output -raw site_bucket_name)"
distribution_id="$(terraform -chdir=deploy/terraform output -raw cloudfront_distribution_id)"
site_url="$(terraform -chdir=deploy/terraform output -raw site_url)"

cat > webapp/.env.production <<EOF
VITE_GRAPHQL_API_URL=${GRAPHQL_API_URL}
VITE_COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID}
VITE_COGNITO_CLIENT_ID=${COGNITO_WEBAPP_CLIENT_ID}
VITE_DEMO_USER_EMAIL=${DEMO_USER_EMAIL}
VITE_DEMO_USER_PASSWORD=${DEMO_USER_PASSWORD}
EOF

npm --prefix webapp install
npm --prefix webapp run build

aws s3 sync webapp/dist "s3://${site_bucket}" --delete
aws cloudfront create-invalidation --distribution-id "${distribution_id}" --paths "/*" >/dev/null

echo "Deployed (${environment}): ${site_url}"
