// Test-only double for cognito.ts, swapped in for the Playwright suite's "mock" dev-server mode
// (see vite.config.ts's `resolve.alias`, active for `vite --mode mock`) - never bundled into a
// real build. Cognito's SRP sign-in exchange is genuinely cryptographic and isn't reasonably
// fakeable at the network layer the way a JSON GraphQL API is (see testing-strategy.md), so the
// swap happens here instead - at the same application boundary (auth/cognito.ts +
// auth/AuthProvider.tsx) that already funnels every Cognito interaction through one place.
// AuthProvider.tsx itself is untouched: it still imports "./cognito" and calls the same functions
// with the same signatures, so its own orchestration logic (loadSession, refreshPerson, sign
// in/out state) is exercised for real, only what it eventually delegates to is fake.
//
// Session state is persisted to localStorage (like a real Cognito session's cached tokens) so
// Playwright's `storageState` mechanism - which snapshots localStorage - can carry a signed-in
// mock session from the `setup` project into the tests that reuse it, exactly the way the
// previous live-API suite carried a real Cognito session between the same two projects.

const STORAGE_KEY = 'mootmaker-mock-auth-session'

export interface MockUser {
  email: string
  password: string
  name: string
  userClass: 'standard' | 'admin'
}

// A small fixed directory of fixture accounts, intentionally not configurable per test, so every
// test that needs "a signed-in user" reaches for the same well-known accounts rather than
// scattering ad hoc credentials across spec files. `password` is mutated in place by a successful
// confirmForgotPassword, matching a real account's password actually changing.
//
// E2E_USER has no linked Person (see fixtures.ts's `linkedPersonByEmail`) - mirroring the real
// e2e test user's Terraform-provisioned account, which webapp/tests/*.spec.ts and
// README.md's "Organiser/attendee mutual exclusivity" section rely on to keep the
// organiser-defaulting effect from firing. DEMO_USER *does* have a linked Person - it's the
// account calendar-menu.spec.ts's "once personId resolves" tests need, and whose credentials are
// shown/pre-filled on the signed-out home page (see .env.mock's VITE_DEMO_USER_EMAIL/PASSWORD,
// which must match this record).
export const MOCK_USERS: MockUser[] = [
  { email: 'e2e-user@example.com', password: 'Mock-password-1', name: 'E2E Test User', userClass: 'standard' },
  { email: 'demo@example.com', password: 'Demo-password-1', name: 'Demo User', userClass: 'standard' },
]

export const E2E_USER = MOCK_USERS[0]
export const DEMO_USER = MOCK_USERS[1]

// The verification code every mock sign-up/reset flow accepts - there's no real inbox to read a
// code from, so this stands in for "the code Cognito emailed". The real API's own
// ephemeral-environment tests instead read a genuinely emailed code (see
// mootmaker/testing-strategy.md's "Reading Cognito's emails in tests") - this mock never needed
// that at all, since it never talks to real Cognito in the first place.
export const MOCK_VERIFICATION_CODE = '111111'

interface StoredSession {
  email: string
}

function readSession(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredSession
  } catch {
    return null
  }
}

function writeSession(session: StoredSession | null): void {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

function findUser(email: string): MockUser | undefined {
  return MOCK_USERS.find((user) => user.email.toLowerCase() === email.trim().toLowerCase())
}

/** The signed-in user's id-token, sent to AppSync in the Authorization header - see
 * apolloClient.ts. Not a real JWT: MSW's handlers (src/testSupport/mocks/handlers.ts) only read
 * the email out of it to resolve `myPerson`, they never verify a signature - the same
 * authorization boundary (a token is present or it isn't) RequireAuth/AppSync enforce for real. */
export async function currentIdToken(): Promise<string | null> {
  const session = readSession()
  return session ? `mock-id-token.${session.email}` : null
}

export async function currentUserEmail(): Promise<string | null> {
  return readSession()?.email ?? null
}

export async function currentUserName(): Promise<string | null> {
  const session = readSession()
  return session ? (findUser(session.email)?.name ?? null) : null
}

export async function currentUserClass(): Promise<string | null> {
  const session = readSession()
  return session ? (findUser(session.email)?.userClass ?? null) : null
}

export function signIn(email: string, password: string): Promise<void> {
  const user = findUser(email)
  if (!user || user.password !== password) {
    // Mirrors the message Cognito's own InitiateAuth returns for bad credentials - SignInForm
    // surfaces this text directly in ErrorBanner, and auth.spec.ts asserts an alert appears.
    return Promise.reject(new Error('Incorrect username or password.'))
  }
  writeSession({ email: user.email })
  return Promise.resolve()
}

export function signUp(): Promise<void> {
  // Not needed by any test in webapp/tests/ today (see README.md's Tests section) - rejecting
  // explicitly rather than silently pretending to succeed keeps that gap honest instead of
  // masking it as working. Extend this (and MOCK_USERS) if a sign-up flow test is added later.
  return Promise.reject(new Error('Sign-up is not supported in this mocked test environment.'))
}

export function confirmSignUp(): Promise<void> {
  return Promise.reject(new Error('Sign-up is not supported in this mocked test environment.'))
}

/** Starts a mock password reset. Always resolves regardless of whether `email` matches a known
 * account, mirroring Cognito's own *prevent user existence errors* setting (see README.md's
 * Authentication section) - the real behaviour this stands in for reveals nothing either. */
export function forgotPassword(): Promise<void> {
  return Promise.resolve()
}

/** Completes a mock password reset. `code` must equal MOCK_VERIFICATION_CODE - anything else is
 * rejected the same way a real wrong/expired code is, without revealing whether `email` has an
 * account (see forgotPassword above). */
export function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  if (code !== MOCK_VERIFICATION_CODE) {
    return Promise.reject(new Error('Invalid verification code provided, please try again.'))
  }
  const user = findUser(email)
  if (!user) {
    return Promise.reject(new Error('Invalid verification code provided, please try again.'))
  }
  user.password = newPassword
  writeSession({ email: user.email })
  return Promise.resolve()
}

export function signOut(): void {
  writeSession(null)
}
