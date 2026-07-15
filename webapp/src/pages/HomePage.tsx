import { useQuery } from '@apollo/client/react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import dayjs from 'dayjs'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { SignInForm } from '../components/SignInForm'
import { formatLocalTime } from '../graphql/formatDateTime'
import { LIST_BOOKINGS } from '../graphql/queries'
import type { Booking } from '../graphql/types'

const SIGN_UP_STEPS = [
  'Enter your name, email address, and password.',
  'Check your email for the verification code we send you.',
  "Enter the code to confirm your account — you'll be signed in right away.",
]

const DATE_KEY_FORMAT = 'YYYY-MM-DD'

interface AgendaListProps {
  title: string
  bookings: Booking[]
  loading: boolean
}

function AgendaList({ title, bookings, loading }: AgendaListProps) {
  return (
    <Paper sx={{ p: 2, flex: 1 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      ) : bookings.length === 0 ? (
        <Typography color="text.secondary">No meetings.</Typography>
      ) : (
        <List disablePadding>
          {bookings.map((booking) => (
            <ListItemButton key={booking.id} component={Link} to={`/bookings/${booking.id}`} sx={{ borderRadius: 1 }}>
              <ListItemText
                primary={booking.subject}
                secondary={`${formatLocalTime(booking.startTime)}–${formatLocalTime(booking.endTime)} · ${booking.room.name}`}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </Paper>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const { email, personId, personLoading } = useAuth()
  // Bookings change constantly, so this keeps refetching on every visit (`cache-and-network`).
  // Skipped while signed out, since that content is hidden entirely and the query would just fail.
  const { data: bookingsData, loading: bookingsLoading } = useQuery<{ bookings: Booking[] }>(LIST_BOOKINGS, {
    fetchPolicy: 'cache-and-network',
    skip: !email,
  })

  const today = dayjs().format(DATE_KEY_FORMAT)
  const tomorrow = dayjs().add(1, 'day').format(DATE_KEY_FORMAT)

  function agendaFor(dateKey: string): Booking[] {
    if (!personId) return []
    return (bookingsData?.bookings ?? [])
      .filter((booking) => booking.startTime.startsWith(dateKey))
      .filter(
        (booking) =>
          booking.organiser.id === personId ||
          booking.attendees.some((attendee) => attendee.id === personId),
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }

  const agendaLoading = bookingsLoading && !bookingsData

  if (!email) {
    // Not secrets - this is a demo system, so the whole point is that these are shown here for
    // anyone to use without signing up. See room-booking-api's aws_cognito_user.demo.
    const demoEmail = import.meta.env.VITE_DEMO_USER_EMAIL
    const demoPassword = import.meta.env.VITE_DEMO_USER_PASSWORD
    const hasDemoUser = Boolean(demoEmail && demoPassword)

    return (
      <Stack spacing={3}>
        <Typography variant="h3" component="h1">
          Welcome to Room Booking
        </Typography>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>
            Try it now — no account needed
          </Typography>
          {hasDemoUser ? (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                This is a demo system, so you can sign straight in as our shared demo user:
              </Typography>
              <Stack direction="row" spacing={4} sx={{ mb: 2, flexWrap: 'wrap' }}>
                <Typography variant="body2">
                  Email:{' '}
                  <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                    {demoEmail}
                  </Box>
                </Typography>
                <Typography variant="body2">
                  Password:{' '}
                  <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                    {demoPassword}
                  </Box>
                </Typography>
              </Stack>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Sign in below, or create your own account.
            </Typography>
          )}
          <SignInForm defaultEmail={demoEmail} defaultPassword={demoPassword} onSuccess={() => navigate('/')} />
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>
            Or sign up for your own account
          </Typography>
          <Box component="ol" sx={{ pl: 3, m: 0, mb: 2 }}>
            {SIGN_UP_STEPS.map((step) => (
              <Typography key={step} component="li" variant="body2" color="text.secondary">
                {step}
              </Typography>
            ))}
          </Box>
          <Button variant="contained" component={Link} to="/signup">
            Sign up
          </Button>
        </Paper>
      </Stack>
    )
  }

  // personId is only null here once personLoading has settled - i.e. we've confirmed there's no
  // Person linked to this account (e.g. the demo user, or the e2e test user), not just that the
  // lookup hasn't finished yet. Showing someone else's calendar/bookings in that case would be
  // showing the wrong person's data, so this shows an explicit error instead.
  if (!personId && !personLoading) {
    return (
      <Stack spacing={3}>
        <Typography variant="h3" component="h1">
          Welcome to Room Booking
        </Typography>
        <Alert severity="error">
          Your account hasn't been set up properly — no profile could be found for your sign-in.
        </Alert>
        <Button variant="contained" onClick={() => navigate(`/rooms/${today}/availability`)}>
          Rooms available today
        </Button>
      </Stack>
    )
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h3" component="h1">
        Welcome to Room Booking
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Book meeting rooms and keep track of who's using them, all in one place.
      </Typography>
      <Stack direction="row" spacing={2}>
        <Button
          variant="contained"
          disabled={!personId}
          startIcon={personLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
          onClick={() => personId && navigate(`/persons/${personId}/calendar`)}
        >
          My Calendar
        </Button>
        <Button variant="contained" onClick={() => navigate(`/rooms/${today}/availability`)}>
          Rooms available today
        </Button>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
        <AgendaList title="Today" bookings={agendaFor(today)} loading={agendaLoading} />
        <AgendaList title="Tomorrow" bookings={agendaFor(tomorrow)} loading={agendaLoading} />
      </Stack>
    </Stack>
  )
}
