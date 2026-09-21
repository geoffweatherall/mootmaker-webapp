import { useMutation, useQuery } from '@apollo/client/react'
import AddIcon from '@mui/icons-material/Add'
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { runtimeConfig } from '../config'
import emptyMeetings from '../assets/empty-meetings.svg'
import homeHero from '../assets/home-hero.svg'
import homeSignedIn from '../assets/home-signed-in.svg'
import { AttendeeStatusBadge } from '../components/AttendeeStatusBadge'
import { EmptyState } from '../components/EmptyState'
import { CalendarIcon } from '../icons'
import { SignInForm } from '../components/SignInForm'
import { useMeetingDetailOverlay } from '../components/useMeetingDetailOverlay'
import { formatLocalTime } from '../graphql/formatDateTime'
import { RESPOND_TO_MEETING } from '../graphql/mutations'
import { PAGE_LOAD } from '../graphql/queries'
import type { Attendee, AttendeeStatus, Meeting, Person, RespondToMeetingResult, Room } from '../graphql/types'
import { roomColorAt } from '../theme/roomColor'

const SIGN_UP_STEPS = [
  'Enter your name, email address, and password.',
  'Check your email for the verification code we send you.',
  "Enter the code to confirm your account — you'll be signed in right away.",
]

const DATE_KEY_FORMAT = 'YYYY-MM-DD'

/** Today/Tomorrow cards beyond this many are hidden behind "Show N more" - see the prototype. */
const AGENDA_VISIBLE_COUNT = 3

/**
 * Fires a response directly from the card - Going/Maybe/Not going, same three choices as
 * AttendeeStatusControl.tsx's detail-sheet control, but as one-shot buttons rather than a toggle
 * group: every card this appears on is, by construction, still at NoResponse (see
 * needsResponse below), so there is no "currently selected" state to show.
 */
function QuickRespondButtons({ meetingId }: { meetingId: string }) {
  const [respondToMeeting, { loading }] = useMutation<{ respondToMeeting: RespondToMeetingResult }>(
    RESPOND_TO_MEETING,
  )

  function respond(status: AttendeeStatus) {
    void respondToMeeting({ variables: { meetingId, status } })
  }

  return (
    <Stack direction="row" spacing={1}>
      <Button size="small" variant="outlined" color="success" disabled={loading} onClick={() => respond('Going')} sx={{ flex: 1 }}>
        Going
      </Button>
      <Button size="small" variant="outlined" color="warning" disabled={loading} onClick={() => respond('Maybe')} sx={{ flex: 1 }}>
        Maybe
      </Button>
      <Button
        size="small"
        variant="outlined"
        color="error"
        disabled={loading}
        onClick={() => respond('NotGoing')}
        sx={{ flex: 1 }}
      >
        Not going
      </Button>
    </Stack>
  )
}

/** "Today" / "Tomorrow" / a weekday name - whichever of the fetched window's three days this is. */
function dayLabel(dateKey: string, today: string, tomorrow: string): string {
  if (dateKey === today) return 'Today'
  if (dateKey === tomorrow) return 'Tomorrow'
  return dayjs(dateKey).format('dddd')
}

interface NeedsResponseEntry {
  meeting: Meeting
  organiserName: string
  roomName: string
}

function NeedsResponseCard({ meeting, organiserName, roomName, today, tomorrow }: NeedsResponseEntry & { today: string; tomorrow: string }) {
  const { timeFormat } = useAuth()
  const whenLabel = `${dayLabel(meeting.startTime.slice(0, 10), today, tomorrow)}, ${formatLocalTime(meeting.startTime, timeFormat)}–${formatLocalTime(meeting.endTime, timeFormat)}`

  return (
    // component="section" + aria-label gives this an implicit "region" role with an accessible
    // name - lets a test (or assistive tech) find one card among several by the meeting's own
    // subject, without reaching for a test id (see CLAUDE.md's "locate by role and accessible
    // name" convention).
    <Card component="section" aria-label={meeting.subject} variant="outlined" sx={{ borderLeft: 3, borderLeftColor: 'warning.main', p: 2 }}>
      <Stack spacing={1.25}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {meeting.subject}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {whenLabel} · {roomName} · organised by {organiserName}
          </Typography>
        </Box>
        <QuickRespondButtons meetingId={meeting.id} />
      </Stack>
    </Card>
  )
}

