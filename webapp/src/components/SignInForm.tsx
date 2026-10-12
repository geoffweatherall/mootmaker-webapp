import { Button, Stack, TextField, Typography } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/authContext'
import { confirmSignUp, resendConfirmationCode } from '../auth/cognito'
import { saysNotConfirmed } from '../auth/signUpErrors'
import { ErrorBanner } from './ErrorBanner'
import { SubmitButton } from './SubmitButton'

interface SignInFormProps {
  /** Pre-fills the fields, e.g. with the publicly-known demo user's credentials. */
  defaultEmail?: string
  defaultPassword?: string
  onSuccess: () => void
}

/**
 * The actual sign-in form, shared by SignInPage and the signed-out home page.
 *
 * Someone who signed up and left before entering the emailed code has an account Cognito will not
 * sign in until it is confirmed. Instead of a dead end, the form then asks for that code, can send
 * a new one, and signs in with the password already entered (use case 150).
 */
export function SignInForm({ defaultEmail = '', defaultPassword = '', onSuccess }: SignInFormProps) {
  const { signIn } = useAuth()
  const [email, setEmail] = useState(defaultEmail)
  const [password, setPassword] = useState(defaultPassword)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  async function finishSignIn() {
    await signIn(email.trim(), password)
    // On the signed-out home page this form can sit below other content, so a phone user may be
    // scrolled down to reach it. Signing in swaps in the signed-in layout on the same "/" route
    // (a content swap, not a navigation), which the browser has no reason to scroll for.
    window.scrollTo({ top: 0, behavior: 'smooth' })
    onSuccess()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await finishSignIn()
    } catch (cause) {
      if (saysNotConfirmed(cause as { name?: string; code?: string })) {
        setUnconfirmed(true)
      } else {
        setError(cause instanceof Error ? cause.message : 'Sign in failed.')
      }
      setLoading(false)
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await confirmSignUp(email.trim(), code.trim())
      await finishSignIn()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Confirmation failed.')
      setLoading(false)
    }
  }

  async function handleResend() {
    setSending(true)
    setError(null)
    try {
      await resendConfirmationCode(email.trim())
      setCodeSent(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send a new code.')
    } finally {
      setSending(false)
    }
  }

  if (unconfirmed) {
    return (
      <Stack spacing={2}>
        <ErrorBanner messages={error ? [error] : []} onDismiss={() => setError(null)} />
        <Stack component="form" spacing={2} onSubmit={handleConfirm} sx={{ alignItems: 'flex-start' }}>
          <Typography>
            This account hasn&apos;t been confirmed yet. Enter the verification code we emailed to{' '}
            <strong>{email.trim()}</strong>, or send a new one.
          </Typography>
          {codeSent && (
            <Typography color="text.secondary">We&apos;ve sent a new code. It can take a minute to arrive.</Typography>
          )}
          <TextField
            label="Verification code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="one-time-code"
            autoFocus
            required
            fullWidth
          />
          <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <SubmitButton loading={loading} hasError={error !== null}>
              Confirm
            </SubmitButton>
            <Button onClick={handleResend} disabled={sending}>
              Send a new code
            </Button>
          </Stack>
        </Stack>
      </Stack>
    )
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
        <SubmitButton loading={loading} hasError={error !== null}>
          Sign in
        </SubmitButton>
      </Stack>
    </Stack>
  )
}
