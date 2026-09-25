import { Box, CircularProgress } from '@mui/material'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/authContext'

/**
 * Route guard: renders its child routes only for admin users, otherwise redirects home. Nested
 * inside RequireAuth (see App.tsx), so a signed-out visitor already gets the sign-in redirect
 * before this ever runs - this only has to distinguish admin from non-admin among the signed-in.
 *
 * A courtesy, not the enforcement - `isAdmin` comes from the ID token's custom:class claim for
 * presentation only (see authContext.ts), and every admin-only mutation re-checks on the backend
 * regardless of what this guard does. See the design doc's "No AppSync schema-level authorization
 * directives" decision for why the real boundary lives there, not here.
 */
export function RequireAdmin() {
  const { isAdmin, initialising } = useAuth()

  if (initialising) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }
  if (!isAdmin) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
