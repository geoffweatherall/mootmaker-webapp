import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js'

const userPool = new CognitoUserPool({
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
})

/**
 * Resolves the current user's session, or null when nobody is signed in or the
 * session can no longer be refreshed. getSession() transparently refreshes an
 * expired id token using the refresh token stored in localStorage.
 */
function currentSession(): Promise<CognitoUserSession | null> {
  const user = userPool.getCurrentUser()
  if (!user) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    user.getSession((error: Error | null, session: CognitoUserSession | null) => {
      resolve(error || !session?.isValid() ? null : session)
    })
  })
}

/** The signed-in user's id-token JWT, sent to AppSync in the Authorization header. */
export async function currentIdToken(): Promise<string | null> {
  const session = await currentSession()
  return session?.getIdToken().getJwtToken() ?? null
}

export async function currentUserEmail(): Promise<string | null> {
  const session = await currentSession()
  return (session?.getIdToken().payload.email as string | undefined) ?? null
}

/** The signed-in user's name, or null if unset (e.g. accounts created before sign-up collected it). */
export async function currentUserName(): Promise<string | null> {
  const session = await currentSession()
  return (session?.getIdToken().payload.name as string | undefined) ?? null
}

export function signIn(email: string, password: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: userPool })
  return new Promise((resolve, reject) => {
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: () => resolve(),
      onFailure: reject,
      newPasswordRequired: () =>
        reject(new Error('A password change is required for this account.')),
    })
  })
}

export function signUp(email: string, password: string, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    userPool.signUp(
      email,
      password,
      [
        new CognitoUserAttribute({ Name: 'email', Value: email }),
        new CognitoUserAttribute({ Name: 'name', Value: name }),
      ],
      [],
      (error) => (error ? reject(error) : resolve()),
    )
  })
}

/** Completes sign-up with the verification code Cognito emails to the new user. */
export function confirmSignUp(email: string, code: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: userPool })
  return new Promise((resolve, reject) => {
    user.confirmRegistration(code, true, (error) => (error ? reject(error) : resolve()))
  })
}

/** Starts a password reset: Cognito emails a verification code to the user. */
export function forgotPassword(email: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: userPool })
  return new Promise((resolve, reject) => {
    user.forgotPassword({
      // Called once the code has been sent; the UI collects it in the next step.
      inputVerificationCode: () => resolve(),
      onSuccess: () => resolve(),
      onFailure: reject,
    })
  })
}

/** Completes a password reset with the emailed code and the user's new password. */
export function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: userPool })
  return new Promise((resolve, reject) => {
    user.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: reject,
    })
  })
}

export function signOut(): void {
  userPool.getCurrentUser()?.signOut()
}
