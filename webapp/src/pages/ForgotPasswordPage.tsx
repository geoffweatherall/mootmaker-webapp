import { Link as MuiLink, Paper, Stack, TextField, Typography } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { confirmForgotPassword, forgotPassword } from '../auth/cognito'
import { ErrorBanner } from '../components/ErrorBanner'
import { SubmitButton } from '../components/SubmitButton'

/**
 * Two-step password reset: request a verification code for an email address,
 * then enter the emailed code with a new password. On success the user is
 * signed in with the new password automatically.
 */
export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const { signIn } = useAuth()
  const [step, setStep] = useState<'request' | 'reset'>('request')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRequestSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await forgotPassword(email.trim())
      setStep('reset')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to send a reset code.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResetSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await confirmForgotPassword(email.trim(), code.trim(), newPassword)
      await signIn(email.trim(), newPassword)
      navigate('/', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Password reset failed.')
      setLoading(false)
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Reset Password
      </Typography>

      <ErrorBanner messages={error ? [error] : []} onDismiss={() => setError(null)} />

      {step === 'request' ? (
        <Paper sx={{ p: 3 }}>
          <Stack component="form" spacing={3} onSubmit={handleRequestSubmit}>
            <Typography>
              Enter your email address and we will send you a verification code to reset your
              password.
            </Typography>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              autoFocus
              required
              fullWidth
            />
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <SubmitButton loading={loading}>Send code</SubmitButton>
              <Typography variant="body2">
                Remembered it?{' '}
                <MuiLink component={Link} to="/signin">
                  Sign in
                </MuiLink>
              </Typography>
            </Stack>
          </Stack>
        </Paper>
      ) : (
        <Paper sx={{ p: 3 }}>
          <Stack component="form" spacing={3} onSubmit={handleResetSubmit}>
            <Typography>
              We sent a verification code to <strong>{email.trim()}</strong>. Enter it below with
              your new password.
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
            <TextField
              label="New password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              helperText="At least 10 characters, with a lowercase letter and a number."
              required
              fullWidth
            />
            <Stack direction="row" spacing={2}>
              <SubmitButton loading={loading}>Reset password</SubmitButton>
            </Stack>
          </Stack>
        </Paper>
      )}
    </Stack>
  )
}