interface AgendaListProps {
  title: string
  meetings: Meeting[]
  /** Room names are resolved by the page from the same response, not carried on each meeting. */
  roomsById: Map<string, Room>
  roomIndexById: Map<string, number>
  /** Null for a signed-in account with no linked Person - see the degraded-path branch below. Every card still renders; none of them has a status badge to show. */
  personId: string | null
  /** No data at all yet - not even a stale cached copy. The only state that blocks rendering. */
  unknown: boolean
  /** Have data (possibly stale) but a `cache-and-network` revalidation is still in flight - see the
   * shared LinearProgress this drives in HomePage's own return. A day showing zero meetings here
   * is not yet trustworthy while this is true, so the empty state below is suppressed for it - per
   * mootmaker-webapp#111, don't say "No meetings" with more confidence than the data actually has. */
  refreshing: boolean
  /** Opens the shared meeting-detail sheet/panel in place - see useMeetingDetailOverlay.tsx. Not a
   * navigation: nothing in this app links to /meetings/:id any more, see
   * designs/meeting-detail-consolidation.md. */
  onMeetingClick: (meeting: Meeting) => void
}

function AgendaList({ title, meetings, unknown, refreshing, roomsById, roomIndexById, personId, onMeetingClick }: AgendaListProps) {
  const { timeFormat } = useAuth()
  const theme = useTheme()
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? meetings : meetings.slice(0, AGENDA_VISIBLE_COUNT)
  const hasMore = meetings.length > AGENDA_VISIBLE_COUNT

  return (
    <Paper sx={{ p: 2, flex: 1 }}>
      <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      {unknown ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      ) : meetings.length === 0 ? (
        // refreshing: a revalidation is still in flight, so "zero" isn't settled yet - the shared
        // bar above already says so, and this stays blank rather than asserting "No meetings."
        refreshing ? null : (
          <EmptyState message="No meetings." illustration={emptyMeetings} />
        )
      ) : (
        <Stack spacing={1}>
          {visible.map((meeting) => {
            const roomColor = roomColorAt(roomIndexById.get(meeting.room.id) ?? 0, theme.palette.mode)
            const myAttendee: Attendee | undefined = meeting.attendees.find(
              (attendee) => attendee.person.id === personId,
            )
            return (
              <ButtonBase
                key={meeting.id}
                onClick={() => onMeetingClick(meeting)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  width: '100%',
                  textAlign: 'left',
                  borderRadius: 2,
                  p: 1.25,
                  bgcolor: 'action.hover',
                  '&:hover': { bgcolor: 'action.selected' },
                }}
              >
                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: roomColor, flexShrink: 0 }} />
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                    {meeting.subject}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {formatLocalTime(meeting.startTime, timeFormat)}–{formatLocalTime(meeting.endTime, timeFormat)} ·{' '}
                    {roomsById.get(meeting.room.id)?.name ?? ''}
                  </Typography>
                </Box>
                {myAttendee && <AttendeeStatusBadge status={myAttendee.status} size={22} />}
              </ButtonBase>
            )
          })}
          {hasMore && (
            <Button size="small" onClick={() => setExpanded((current) => !current)} sx={{ alignSelf: 'flex-start' }}>
              {expanded ? 'Show fewer' : `Show ${meetings.length - AGENDA_VISIBLE_COUNT} more`}
            </Button>
          )}
        </Stack>
      )}
    </Paper>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const { email, personId, personLoading, initialising } = useAuth()

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
  // Same response too (see PAGE_LOAD's own comment) - needed to resolve organiser/attendee names
  // for the shared meeting-detail overlay below, not previously built here since this page didn't
  // show attendee names before designs/meeting-detail-consolidation.md.
  const peopleById = useMemo(
    () => new Map<string, Person>((data?.workspace.people ?? []).map((person) => [person.id, person])),
    [data],
  )
  const roomIndexById = useMemo(() => {
    const sorted = [...(data?.workspace.rooms ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    return new Map(sorted.map((room, index) => [room.id, index]))
  }, [data])
  const { open: openMeetingDetail, overlay: meetingDetailOverlay } = useMeetingDetailOverlay(
    peopleById,
    roomsById,
    roomIndexById,
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
          meeting.attendees.some((attendee) => attendee.person.id === personId),
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
  }

  // Every meeting across the fetched window (today + the next two days) where the signed-in
  // person is an ATTENDEE - never the organiser, who is implicitly Going with nothing to set (see
  // designs/attendee-response-status.md) - and hasn't responded yet. Soonest-first, per Geoff's
  // own call on the design doc's "Open questions": the most actionable ordering, respond to
  // what's coming up soonest.
  const needsResponse: NeedsResponseEntry[] = useMemo(() => {
    if (!personId) return []
    const entries: NeedsResponseEntry[] = []
    for (const day of data?.workspace.days ?? []) {
      for (const meeting of day.meetings) {
        if (meeting.organiser.id === personId) continue
        const mine = meeting.attendees.find((attendee) => attendee.person.id === personId)
        if (mine?.status !== 'NoResponse') continue
        entries.push({
          meeting,
          organiserName: peopleById.get(meeting.organiser.id)?.name ?? '',
          roomName: roomsById.get(meeting.room.id)?.name ?? '',
        })
      }
    }
    return entries.sort((a, b) => a.meeting.startTime.localeCompare(b.meeting.startTime))
  }, [data, personId, peopleById, roomsById])

  // Three states, not one boolean - see mootmaker-webapp#111. `data` is undefined only until the
  // first complete result (from cache or network) arrives; `cache-and-network` never hands back a
  // partial one, but it does hand back a stale-and-complete one immediately when the cache already
  // has it, with a network revalidation still running behind it - that's `agendaRefreshing`, not
  // `agendaUnknown`, and the two need different treatment: unknown blocks rendering entirely,
  // refreshing shows what we have (a slim bar signals more is coming) without asserting the current
  // "zero" is final.
  const hasAgendaData = data !== undefined
  const agendaUnknown = personLoading || (meetingsLoading && !hasAgendaData)
  const agendaRefreshing = meetingsLoading && hasAgendaData

  // Whether there is even a session to check hasn't resolved yet - not the same as confirmed
  // signed-out, which is what the `!email` branch below actually means. Rendering that branch here
  // would show an already-signed-in visitor the whole marketing/sign-in page for a moment before
  // flipping to their real dashboard. A progress indicator, not a guess either way.
  if (initialising) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

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

      {/* One shared indicator for the whole dashboard below, matching PersonCalendarPage/
          RoomAvailabilityPage's convention (README.md's "Progress indicators") rather than a bar
          per section - Needs-response and both agenda panels come from the one PAGE_LOAD query, so
          three separate bars would just say the same thing three times. */}
      <Box sx={{ height: 4 }}>{agendaRefreshing && <LinearProgress />}</Box>

      {personId && !agendaUnknown && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
            <Typography variant="h6" component="h2">
              Needs your response
            </Typography>
            {needsResponse.length > 0 && (
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: 'text.secondary',
                  bgcolor: 'action.hover',
                  borderRadius: 1,
                  px: 1,
                  py: 0.25,
                }}
              >
                {needsResponse.length}
              </Typography>
            )}
          </Stack>
          {needsResponse.length === 0 ? (
            // refreshing: not settled yet, so "you're all caught up" isn't known to be true - say
            // nothing rather than assert it (see AgendaList's identical treatment below).
            agendaRefreshing ? null : (
              <Paper sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Nothing waiting on a response — you're all caught up.
                </Typography>
              </Paper>
            )
          ) : (
            <Stack spacing={1.5}>
              {needsResponse.map(({ meeting, organiserName, roomName }) => (
                <NeedsResponseCard
                  key={meeting.id}
                  meeting={meeting}
                  organiserName={organiserName}
                  roomName={roomName}
                  today={today}
                  tomorrow={tomorrow}
                />
              ))}
            </Stack>
          )}
        </Stack>
      )}

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
        <AgendaList
          title="Today"
          meetings={agendaFor(today)}
          unknown={agendaUnknown}
          refreshing={agendaRefreshing}
          roomsById={roomsById}
          roomIndexById={roomIndexById}
          personId={personId}
          onMeetingClick={openMeetingDetail}
        />
        <AgendaList
          title="Tomorrow"
          meetings={agendaFor(tomorrow)}
          unknown={agendaUnknown}
          refreshing={agendaRefreshing}
          roomsById={roomsById}
          roomIndexById={roomIndexById}
          personId={personId}
          onMeetingClick={openMeetingDetail}
        />
      </Stack>

      {meetingDetailOverlay}
    </Stack>
  )
}
