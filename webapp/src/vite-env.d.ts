/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GRAPHQL_API_URL: string
  readonly VITE_COGNITO_USER_POOL_ID: string
  readonly VITE_COGNITO_CLIENT_ID: string
  // Optional: older .env files, or an environment not yet redeployed with the demo user,
  // won't have these. HomePage degrades gracefully when they're absent.
  readonly VITE_DEMO_USER_EMAIL?: string
  readonly VITE_DEMO_USER_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
