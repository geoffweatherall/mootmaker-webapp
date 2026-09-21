import { Box, CircularProgress } from '@mui/material'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/authContext'

/**
 * Route guard: renders its child routes only for signed-in users, otherwise
 * redirects to the sign-in page (remembering where the user was heading).
 */
export function RequireAuth() {
  const { email, initialising } = useAuth()
  const location = useLocation()

  // Whether there's even a session to check hasn't resolved yet - not the same as "confirmed
  // signed out", which is what would otherwise send an already-signed-in user briefly through the
  // sign-in redirect below. A progress indicator, not a blank page, per the "centred
  // CircularProgress on first load" convention (README.md's "Progress indicators").
  if (initialising) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }
  if (!email) {
    return <Navigate to="/signin" state={{ from: location.pathname }} replace />
  }
  return <Outlet />
}
