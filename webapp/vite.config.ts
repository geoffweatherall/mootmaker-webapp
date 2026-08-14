import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // The Playwright suite (webapp/tests/) runs its dev server as `vite --mode mock` (see
  // playwright.config.ts's webServer.command) so it needs no live AWS environment, deployed API,
  // or real Cognito user - see testing-strategy.md's "Integration tests against a mocked API"
  // section. This swaps out only the one module that actually talks to Cognito
  // (auth/cognito.ts -> auth/cognito.mock.ts) - AuthProvider itself, every page component, and
  // Apollo's HttpLink/SetContextLink are untouched, so the app still exercises its real auth-
  // context wiring and its real GraphQL transport (intercepted at the network layer by MSW - see
  // main.tsx and src/testSupport/mocks/) exactly as it does in production.
  const isMock = mode === 'mock'

  return {
    plugins: [react()],
    define: {
      // amazon-cognito-identity-js pulls in the Node `buffer` package, which
      // references the Node-only `global`; map it to the browser equivalent.
      global: 'globalThis',
    },
    resolve: isMock
      ? {
          alias: [
            // Matches every specifier form webapp/src actually uses to import cognito.ts:
            // relatively from within auth/ itself (AuthProvider.tsx), from pages/
            // (SignUpPage.tsx, ForgotPasswordPage.tsx), and from the top-level src/
            // (apolloClient.ts's SetContextLink, which reads currentIdToken()).
            { find: './cognito', replacement: path.resolve(dirname, 'src/auth/cognito.mock.ts') },
            { find: '../auth/cognito', replacement: path.resolve(dirname, 'src/auth/cognito.mock.ts') },
            { find: './auth/cognito', replacement: path.resolve(dirname, 'src/auth/cognito.mock.ts') },
          ],
        }
      : undefined,
  }
})
