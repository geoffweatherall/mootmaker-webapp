import { useQuery } from '@apollo/client/react'
import AddIcon from '@mui/icons-material/Add'
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
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { runtimeConfig } from '../config'
import emptyMeetings from '../assets/empty-meetings.svg'
import homeHero from '../assets/home-hero.svg'
import homeSignedIn from '../assets/home-signed-in.svg'
import { EmptyState } from '../components/EmptyState'
import { CalendarIcon } from '../icons'
import { SignInForm } from '../components/SignInForm'
import { formatLocalTime } from '../graphql/formatDateTime'
import { PAGE_LOAD } from '../graphql/queries'
import type { Meeting, Room } from '../graphql/types'

const SIGN_UP_STEPS = [
  'Enter your name, email address, and password.',
  'Check your email for the verification code we send you.',
  "Enter the code to confirm your account — you'll be signed in right away.",
]

const DATE_KEY_FORMAT = 'YYYY-MM-DD'

interface AgendaListProps {
  title: string
  meetings: Meeting[]
  /** Room names are resolved by the page from the same response, not carried on each meeting. */
  roomsById: Map<string, Room>
  loading: boolean
}

function AgendaList({ title, meetings, loading, roomsById }: AgendaListProps) {
  const { timeFormat } = useAuth()

  return (
    <Paper sx={{ p: 2, flex: 1 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      ) : meetings.length === 0 ? (
        <EmptyState message="No meetings." illustration={emptyMeetings} />
      ) : (
        <List disablePadding>
          {meetings.map((meeting) => (
            <ListItemButton key={meeting.id} component={Link} to={`/meetings/${meeting.id}`} sx={{ borderRadius: 1 }}>
              <ListItemText
                primary={meeting.subject}
                secondary={`${formatLocalTime(meeting.startTime, timeFormat)}–${formatLocalTime(meeting.endTime, timeFormat)} · ${roomsById.get(meeting.room.id)?.name ?? ""}`}
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

  // Today through the end of tomorrow, for the signed-in person - the API filters server-side so
  // The landing route, so it loads through the composite entry point: rooms, people and the three
  // days the agenda shows, in one request. That is the whole startup path now - there is no longer a
  // myPerson call to wait on before meetings can be asked for, because the caller's id arrives on
  // the token.
  const agendaDates = useMemo(() => {
    const todayStart = dayjs().startOf('day')
    return [0, 1, 2].map((offset) => todayStart.add(offset, 'day').format(DATE_KEY_FORMAT))
  }, [])

  const { data, loading: meetingsLoading } = useQuery(PAGE_LOAD, {
    variables: { dates: agendaDates },
    fetchPolicy: 'cache-and-network',
    skip: !email,
  })

  // Rooms come back in the same response, so a meeting carries only a room id and the name is
  // resolved here. That is deliberate: asking for the name per meeting would make the server do a
  // lookup for data this page already holds.
  const roomsById = useMemo(
    () => new Map<string, Room>((data?.workspace.rooms ?? []).map((room) => [room.id, room])),
    [data],
  )

  const today = dayjs().format(DATE_KEY_FORMAT)
  const tomorrow = dayjs().add(1, 'day').format(DATE_KEY_FORMAT)

  // The server no longer filters by person - a date range is a list of day keys, and there is no
  // personId argument. Three days of meetings is small enough that filtering here costs nothing,
  // and it removed a whole join table from the backend.
  function agendaFor(dateKey: string): Meeting[] {
    const day = (data?.workspace.days ?? []).find((candidate) => candidate.date === dateKey)
    return (day?.meetings ?? [])
      .filter(
        (meeting) =>
          !personId ||
          meeting.organiser.id === personId ||
          meeting.attendees.some((attendee) => attendee.id === personId),
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }

  const agendaLoading = personLoading || (meetingsLoading && !data)

  if (!email) {
    // Not secrets - this is a demo system, so the whole point is that these are shown here for
    // anyone to use without signing up. See mootmaker-api's aws_cognito_user.demo.
    const demoEmail = runtimeConfig.DEMO_USER_EMAIL
    const demoPassword = runtimeConfig.DEMO_USER_PASSWORD
    const hasDemoUser = Boolean(demoEmail && demoPassword)

    return (
      <Stack spacing={3}>
        <Paper sx={{ p: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ alignItems: 'center' }}>
            <Box
              component="img"
              src={homeHero}
              alt=""
              sx={{ width: { xs: '100%', sm: 280 }, maxWidth: 360, flexShrink: 0 }}
            />
            <Stack spacing={1}>
              <Typography variant="h3" component="h1">
                Welcome to Mootmaker
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Schedule meetings and keep track of who's using each room, all in one place.
              </Typography>
            </Stack>
          </Stack>
        </Paper>

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
  // Person linked to this account (e.g. the e2e test user), not just that the
  // lookup hasn't finished yet. Showing someone else's calendar/meetings in that case would be
  // showing the wrong person's data, so this shows an explicit error instead.
  if (!personId && !personLoading) {
    return (
      <Stack spacing={3}>
        <Typography variant="h3" component="h1">
          Welcome to Mootmaker
        </Typography>
        <Alert severity="error">
          Your account hasn't been set up properly — no profile could be found for your sign-in.
        </Alert>
        <Stack direction="row" spacing={2}>
          <Button variant="contained" component={Link} to="/meetings/add" startIcon={<AddIcon />}>
            Add Meeting
          </Button>
          <Button variant="contained" onClick={() => navigate(`/rooms/${today}/availability`)}>
            Room availability today
          </Button>
        </Stack>
      </Stack>
    )
  }

  return (
    <Stack spacing={3}>
      <Paper sx={{ p: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ alignItems: 'center' }}>
          <Box
            component="img"
            src={homeSignedIn}
            alt=""
            sx={{ width: { xs: '100%', sm: 220 }, maxWidth: 280, flexShrink: 0 }}
          />
          <Stack spacing={2} sx={{ flexGrow: 1 }}>
            <Stack spacing={1}>
              <Typography variant="h3" component="h1">
                Welcome to Mootmaker
              </Typography>
              <Typography variant="body1" color="text.secondary">
                Schedule meetings and keep track of who's using each room, all in one place.
              </Typography>
            </Stack>
            <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap' }}>
              {/* Swaps a same-sized icon for the spinner rather than dropping the startIcon
                  entirely, which is what MenuContent's own Calendar item does. An icon that comes
                  and goes changes this button's width, which moves the two buttons to its right -
                  and a control that moves under the cursor silently eats a click already in
                  progress: mousedown lands on the button, the layout shifts, mouseup lands
                  elsewhere, and the browser fires click on the common ancestor rather than the
                  button. See mootmaker-webapp#43 for the same fault costing a 120-second
                  acceptance timeout on Settings. */}
              <Button
                variant="contained"
                disabled={!personId}
                startIcon={personLoading ? <CircularProgress size={20} color="inherit" /> : <CalendarIcon />}
                onClick={() => personId && navigate(`/persons/${personId}/calendar`)}
              >
                Calendar
              </Button>
              <Button variant="contained" onClick={() => navigate(`/rooms/${today}/availability`)}>
                Room availability today
              </Button>
              <Button variant="contained" component={Link} to="/meetings/add" startIcon={<AddIcon />}>
                Add Meeting
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Paper>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
        <AgendaList title="Today" meetings={agendaFor(today)} loading={agendaLoading} roomsById={roomsById} />
        <AgendaList title="Tomorrow" meetings={agendaFor(tomorrow)} loading={agendaLoading} roomsById={roomsById} />
      </Stack>
    </Stack>
  )
}
