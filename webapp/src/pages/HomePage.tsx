import { useMutation, useQuery } from '@apollo/client/react'
import AddIcon from '@mui/icons-material/Add'
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Card,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import dayjs from 'dayjs'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { runtimeConfig } from '../config'
import { AttendeeStatusBadge } from '../components/AttendeeStatusBadge'
import { EmptyState } from '../components/EmptyState'
import { AvailabilityIcon, CalendarIcon, CheckCircleIcon, PersonIcon } from '../icons'
import { SignInForm } from '../components/SignInForm'
import { useMeetingDetailOverlay } from '../components/useMeetingDetailOverlay'
import { formatLocalTime } from '../graphql/formatDateTime'
import { RESPOND_TO_MEETING } from '../graphql/mutations'
import { DAYS, PAGE_LOAD } from '../graphql/queries'
import type { Attendee, AttendeeStatus, Person, RespondToMeetingResult, Room } from '../graphql/types'
import { roomColorFor } from '../theme/roomColor'
import {
  formatRangeLabel,
  mergeNeedsResponseEntries,
  needsResponseEntriesForDay,
  nextSearchDates,
  type NeedsResponseEntry,
} from './searchFurtherAheadLogic'

const SIGN_UP_STEPS = [
  'Enter your name, email address, and password.',
  'Check your email for the verification code we send you.',
  "Enter the code to confirm your account — you'll be signed in right away.",
]

const DATE_KEY_FORMAT = 'YYYY-MM-DD'

/**
 * Fires a response directly from the card - Going/Maybe/Not going, same three choices as
 * AttendeeStatusControl.tsx's detail-sheet control, but as one-shot buttons rather than a toggle
 * group: every card this appears on is, by construction, still at NoResponse (see
 * needsResponseEntriesForDay), so there is no "currently selected" state to show.
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

function NeedsResponseCard({ meeting, organiserName, roomName, source, today, tomorrow }: NeedsResponseEntry & { today: string; tomorrow: string }) {
  const { timeFormat } = useAuth()
  const whenLabel = `${dayLabel(meeting.startTime.slice(0, 10), today, tomorrow)}, ${formatLocalTime(meeting.startTime, timeFormat)}–${formatLocalTime(meeting.endTime, timeFormat)}`
  // Amber for a meeting the initial window already had, indigo for one only "Search further
  // ahead" turned up - purely so a widened search's finds are visually legible as such (see
  // designs/home-and-misc-pages-redesign.md's "Trade-offs and decisions"), no behavioural
  // difference between the two.
  const borderColor = source === 'extra' ? 'primary.main' : 'warning.main'

  return (
    // component="section" + aria-label gives this an implicit "region" role with an accessible
    // name - lets a test (or assistive tech) find one card among several by the meeting's own
    // subject, without reaching for a test id (see CLAUDE.md's "locate by role and accessible
    // name" convention).
    <Card component="section" aria-label={meeting.subject} variant="outlined" sx={{ borderLeft: 3, borderLeftColor: borderColor, p: 2 }}>
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

interface ToolbarActionProps {
  /** The short, glanceable caption shown under the icon - deliberately shorter than the
   * accessible name below, matching the prototype's compact toolbar captions. */
  caption: string
  /** The full, descriptive accessible name - unchanged from this page's previous plain-button
   * labels, so existing role/name-based tests and assistive tech both keep a fuller description
   * than the compact caption alone would give. */
  accessibleName: string
  icon: ReactNode
  disabled?: boolean
  to?: string
  onClick?: () => void
}

function ToolbarAction({ caption, accessibleName, icon, disabled, to, onClick }: ToolbarActionProps) {
  return (
    <Stack sx={{ alignItems: 'center', gap: 0.5 }}>
      <IconButton
        aria-label={accessibleName}
        disabled={disabled}
        onClick={onClick}
        {...(to ? { component: Link, to } : {})}
        sx={{
          width: 40,
          height: 40,
          bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
          color: 'primary.main',
          '&:hover': { bgcolor: (theme) => alpha(theme.palette.primary.main, 0.16) },
        }}
      >
        {icon}
      </IconButton>
      <Typography variant="caption" color="text.secondary" aria-hidden sx={{ fontSize: '10.5px' }}>
        {caption}
      </Typography>
    </Stack>
  )
}

