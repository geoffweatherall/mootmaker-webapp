import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ApolloProvider } from '@apollo/client/react'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { BrowserRouter } from 'react-router-dom'
// Self-hosted (via @fontsource, not a Google Fonts CDN link) so the app has no external font
// request at runtime - see theme/theme.ts for where these are wired into the MUI typography
// scale. Inter carries body/UI text; Outfit (geometric, rounded terminals - matches the logo's
// own flat rounded shape language, see mootmaker/branding/README.md) carries headings.
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import '@fontsource/outfit/700.css'
import '@fontsource/outfit/800.css'
import { apolloClient } from './apolloClient.ts'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { ThemeModeProvider } from './theme/ThemeModeProvider.tsx'
import App from './App.tsx'

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ApolloProvider client={apolloClient}>
        <ThemeModeProvider>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <AuthProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </AuthProvider>
          </LocalizationProvider>
        </ThemeModeProvider>
      </ApolloProvider>
    </StrictMode>,
  )
}

// Only true for the Playwright suite's dev server (`vite --mode mock`, see playwright.config.ts) -
// `import.meta.env.MODE` is a compile-time constant Vite/Rollup dead-code-eliminates in a normal
// build, so this branch (and the MSW module it dynamically imports) never reaches a real bundle.
// See testing-strategy.md's "Integration tests against a mocked API" section: MSW intercepts the
// app's real network calls rather than replacing Apollo Client's internals.
if (import.meta.env.MODE === 'mock') {
  const { worker } = await import('./testSupport/mocks/browser.ts')
  await worker.start({ onUnhandledRequest: 'bypass' })
}

renderApp()
