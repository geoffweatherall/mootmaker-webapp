import { useEffect, useState, type ReactNode } from 'react'
import { apolloClient } from '../apolloClient'
import { MY_PERSON } from '../graphql/queries'
import type { Person } from '../graphql/types'
import { AuthContext } from './authContext'
import * as cognito from './cognito'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [personId, setPersonId] = useState<string | null>(null)
  const [personLoading, setPersonLoading] = useState(false)
  const [initialising, setInitialising] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  async function loadSession() {
    const [userEmail, name, userClass] = await Promise.all([
      cognito.currentUserEmail(),
      cognito.currentUserName(),
      cognito.currentUserClass(),
    ])
    setEmail(userEmail)
    setDisplayName(name ?? userEmail)
    setIsAdmin(userClass === 'admin')
    // The Person record is the source of truth for the display name (it's what the Settings
    // page's "Your name" section updates), but it may not exist yet - e.g. the PostConfirmation
    // trigger that creates it hasn't caught up, or this account predates automatic Person
    // creation - so the Cognito-derived name/email set above is what shows until/unless this
    // resolves.
    if (userEmail) {
      refreshPerson()
    }
  }

  function refreshPerson() {
    setPersonLoading(true)
    apolloClient
      .query<{ myPerson: Person | null }>({ query: MY_PERSON, fetchPolicy: 'network-only' })
      .then(({ data }) => {
        if (data?.myPerson) {
          setDisplayName(data.myPerson.name)
          setPersonId(data.myPerson.id)
        }
      })
      .catch(() => {
        // Keep the Cognito-derived displayName set in loadSession() as a fallback.
      })
      .finally(() => setPersonLoading(false))
  }

  useEffect(() => {
    loadSession().then(() => setInitialising(false))
  }, [])

  async function signIn(userEmail: string, password: string) {
    await cognito.signIn(userEmail, password)
    await loadSession()
  }

  function signOut() {
    cognito.signOut()
    setEmail(null)
    setDisplayName(null)
    setPersonId(null)
    setPersonLoading(false)
    setIsAdmin(false)
    apolloClient.clearStore() // don't keep the signed-out user's data cached
  }

  return (
    <AuthContext.Provider
      value={{ email, displayName, personId, personLoading, initialising, isAdmin, signIn, signOut, refreshPerson }}
    >
      {children}
    </AuthContext.Provider>
  )
}
