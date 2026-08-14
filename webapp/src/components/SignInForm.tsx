import { Stack, TextField } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/authContext'
import { ErrorBanner } from './ErrorBanner'
import { SubmitButton } from './SubmitButton'

interface SignInFormProps {
  /** Pre-fills the fields, e.g. with the publicly-known demo user's credentials. */
  defaultEmail?: string
  defaultPassword?: string
  onSuccess: () => void
}

/** The actual sign-in form, shared by SignInPage and the signed-out home page. */
export function SignInForm({ defaultEmail = '', defaultPassword = '', onSuccess }: SignInFormProps) {
  const { signIn } = useAuth()
  const [email, setEmail] = useState(defaultEmail)
  const [password, setPassword] = useState(defaultPassword)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      // On the signed-out home page this form sits below the hero, so on a short mobile screen
      // the user is scrolled down to reach it. Signing in swaps in a completely different
      // signed-in layout on the same "/" route (a client-side content swap, not a page
      // navigation), which the browser has no reason to scroll for on its own - without this,
      // the user would land wherever they happened to be scrolled to on the old page.
      window.scrollTo({ top: 0, behavior: 'smooth' })
      onSuccess()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed.')
      setLoading(false)
    }
  }

  return (
    <Stack spacing={2}>
      <ErrorBanner messages={error ? [error] : []} onDismiss={() => setError(null)} />
      <Stack component="form" spacing={2} onSubmit={handleSubmit} sx={{ alignItems: 'flex-start' }}>
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          fullWidth
        />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
          fullWidth
        />
        <SubmitButton loading={loading}>Sign in</SubmitButton>
      </Stack>
    </Stack>
  )
}
