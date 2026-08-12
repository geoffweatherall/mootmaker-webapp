import { Box, Link as MuiLink, Paper, Stack, Typography } from '@mui/material'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import signInHero from '../assets/signin-hero.svg'
import { SignInForm } from '../components/SignInForm'

export default function SignInPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // Where RequireAuth sent us from, so sign-in returns the user there.
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Box component="img" src={signInHero} alt="" sx={{ width: 120, flexShrink: 0 }} />
        <Typography variant="h4" component="h1">
          Sign In
        </Typography>
      </Stack>

      <Paper sx={{ p: 3 }}>
        <Stack spacing={3}>
          <SignInForm onSuccess={() => navigate(from, { replace: true })} />
          <Typography variant="body2">
            No account yet?{' '}
            <MuiLink component={Link} to="/signup">
              Sign up
            </MuiLink>
            {' · '}
            <MuiLink component={Link} to="/forgot-password">
              Forgot password?
            </MuiLink>
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  )
}
