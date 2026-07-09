import { AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'

const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Persons', to: '/persons' },
  { label: 'Rooms', to: '/rooms' },
  { label: 'Bookings', to: '/bookings' },
]

export function Layout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { email, displayName, signOut } = useAuth()

  function handleSignOut() {
    signOut()
    navigate('/')
  }

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Room Booking
          </Typography>
          <Box component="nav" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {navItems.map((item) => {
              const isActive = item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
              return (
                <Button
                  key={item.to}
                  component={Link}
                  to={item.to}
                  color="inherit"
                  sx={{
                    fontWeight: isActive ? 700 : 400,
                    borderBottom: isActive ? '2px solid currentColor' : '2px solid transparent',
                    borderRadius: 0,
                  }}
                >
                  {item.label}
                </Button>
              )
            })}
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
          </Box>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </>
  )
}
