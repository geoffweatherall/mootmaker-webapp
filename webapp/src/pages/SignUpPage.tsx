import { Link as MuiLink, Paper, Stack, TextField, Typography } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { confirmSignUp, signUp } from '../auth/cognito'
import { ErrorBanner } from '../components/ErrorBanner'
import { SubmitButton } from '../components/SubmitButton'

/**
 * Two-step sign-up: register a name, email + password, then enter the
 * verification code Cognito emails to that address. On success the user is
 * signed in automatically. The name is stored as a Cognito user attribute and
 * used by a PostConfirmation trigger to create a linked Person record once
 * the email is confirmed.
 */
export default function SignUpPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [step, setStep] = useState<'details' | 'confirm'>('details')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleDetailsSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await signUp(email.trim(), password, name.trim())
      setStep('confirm')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign up failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirmSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await confirmSignUp(email.trim(), code.trim())
      await signIn(email.trim(), password)
      navigate('/', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Confirmation failed.')
      setLoading(false)
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Sign Up
      </Typography>

      <ErrorBanner messages={error ? [error] : []} onDismiss={() => setError(null)} />

      {step === 'details' ? (
        <Paper sx={{ p: 3 }}>
          <Stack component="form" spacing={3} onSubmit={handleDetailsSubmit}>
            <TextField
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              autoFocus
              required
              fullWidth
            />
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
              autoComplete="new-password"
              helperText="At least 10 characters, with a lowercase letter and a number."
              required
              fullWidth
            />
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <SubmitButton loading={loading}>Sign up</SubmitButton>
              <Typography variant="body2">
                Already have an account?{' '}
                <MuiLink component={Link} to="/signin">
                  Sign in
                </MuiLink>
              </Typography>
            </Stack>
          </Stack>
        </Paper>
      ) : (
        <Paper sx={{ p: 3 }}>
          <Stack component="form" spacing={3} onSubmit={handleConfirmSubmit}>
            <Typography>
              We sent a verification code to <strong>{email.trim()}</strong>. Enter it below to
              finish creating your account.
            </Typography>
            <TextField
              label="Verification code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="one-time-code"
              autoFocus
              required
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <SubmitButton loading={loading}>Confirm</SubmitButton>
            </Stack>
          </Stack>
        </Paper>
      )}
    </Stack>
  )
}
