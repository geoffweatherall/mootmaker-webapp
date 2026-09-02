#!/usr/bin/env bash
# Refuses to deploy the webapp against an API that does not serve the schema this build was
# compiled against.
#
# Why this exists (mootmaker/designs/graphql-schema-sharing.md, Decision 8): the webapp and the API
# deploy independently, so building successfully proves only that the webapp COMPILES against a
# schema - not that the target environment SERVES it. This is not hypothetical. During
# date-time-format-settings, mootmaker-webapp#10 was merged before mootmaker-api#8, so the webapp's
# myPerson query selected dateFormat/timeFormat before the deployed schema had them. AuthProvider
# runs that query on load, so the result would have been a broken sign-in rather than a degraded
# page.
#
# Compares the fields the built webapp's own operations require against the deployed schema, by
# introspection. Reports every missing field rather than the first, so one run tells you the whole
# gap.
#
# Usage: ./deploy/verify-schema-compatibility.sh <graphql-api-url> <access-token> <schema-file>
set -euo pipefail

api_url="${1:?usage: verify-schema-compatibility.sh <graphql-api-url> <access-token> <schema-file>}"
access_token="${2:?}"
schema_file="${3:?}"

if [[ ! -f "${schema_file}" ]]; then
  echo "Schema file not found: ${schema_file}" >&2
  exit 1
fi
# Resolved before anything cd's, so a relative path given on the command line still works.
schema_file="$(cd "$(dirname "${schema_file}")" && pwd)/$(basename "${schema_file}")"

echo "Verifying the deployed API serves the schema this build was compiled against..." >&2

introspection='{"query":"query { __schema { types { name fields { name } inputFields { name } } } }"}'
deployed="$(curl -sS -X POST "${api_url}" \
  -H 'Content-Type: application/json' \
  -H "Authorization: ${access_token}" \
  -d "${introspection}")"

if ! echo "${deployed}" | jq -e '.data.__schema' >/dev/null 2>&1; then
  echo "Could not introspect ${api_url}. Response:" >&2
  echo "${deployed}" | head -c 2000 >&2
  exit 1
fi

# type.field pairs the deployed API actually exposes.
echo "${deployed}" | jq -r '
  .data.__schema.types[]
  | .name as $t
  | ((.fields // []) + (.inputFields // []))[]?
  | "\($t).\(.name)"
' | LC_ALL=C sort -u > /tmp/deployed-fields.$$

# type.field pairs the schema this build was compiled against declares. Parsed with graphql-js
# (already a webapp dependency) rather than by regex, so it understands the real grammar rather
# than approximating it.
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
(cd "${script_dir}/webapp" && node -e "
  const { readFileSync } = require('node:fs')
  const { buildSchema } = require('graphql')
  const schema = buildSchema(readFileSync(process.argv[1], 'utf8'))
  const out = []
  for (const type of Object.values(schema.getTypeMap())) {
    if (type.name.startsWith('__')) continue
    const fields = typeof type.getFields === 'function' ? type.getFields() : {}
    for (const field of Object.keys(fields)) out.push(type.name + '.' + field)
  }
  console.log(out.sort().join('\n'))
" "${schema_file}") | LC_ALL=C sort -u > /tmp/expected-fields.$$

# LC_ALL=C on both sides deliberately: GNU sort uses locale collation while node's Array.sort
# uses code-point order, and comm silently produces nonsense when its two inputs disagree about
# ordering. Testing this against the real production API is what caught it - the mismatch reported
# every field as missing, which would have blocked every deploy.
missing="$(LC_ALL=C comm -23 /tmp/expected-fields.$$ /tmp/deployed-fields.$$ || true)"
rm -f /tmp/deployed-fields.$$ /tmp/expected-fields.$$

if [[ -n "${missing}" ]]; then
  echo "" >&2
  echo "REFUSING TO DEPLOY: the API at ${api_url} does not serve every field this build expects." >&2
  echo "" >&2
  echo "Missing from the deployed schema:" >&2
  echo "${missing}" | sed 's/^/  /' >&2
  echo "" >&2
  echo "Deploy mootmaker-api to this environment first - the webapp would sign users in against a" >&2
  echo "schema that cannot answer its queries." >&2
  exit 1
fi

echo "Deployed schema is compatible." >&2
