import { createContext, useContext } from 'react'
import type { DateFormat, TimeFormat } from '../graphql/formatDateTime'

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
  /** The signed-in viewer's own date format. Display only - the API always speaks ISO-8601.
   * Defaults to Iso when signed out, or while the linked Person is still being fetched, so
   * callers never have to handle a null format. */
  dateFormat: DateFormat
  /** The signed-in viewer's own time format, with the same defaulting as dateFormat. */
  timeFormat: TimeFormat
  /** True until the initial session check completes on page load. */
  initialising: boolean
  /** True if the signed-in user's class (from the ID token) is "admin". Presentation only - see
   * cognito.ts's currentUserClass() for why this is never the actual security boundary. */
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
  /** Re-reads the signed-in user's own Person record, e.g. after a self-rename, so the sidebar
   * reflects it immediately without a page refresh. */
  refreshPerson: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used inside an AuthProvider')
  }
  return value
}
