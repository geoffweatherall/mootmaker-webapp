#!/usr/bin/env node
// Local-dev-only counterpart to deploy.sh's dist/env-config.js generation - see
// src/vite-env.d.ts and mootmaker/designs/ci-cd-pipeline.md Decision 8. Reuses Vite's own
// loadEnv (same .env/.env.<mode> loading and precedence Vite itself would apply at build time)
// so `.env`/`.env.mock` stay the single source of local config values; this just repoints them
// at a runtime file instead of a compile-time substitution. Run via the predev/predev:mock npm
// hooks, never as part of `npm run build` - a release build must not have any environment's
// values baked in, see deploy.sh.
import { loadEnv } from 'vite'
import { writeFileSync } from 'node:fs'

const mode = process.argv[2] ?? 'development'
const env = loadEnv(mode, process.cwd(), 'VITE_')

const config = {
  GRAPHQL_API_URL: env.VITE_GRAPHQL_API_URL ?? '',
  COGNITO_USER_POOL_ID: env.VITE_COGNITO_USER_POOL_ID ?? '',
  COGNITO_CLIENT_ID: env.VITE_COGNITO_CLIENT_ID ?? '',
  DEMO_USER_EMAIL: env.VITE_DEMO_USER_EMAIL ?? '',
  DEMO_USER_PASSWORD: env.VITE_DEMO_USER_PASSWORD ?? '',
}

writeFileSync('public/env-config.js', `window.__MOOTMAKER_CONFIG__ = ${JSON.stringify(config, null, 2)}\n`)
