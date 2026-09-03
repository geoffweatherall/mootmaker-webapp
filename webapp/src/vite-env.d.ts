/// <reference types="vite/client" />

// Deliberately NOT read via import.meta.env / ImportMetaEnv: those are substituted into the
// bundle at build time, which would tie one build to one environment. See mootmaker-webapp#3
// and mootmaker/designs/ci-cd-pipeline.md Decision 8 - the values below are read from a global
// that a small <script> (env-config.js, sibling to index.html) sets before main.tsx runs, so the
// same built bundle can be deployed to test then production unmodified. See src/config.ts for
// the typed accessor every other module should import instead of reading `window` directly.
interface MootmakerRuntimeConfig {
  readonly GRAPHQL_API_URL: string
  readonly COGNITO_USER_POOL_ID: string
  readonly COGNITO_CLIENT_ID: string
  // Optional: an environment not seeded with the demo user won't have these. HomePage degrades
  // gracefully when they're absent.
  readonly DEMO_USER_EMAIL?: string
  readonly DEMO_USER_PASSWORD?: string
}

interface Window {
  __MOOTMAKER_CONFIG__: MootmakerRuntimeConfig
}
