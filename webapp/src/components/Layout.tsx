import { AppBar, Box, Button, Container, IconButton, Toolbar, Typography } from '@mui/material'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import LightModeIcon from '@mui/icons-material/LightMode'
import dayjs from 'dayjs'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { useThemeMode } from '../theme/themeModeContext'
import logo from '../assets/logo.svg'

const AVAILABILITY_PATH_PATTERN = /^\/rooms\/[^/]+\/availability$/
const CALENDAR_PATH_PATTERN = /^\/persons\/[^/]+\/calendar$/

function navButtonSx(isActive: boolean) {
  return {
    fontWeight: isActive ? 700 : 400,
    borderBottom: isActive ? '2px solid currentColor' : '2px solid transparent',
    borderRadius: 0,
  }
}

export function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { email, displayName, personId, signOut } = useAuth()
  const { mode, toggleMode } = useThemeMode()

  // The "Calendar" nav item goes straight to the signed-in user's own linked Person. If there
  // isn't one (e.g. the demo user, or the e2e test user), it's disabled rather than falling back
  // to showing some other person's calendar.

  function handleSignOut() {
    signOut()
    navigate('/')
  }

  const todayAvailabilityPath = `/rooms/${dayjs().format('YYYY-MM-DD')}/availability`
  const isHomeActive = pathname === '/'
  const isAvailabilityActive = AVAILABILITY_PATH_PATTERN.test(pathname) || pathname === '/rooms/add'
  const isCalendarActive = CALENDAR_PATH_PATTERN.test(pathname)

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Box component="img" src={logo} alt="" sx={{ width: 32, height: 32, mr: 1.5 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Room Booking
          </Typography>
          <Box component="nav" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Button component={Link} to="/" color="inherit" sx={navButtonSx(isHomeActive)}>
              Home
            </Button>
            <Button
              component={Link}
              to={todayAvailabilityPath}
              color="inherit"
              sx={navButtonSx(isAvailabilityActive)}
            >
              Availability
            </Button>
            {personId ? (
              <Button
                component={Link}
                to={`/persons/${personId}/calendar`}
                color="inherit"
                sx={navButtonSx(isCalendarActive)}
              >
                Calendar
              </Button>
            ) : (
              <Button color="inherit" disabled sx={navButtonSx(false)}>
                Calendar
              </Button>
            )}
            {email ? (
              <>
                <Typography variant="body2" sx={{ ml: 2, opacity: 0.8 }}>
                  {displayName}
                </Typography>
                <Button color="inherit" onClick={handleSignOut}>
                  Sign out
                </Button>
              </>
            ) : (
              <Button color="inherit" component={Link} to="/signin" sx={{ ml: 2 }}>
                Sign in
              </Button>
            )}
            <IconButton
              color="inherit"
              onClick={toggleMode}
              aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              sx={{ ml: 1 }}
            >
              {mode === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </>
  )
}
