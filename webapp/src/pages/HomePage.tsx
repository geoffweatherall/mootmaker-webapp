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
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { SignInForm } from '../components/SignInForm'
import { formatLocalTime } from '../graphql/formatDateTime'
import { LIST_MEETINGS } from '../graphql/queries'
import type { Meeting, MeetingsFilter } from '../graphql/types'

const SIGN_UP_STEPS = [
  'Enter your name, email address, and password.',
  'Check your email for the verification code we send you.',
  "Enter the code to confirm your account — you'll be signed in right away.",
]

const DATE_KEY_FORMAT = 'YYYY-MM-DD'
const DATE_TIME_FORMAT = 'YYYY-MM-DDTHH:mm:ss'

interface AgendaListProps {
  title: string
  meetings: Meeting[]
  loading: boolean
}

function AgendaList({ title, meetings, loading }: AgendaListProps) {
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
        <Typography color="text.secondary">No meetings.</Typography>
      ) : (
        <List disablePadding>
          {meetings.map((meeting) => (
            <ListItemButton key={meeting.id} component={Link} to={`/meetings/${meeting.id}`} sx={{ borderRadius: 1 }}>
              <ListItemText
                primary={meeting.subject}
                secondary={`${formatLocalTime(meeting.startTime)}–${formatLocalTime(meeting.endTime)} · ${meeting.room.name}`}
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
  // this only ever fetches the two days' worth of meetings the agenda actually shows. Kept as its
  // own filtered query rather than reusing PersonCalendarPage's broader one: Apollo's cache keys
  // a list field by its exact arguments, so a 2-day window isn't served from a cached 6-week one
  // even when it's a subset, and this is the landing route - it usually runs before that page has
  // ever been visited in the session anyway. Skipped until both the caller is signed in and their
  // Person id has resolved, since that's what the filter needs.
  const meetingsFilter = useMemo<MeetingsFilter>(() => {
    const todayStart = dayjs().startOf('day')
    return {
      fromStartTime: todayStart.format(DATE_TIME_FORMAT),
      toEndTime: todayStart.add(2, 'day').format(DATE_TIME_FORMAT),
      personId: personId ?? undefined,
    }
  }, [personId])
  const { data: meetingsData, loading: meetingsLoading } = useQuery<
    { meetings: Meeting[] },
    { filter: MeetingsFilter }
  >(LIST_MEETINGS, {
    variables: { filter: meetingsFilter },
    fetchPolicy: 'cache-and-network',
    skip: !email || !personId,
  })

  const today = dayjs().format(DATE_KEY_FORMAT)
  const tomorrow = dayjs().add(1, 'day').format(DATE_KEY_FORMAT)

  function agendaFor(dateKey: string): Meeting[] {
    return (meetingsData?.meetings ?? [])
      .filter((meeting) => meeting.startTime.startsWith(dateKey))
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }

  const agendaLoading = personLoading || (meetingsLoading && !meetingsData)

  if (!email) {
    // Not secrets - this is a demo system, so the whole point is that these are shown here for
    // anyone to use without signing up. See mootmaker-api's aws_cognito_user.demo.
    const demoEmail = import.meta.env.VITE_DEMO_USER_EMAIL
    const demoPassword = import.meta.env.VITE_DEMO_USER_PASSWORD
    const hasDemoUser = Boolean(demoEmail && demoPassword)

    return (
      <Stack spacing={3}>
        <Typography variant="h3" component="h1">
          Welcome to Mootmaker
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
        <Button variant="contained" onClick={() => navigate(`/rooms/${today}/availability`)}>
          Rooms available today
        </Button>
      </Stack>
    )
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h3" component="h1">
        Welcome to Mootmaker
      </Typography>
      <Typography variant="body1" color="text.secondary">
        Schedule meetings and keep track of who's using each room, all in one place.
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
        <AgendaList title="Today" meetings={agendaFor(today)} loading={agendaLoading} />
        <AgendaList title="Tomorrow" meetings={agendaFor(tomorrow)} loading={agendaLoading} />
      </Stack>
    </Stack>
  )
}
