import { createContext, useContext } from 'react'

export interface AuthContextValue {
  /** Signed-in user's email, or null when signed out. Used to gate access, not for display. */
  email: string | null
  /** Signed-in user's display name (their name if set, otherwise their email), or null when signed out. */
  displayName: string | null
  /** The signed-in user's own linked Person id, or null when signed out or no linked Person exists. */
  personId: string | null
  /** True while checking for a linked Person after sign-in - distinguishes "still checking" from
   * "confirmed no linked Person exists" (personId null but personLoading false), since callers
   * must not treat those two states the same (e.g. by falling back to showing someone else's
   * data while the real answer is still in flight). */
  personLoading: boolean
  /** True until the initial session check completes on page load. */
  initialising: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used inside an AuthProvider')
  }
  return value
}