export default function HomePage() {
  const navigate = useNavigate()
  const theme = useTheme()
  const { email, personId, personLoading, initialising, timeFormat } = useAuth()

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

  // "Search further ahead" extends the dates asked for via the same DAYS query
  // RoomAvailabilityPage reads a single day from, so a click here and a later visit to Room
  // Availability/Person Calendar for one of those same dates share one cache entry instead of two
  // independent fetches. See designs/home-and-misc-pages-redesign.md's Technical considerations.
  //
  // extraDates is plain accumulated state (which dates have been searched so far), but the
  // MEETINGS themselves are never snapshotted into local state - extraNeedsResponse below reads
  // this query's own `data` fresh on every render, the same way initialNeedsResponse reads
  // PAGE_LOAD's. mootmaker-webapp#122: an earlier version stored the matching entries themselves
  // in a `useState<NeedsResponseEntry[]>`, populated once via `useLazyQuery`'s one-shot result -
  // once a card landed there, nothing ever re-filtered it against a later status change, so
  // responding to a card found this way had no visible effect even though the mutation itself
  // succeeded. skip avoids ever sending `dates: []` before the first click.
  //
  // cache-and-network, not the default cache-first, for the same reason RoomAvailabilityPage and
  // PersonCalendarPage's own DAYS queries already need it: Query.workspace's field policy in
  // apolloClient.ts is `keyArgs: false` with a `read` that reconstructs `days` from whatever
  // Day entities are already normalized. Once extraDates grows to include even one date already
  // cached from an earlier click, that read looks "complete enough" under cache-first and the
  // genuinely new dates in the same request never get fetched at all - caught while writing this
  // fix's own regression test, which is exactly the growing-window shape this field policy's own
  // comment warns matters.
  const [searchLevel, setSearchLevel] = useState(0)
  const [extraDates, setExtraDates] = useState<string[]>([])
  const { data: extraData, loading: searching } = useQuery(DAYS, {
    variables: { dates: extraDates },
    fetchPolicy: 'cache-and-network',
    skip: extraDates.length === 0,
  })

  // Rooms come back in the same response, so a meeting carries only a room id and the name is
  // resolved here. That is deliberate: asking for the name per meeting would make the server do a
  // lookup for data this page already holds. Rooms/people are NOT date-filtered, so this also
  // covers any room/person a "Search further ahead" click turns up, however far out.
  const roomsById = useMemo(
    () => new Map<string, Room>((data?.workspace.rooms ?? []).map((room) => [room.id, room])),
    [data],
  )
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

  const todayDayjs = useMemo(() => dayjs().startOf('day'), [])
  const today = todayDayjs.format(DATE_KEY_FORMAT)
  const tomorrow = todayDayjs.add(1, 'day').format(DATE_KEY_FORMAT)

  // The server no longer filters by person - a date range is a list of day keys, and there is no
  // personId argument. Three days of meetings is small enough that filtering here costs nothing,
  // and it removed a whole join table from the backend.
  function agendaFor(dateKey: string) {
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

  // Every meeting in the initial 3-day window where the signed-in person is an ATTENDEE - never
  // the organiser, who is implicitly Going with nothing to set (see
  // designs/attendee-response-status.md) - and hasn't responded yet. "Search further ahead"
  // extends this with extraNeedsResponse below.
  const initialNeedsResponse: NeedsResponseEntry[] = useMemo(() => {
    if (!personId) return []
    const entries = (data?.workspace.days ?? []).flatMap((day) =>
      needsResponseEntriesForDay(day, personId, peopleById, roomsById, 'initial'),
    )
    return entries.sort((a, b) => a.meeting.startTime.localeCompare(b.meeting.startTime))
  }, [data, personId, peopleById, roomsById])

  // Mirrors initialNeedsResponse exactly, just reading extraData instead of data - see the note
  // on extraDates above for why this has to be freshly derived rather than accumulated once.
  const extraNeedsResponse: NeedsResponseEntry[] = useMemo(() => {
    if (!personId) return []
    const entries = (extraData?.workspace.days ?? []).flatMap((day) =>
      needsResponseEntriesForDay(day, personId, peopleById, roomsById, 'extra'),
    )
    return entries.sort((a, b) => a.meeting.startTime.localeCompare(b.meeting.startTime))
  }, [extraData, personId, peopleById, roomsById])

  const needsResponse = useMemo(
    () => mergeNeedsResponseEntries(initialNeedsResponse, extraNeedsResponse),
    [initialNeedsResponse, extraNeedsResponse],
  )
  const rangeLabel = formatRangeLabel(todayDayjs, searchLevel)

  function handleSearchFurtherAhead() {
    if (!personId) return
    const newDates = nextSearchDates(searchLevel, todayDayjs)
    setExtraDates((current) => [...current, ...newDates])
    setSearchLevel((current) => current + 1)
  }

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
        <Box>
          <Typography variant="h3" component="h1">
            Welcome to Mootmaker
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5, maxWidth: 520 }}>
            Schedule meetings and keep track of who's using each room, all in one place.
          </Typography>
        </Box>

        {/* A feature strip replaces the old hero image - see designs/home-and-misc-pages-redesign.md's
            "No imagery anywhere" decision. */}
        <Stack direction="row" spacing={4} sx={{ flexWrap: 'wrap', px: 0.25 }}>
          {[
            { icon: <CalendarIcon fontSize="small" />, label: 'Schedule meetings' },
            { icon: <AvailabilityIcon fontSize="small" />, label: 'Room availability' },
            { icon: <PersonIcon fontSize="small" />, label: 'One shared team calendar' },
          ].map(({ icon, label }) => (
            <Stack key={label} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
              <Stack
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: 2,
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                  color: 'primary.main',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {icon}
              </Stack>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {label}
              </Typography>
            </Stack>
          ))}
        </Stack>

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

  const bothDaysEmpty = agendaFor(today).length === 0 && agendaFor(tomorrow).length === 0

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { xs: 'flex-start', sm: 'flex-start' }, justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4" component="h1">
            Home
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {dayjs().format('dddd, D MMMM')}
          </Typography>
        </Box>
        <Stack direction="row" spacing={2.5}>
          <ToolbarAction
            caption="Add meeting"
            accessibleName="Add Meeting"
            icon={<AddIcon fontSize="small" />}
            to="/meetings/add"
          />
          <ToolbarAction
            caption="Rooms today"
            accessibleName="Room availability today"
            icon={<AvailabilityIcon fontSize="small" />}
            onClick={() => navigate(`/rooms/${today}/availability`)}
          />
          <ToolbarAction
            caption="My calendar"
            accessibleName="Calendar"
            icon={personLoading ? <CircularProgress size={18} color="inherit" /> : <CalendarIcon fontSize="small" />}
            disabled={!personId}
            onClick={() => personId && navigate(`/persons/${personId}/calendar`)}
          />
        </Stack>
      </Stack>

      {/* One shared indicator for the whole dashboard below, matching PersonCalendarPage/
          RoomAvailabilityPage's convention (README.md's "Progress indicators") rather than a bar
          per section - Needs-response and the merged agenda both come from the one PAGE_LOAD
          query, so two separate bars would just say the same thing twice. */}
      <Box sx={{ height: 4 }}>{agendaRefreshing && <LinearProgress />}</Box>

      {personId && !agendaUnknown && (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
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
            <Typography variant="caption" color="text.secondary">
              · {rangeLabel}
            </Typography>
          </Stack>

          {needsResponse.length === 0 ? (
            // refreshing: not settled yet, so "nothing waiting" isn't known to be true - say
            // nothing rather than assert it (see the merged agenda's identical treatment below).
            agendaRefreshing ? null : (
              <EmptyState
                message={`Nothing waiting on a response between ${rangeLabel}.`}
                icon={CheckCircleIcon}
                tone="success"
              />
            )
          ) : (
            <Stack spacing={1.5}>
              {needsResponse.map((entry) => (
                <NeedsResponseCard key={entry.meeting.id} {...entry} today={today} tomorrow={tomorrow} />
              ))}
            </Stack>
          )}

          {/* Always available, never collapses back once a wider window has been searched - see
              designs/home-and-misc-pages-redesign.md's "Search further ahead always stays
              available" decision. */}
          {searching ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary', px: 0.25 }}>
              <CircularProgress size={14} thickness={5} />
              <Typography variant="caption">Searching the next 3 days for more meetings you haven't responded to…</Typography>
            </Stack>
          ) : (
            <ButtonBase
              onClick={handleSearchFurtherAhead}
              sx={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 0.5, borderRadius: 1, px: 0.75, py: 0.5, color: 'primary.main' }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Search further ahead
              </Typography>
            </ButtonBase>
          )}
        </Stack>
      )}

      {/* Today/Tomorrow merged into one calendar-style list, matching PersonCalendarPage's own
          day sections - see designs/home-and-misc-pages-redesign.md's "one merged list, not two
          card columns" decision. */}
      <Paper sx={{ overflow: 'hidden' }}>
        {agendaUnknown ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : bothDaysEmpty ? (
          agendaRefreshing ? null : <EmptyState message="No meetings today or tomorrow." icon={CalendarIcon} />
        ) : (
          <Stack divider={<Box sx={{ borderTop: 1, borderColor: 'divider' }} />}>
            {[today, tomorrow].map((dateKey) => {
              const dayMeetings = agendaFor(dateKey)
              const isToday = dateKey === today
              return (
                <Box key={dateKey} sx={{ px: 2.25, py: 1.75 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                    <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
                      {isToday ? 'Today' : 'Tomorrow'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {dayjs(dateKey).format('D MMM')}
                    </Typography>
                    {isToday && (
                      <Chip
                        label="Today"
                        size="small"
                        sx={{ ml: 'auto', bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700 }}
                      />
                    )}
                  </Stack>
                  <Stack spacing={0.25} sx={{ pt: 1 }}>
                    {dayMeetings.length === 0 ? (
                      !agendaRefreshing && (
                        <Typography variant="body2" color="text.secondary">
                          No meetings
                        </Typography>
                      )
                    ) : (
                      dayMeetings.map((meeting) => {
                        const roomColor = roomColorFor(
                          roomsById.get(meeting.room.id) ?? { color: null },
                          roomIndexById.get(meeting.room.id) ?? 0,
                          theme.palette.mode,
                        )
                        const myAttendee: Attendee | undefined = meeting.attendees.find(
                          (attendee) => attendee.person.id === personId,
                        )
                        return (
                          <ButtonBase
                            key={meeting.id}
                            onClick={() => openMeetingDetail(meeting)}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1.5,
                              width: '100%',
                              textAlign: 'left',
                              borderRadius: 2,
                              p: 1,
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: roomColor, flexShrink: 0 }} />
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
                      })
                    )}
                  </Stack>
                </Box>
              )
            })}
          </Stack>
        )}
      </Paper>

      {meetingDetailOverlay}
    </Stack>
  )
}
