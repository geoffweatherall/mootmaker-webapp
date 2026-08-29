#!/usr/bin/env bash
# Destroys all AWS resources created by deploy.sh for the given environment:
# the CloudFront distribution and the S3 bucket (including all deployed
# webapp assets).
#
# NOTE: this is DESTRUCTIVE and IRREVERSIBLE. Terraform will prompt for interactive confirmation
# before deleting anything; this script intentionally does not pass -auto-approve.
set -euo pipefail
cd "$(dirname "$0")"

environment="${1:-}"
if [[ -z "${environment}" ]]; then
  echo "Usage: ./undeploy.sh <environment>   (e.g. an ephemeral name, or production)" >&2
  exit 1
fi
# See deploy.sh for why anything starting with "prod" but not exactly
# "production" is refused outright.
if [[ "${environment}" == prod* && "${environment}" != "production" ]]; then
  echo "environment '${environment}' starts with 'prod' but isn't exactly 'production' - refusing, to avoid confusion with the real production environment." >&2
  exit 1
fi

echo "Undeploying mootmaker-webapp environment '${environment}'..."

export TF_DATA_DIR=".terraform-${environment}"

terraform -chdir=deploy/terraform init -backend-config=backend.hcl -backend-config="key=${environment}/mootmaker-webapp/terraform.tfstate"
terraform -chdir=deploy/terraform destroy -var="environment=${environment}"
