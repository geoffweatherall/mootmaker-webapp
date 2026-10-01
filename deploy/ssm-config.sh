# Shared by deploy.sh, acceptance/run.sh and e2e/run.sh: looks up an environment's configuration in
# SSM Parameter Store, where each component publishes what it owns (mootmaker-api#94). Sourced by
# those scripts only - it defines functions and changes nothing on its own. Needs AWS credentials
# that can read /mootmaker/<environment>/* and /mootmaker/email-testing/*.

# Prints one parameter's value, decrypting SecureStrings. Exits with a clear message if it is
# missing, which almost always means the environment (or the component that publishes it) has not
# been deployed.
ssm_value() {
  local name="$1" value
  if ! value="$(aws ssm get-parameter --name "${name}" --with-decryption --query Parameter.Value --output text 2>&1)"; then
    echo "Could not read SSM parameter ${name} - has the component that publishes it been deployed to this environment?" >&2
    echo "${value}" >&2
    exit 1
  fi
  printf '%s' "${value}"
}

# Like ssm_value, but prints nothing (and succeeds) if the parameter does not exist.
ssm_value_optional() {
  aws ssm get-parameter --name "$1" --with-decryption --query Parameter.Value --output text 2>/dev/null || true
}

# Exports what the webapp's deploy needs from mootmaker-api: endpoint, Cognito ids, the demo
# credentials shown on the home page, and the machine-to-machine client used to check the deployed
# schema before deploying.
export_api_deploy_config() {
  local api="/mootmaker/$1/api"
  GRAPHQL_API_URL="$(ssm_value "${api}/graphql-url")"
  COGNITO_USER_POOL_ID="$(ssm_value "${api}/cognito/user-pool-id")"
  COGNITO_WEBAPP_CLIENT_ID="$(ssm_value "${api}/cognito/webapp-client-id")"
  DEMO_USER_EMAIL="$(ssm_value "${api}/demo-user/email")"
  DEMO_USER_PASSWORD="$(ssm_value "${api}/demo-user/password")"
  COGNITO_TOKEN_URL="$(ssm_value "${api}/m2m-client/token-url")"
  COGNITO_TEST_CLIENT_ID="$(ssm_value "${api}/m2m-client/client-id")"
  COGNITO_TEST_CLIENT_SECRET="$(ssm_value "${api}/m2m-client/client-secret")"
  COGNITO_TEST_SCOPE="$(ssm_value "${api}/m2m-client/scope")"
  export GRAPHQL_API_URL COGNITO_USER_POOL_ID COGNITO_WEBAPP_CLIENT_ID DEMO_USER_EMAIL DEMO_USER_PASSWORD \
    COGNITO_TOKEN_URL COGNITO_TEST_CLIENT_ID COGNITO_TEST_CLIENT_SECRET COGNITO_TEST_SCOPE
}

# Exports everything the e2e and acceptance suites need: the deploy config above, plus the site
# URL, the shared email queue, the database-reset function, and the test fixture users (admin,
# standard and no-person - see mootmaker-api's README, "Test fixture users"). Fixtures exist in
# ephemeral environments only, which is the only kind these suites run against.
export_test_config() {
  local environment="$1" api="/mootmaker/$1/api"
  export_api_deploy_config "${environment}"
  AWS_REGION="$(ssm_value "${api}/region")"
  WEBAPP_URL="$(ssm_value "/mootmaker/${environment}/webapp/site-url")"
  SQS_QUEUE_URL="$(ssm_value /mootmaker/email-testing/sqs-queue-url)"
  DATABASE_RESET_FUNCTION_NAME="$(ssm_value "${api}/database-reset/function-name")"
  E2E_ADMIN_USER_EMAIL="$(ssm_value "${api}/test-fixtures/users/admin/email")"
  E2E_ADMIN_USER_PASSWORD="$(ssm_value "${api}/test-fixtures/users/admin/password")"
  E2E_STANDARD_USER_EMAIL="$(ssm_value "${api}/test-fixtures/users/standard/email")"
  E2E_STANDARD_USER_PASSWORD="$(ssm_value "${api}/test-fixtures/users/standard/password")"
  E2E_NO_PERSON_USER_EMAIL="$(ssm_value "${api}/test-fixtures/users/no-person/email")"
  E2E_NO_PERSON_USER_PASSWORD="$(ssm_value "${api}/test-fixtures/users/no-person/password")"
  export AWS_REGION WEBAPP_URL SQS_QUEUE_URL DATABASE_RESET_FUNCTION_NAME \
    E2E_ADMIN_USER_EMAIL E2E_ADMIN_USER_PASSWORD E2E_STANDARD_USER_EMAIL E2E_STANDARD_USER_PASSWORD \
    E2E_NO_PERSON_USER_EMAIL E2E_NO_PERSON_USER_PASSWORD
}
