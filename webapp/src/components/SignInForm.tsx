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
      onSuccess()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign in failed.')
      setLoading(false)
    }
  }

  return (
    <Stack spacing={2}>
      <ErrorBanner messages={error ? [error] : []} onDismiss={() => setError(null)} />
      <Stack component="form" spacing={2} onSubmit={handleSubmit}>
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
