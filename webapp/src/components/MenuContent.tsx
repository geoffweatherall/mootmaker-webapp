import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded'
import FeedbackRoundedIcon from '@mui/icons-material/FeedbackRounded'
import HomeRoundedIcon from '@mui/icons-material/HomeRounded'
import InfoRoundedIcon from '@mui/icons-material/InfoRounded'
import LoginRoundedIcon from '@mui/icons-material/LoginRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded'
import { CircularProgress, List, ListItemButton, ListItemIcon, ListItemText, Stack } from '@mui/material'
import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'

const AVAILABILITY_PATH_PATTERN = /^\/rooms\/[^/]+\/availability$/
const CALENDAR_PATH_PATTERN = /^\/persons\/[^/]+\/calendar$/

// Mootmaker has no feedback form/backend of its own, so this goes to the project's own issue
// tracker instead - the same URL this project's other READMEs already point to.
const FEEDBACK_URL = 'https://github.com/geoffweatherall/mootmaker/issues'

interface MenuContentProps {
  /** Called after navigating via a link in this menu - used to close the mobile flyout. */
  onNavigate?: () => void
}

/**
 * The vertical nav list shared by the desktop sidebar and the mobile flyout: Home, then - only
 * when signed in - Calendar and Availability (both need a signed-in user; showing them signed
 * out would just bounce through RequireAuth to the sign-in form), then Sign in/Sign up (signed
 * out) or Sign out (signed in), followed by the secondary About/Feedback items.
 */
export function MenuContent({ onNavigate }: MenuContentProps) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { email, personId, personLoading, initialising, signOut } = useAuth()
  // True from the moment "Calendar" is clicked before personId is known until it resolves one
  // way or another - shows a spinner in place of the icon instead of leaving the item disabled.
  const [awaitingCalendar, setAwaitingCalendar] = useState(false)
  // Still checking for a linked Person - covers both the initial session check and the myPerson
  // lookup that follows it, so "not known yet" is distinct from "confirmed no linked Person".
  const personUnresolved = initialising || personLoading

  const todayAvailabilityPath = `/rooms/${dayjs().format('YYYY-MM-DD')}/availability`
  const isHomeActive = pathname === '/'
  const isAvailabilityActive = AVAILABILITY_PATH_PATTERN.test(pathname) || pathname === '/rooms/add'
  const isCalendarActive = CALENDAR_PATH_PATTERN.test(pathname)

  // Navigate as soon as a personId shows up for a click that arrived while it was still
  // unresolved; if it resolves to "no linked Person" instead, there's nowhere to go, so just
  // stop waiting - the item falls back to its disabled state.
  useEffect(() => {
    if (!awaitingCalendar || personUnresolved) return
    if (personId) {
      navigate(`/persons/${personId}/calendar`)
      onNavigate?.()
    }
    setAwaitingCalendar(false)
  }, [awaitingCalendar, personUnresolved, personId, navigate, onNavigate])

  function handleSignOut() {
    signOut()
    onNavigate?.()
    navigate('/')
  }

  return (
    <Stack sx={{ flexGrow: 1, justifyContent: 'space-between' }}>
      <List dense component="nav">
        <ListItemButton component={Link} to="/" selected={isHomeActive} onClick={onNavigate}>
          <ListItemIcon>
            <HomeRoundedIcon />
          </ListItemIcon>
          <ListItemText primary="Home" />
        </ListItemButton>

        {email && (
          <>
            {personId ? (
              <ListItemButton
                component={Link}
                to={`/persons/${personId}/calendar`}
                selected={isCalendarActive}
                onClick={onNavigate}
              >
                <ListItemIcon>
                  <CalendarMonthRoundedIcon />
                </ListItemIcon>
                <ListItemText primary="Calendar" />
              </ListItemButton>
            ) : personUnresolved || awaitingCalendar ? (
              <ListItemButton onClick={() => setAwaitingCalendar(true)} disabled={awaitingCalendar}>
                <ListItemIcon>
                  {awaitingCalendar ? <CircularProgress size={20} /> : <CalendarMonthRoundedIcon />}
                </ListItemIcon>
                <ListItemText primary="Calendar" />
              </ListItemButton>
            ) : (
              <ListItemButton disabled>
                <ListItemIcon>
                  <CalendarMonthRoundedIcon />
                </ListItemIcon>
                <ListItemText primary="Calendar" />
              </ListItemButton>
            )}

            <ListItemButton component={Link} to={todayAvailabilityPath} selected={isAvailabilityActive} onClick={onNavigate}>
              <ListItemIcon>
                <EventAvailableRoundedIcon />
              </ListItemIcon>
              <ListItemText primary="Availability" />
            </ListItemButton>
          </>
        )}

        {email ? (
          <ListItemButton onClick={handleSignOut}>
            <ListItemIcon>
              <LogoutRoundedIcon />
            </ListItemIcon>
            <ListItemText primary="Sign out" />
          </ListItemButton>
        ) : (
          <>
            <ListItemButton component={Link} to="/signin" selected={pathname === '/signin'} onClick={onNavigate}>
              <ListItemIcon>
                <LoginRoundedIcon />
              </ListItemIcon>
              <ListItemText primary="Sign in" />
            </ListItemButton>
            <ListItemButton component={Link} to="/signup" selected={pathname === '/signup'} onClick={onNavigate}>
              <ListItemIcon>
                <PersonAddRoundedIcon />
              </ListItemIcon>
              <ListItemText primary="Sign up" />
            </ListItemButton>
          </>
        )}
      </List>

      <List dense component="nav">
        <ListItemButton component={Link} to="/about" selected={pathname === '/about'} onClick={onNavigate}>
          <ListItemIcon>
            <InfoRoundedIcon />
          </ListItemIcon>
          <ListItemText primary="About" />
        </ListItemButton>
        <ListItemButton component="a" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
          <ListItemIcon>
            <FeedbackRoundedIcon />
          </ListItemIcon>
          <ListItemText primary="Feedback" />
        </ListItemButton>
      </List>
    </Stack>
  )
}
