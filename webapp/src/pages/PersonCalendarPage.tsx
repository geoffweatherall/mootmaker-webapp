import { useQuery } from '@apollo/client/react'
import AddIcon from '@mui/icons-material/Add'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import {
  Autocomplete,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Fab,
  IconButton,
  LinearProgress,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import dayjs, { type Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import emptyPeople from '../assets/empty-people.svg'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { PersonAvatar } from '../components/PersonAvatar'
import { useMeetingDetailOverlay } from '../components/useMeetingDetailOverlay'
import { errorMessages } from '../graphql/errorMessages'
import { formatLocalTime } from '../graphql/formatDateTime'
import { PAGE_LOAD, REFERENCE_DATA } from '../graphql/queries'
import type { Meeting, Person } from '../graphql/types'
import { roomColorAt } from '../theme/roomColor'
import { dayRelativeLabel } from './dayRelativeLabel'

const WORK_DAYS_PER_WEEK = 5
const DATE_KEY_FORMAT = 'YYYY-MM-DD'

// dayjs .day() is 0 (Sunday) .. 6 (Saturday); shift so the week starts Monday.
function startOfWorkWeek(from: Dayjs): Dayjs {
  const day = from.day()
  const daysSinceMonday = day === 0 ? 6 : day - 1
  return from.subtract(daysSinceMonday, 'day').startOf('day')
}

export default function PersonCalendarPage() {
  const { personId } = useParams<{ personId: string }>()
  const navigate = useNavigate()
  const [dismissedError, setDismissedError] = useState(false)
  const { personId: ownPersonId, displayName: ownDisplayName, timeFormat } = useAuth()
  const theme = useTheme()

  // People change rarely, so fetch once and read from the cache from then on (`cache-first`)
  // instead of refetching on every visit; a full page refresh resets the in-memory cache and
  // picks up any changes.
  const {
    data: peopleData,
    loading: peopleLoading,
    error: peopleError,
  } = useQuery(REFERENCE_DATA, { fetchPolicy: 'cache-first' })

  // Fetched purely to colour-code each meeting by room below (see theme/roomColor.ts) - sorted
  // the same way RoomAvailabilityPage sorts its own room list, so a room gets the same colour on
  // both pages.
  const { data: roomsData } = useQuery(REFERENCE_DATA, { fetchPolicy: 'cache-first' })
  const roomIndexById = useMemo(() => {
    const sorted = [...(roomsData?.workspace.rooms ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    return new Map(sorted.map((room, index) => [room.id, index]))
  }, [roomsData])
  const roomsById = useMemo(
    () => new Map((roomsData?.workspace.rooms ?? []).map((room) => [room.id, room])),
    [roomsData],
  )

  const people = useMemo(
    () => [...(peopleData?.workspace.people ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [peopleData],
  )
  const peopleById = useMemo(
    () => new Map((peopleData?.workspace.people ?? []).map((person) => [person.id, person])),
    [peopleData],
  )
  const { open: openMeetingDetail, overlay: meetingDetailOverlay, isOpen: meetingDetailOpen } =
    useMeetingDetailOverlay(peopleById, roomsById, roomIndexById)
  const selectedPerson = useMemo(() => {
    const fromList = people.find((person) => person.id === personId)
    if (fromList) return fromList
    if (personId && personId === ownPersonId && ownDisplayName) {
      return { id: personId, name: ownDisplayName }
    }
    return undefined
  }, [people, personId, ownPersonId, ownDisplayName])

  // The visible week's start - navigable via the Previous/Next week controls below. One week at a
  // time, not the previous design's six stacked weeks: an agenda list of 30 day-sections at once
  // was judged too long a scroll for a mobile-first redesign - see the design doc's prototype.
  const [firstMonday, setFirstMonday] = useState(() => startOfWorkWeek(dayjs()))
  const thisWeek = useMemo(() => startOfWorkWeek(dayjs()), [])
  const isShowingThisWeek = firstMonday.isSame(thisWeek, 'day')

  const days = useMemo(
    () => Array.from({ length: WORK_DAYS_PER_WEEK }, (_, i) => firstMonday.add(i, 'day')),
    [firstMonday],
  )
  const visibleDates = useMemo(() => days.map((day) => day.format(DATE_KEY_FORMAT)), [days])

  const {
    data: meetingsData,
    loading: meetingsLoading,
    error: meetingsError,
  } = useQuery(PAGE_LOAD, {
    variables: { dates: visibleDates },
    skip: !personId,
    fetchPolicy: 'cache-and-network',
  })

  /**
   * The window this calendar may navigate in, published by the server and never computed here -
   * see the previous version of this file for the full reasoning (a client-computed boundary would
   * put two authorities on one fact).
   */
  const boundaries = meetingsData?.workspace.boundaries

  const canGoBack =
    !boundaries ||
    firstMonday.subtract(7, 'day').format(DATE_KEY_FORMAT) >=
      startOfWorkWeek(dayjs(boundaries.earliestRetainedDate)).format(DATE_KEY_FORMAT)

  const canGoForward =
    !boundaries || firstMonday.add(7, 'day').format(DATE_KEY_FORMAT) <= boundaries.latestBookableDate

  const meetingsByDate = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    // Filtered here rather than server-side: every query this page makes carries its dates, so the
    // filtering is over one week of one office's meetings - small.
    const forPerson = (meetingsData?.workspace.days ?? [])
      .flatMap((day) => day.meetings)
      .filter(
        (meeting) =>
          meeting.organiser.id === personId || meeting.attendees.some((attendee) => attendee.id === personId),
      )
    for (const meeting of forPerson) {
      const dateKey = meeting.startTime.slice(0, 10)
      const list = map.get(dateKey) ?? []
      list.push(meeting)
      map.set(dateKey, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime))
    }
    return map
  }, [meetingsData, personId])

  function handlePersonChange(selected: Person | null) {
    if (selected) {
      navigate(`/persons/${selected.id}/calendar`)
    }
  }

  const loading = peopleLoading || meetingsLoading
  const showSpinner = (peopleLoading && !peopleData) || (meetingsLoading && !meetingsData)
  const bannerMessages = [...errorMessages(peopleError), ...errorMessages(meetingsError)]

  const now = dayjs()

  // "Today"/"Tomorrow" for the two near days, the plain weekday name beyond that - the same
  // dayRelativeLabel Room Availability's cards use, just capitalised for a heading here.
  function dayLabelFor(date: Dayjs): { text: string; isToday: boolean } {
    const relative = dayRelativeLabel(date, now)
    if (relative === 'today') return { text: 'Today', isToday: true }
    if (relative === 'tomorrow') return { text: 'Tomorrow', isToday: false }
    return { text: date.format('dddd'), isToday: false }
  }

  const lastDayShown = firstMonday.add(WORK_DAYS_PER_WEEK - 1, 'day')

  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}
      >
        <Typography variant="h4" component="h1">
          Calendar
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <IconButton
            onClick={() => setFirstMonday((current) => current.subtract(7, 'day'))}
            aria-label="Previous week"
            disabled={!canGoBack}
          >
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="body2" sx={{ minWidth: 170, textAlign: 'center' }}>
            {firstMonday.format('D MMM')} – {lastDayShown.format('D MMM YYYY')}
          </Typography>
          <IconButton
            onClick={() => setFirstMonday((current) => current.add(7, 'day'))}
            disabled={!canGoForward}
            aria-label="Next week"
          >
            <ChevronRightIcon />
          </IconButton>
          <Button size="small" disabled={isShowingThisWeek} onClick={() => setFirstMonday(thisWeek)}>
            This week
          </Button>
        </Stack>
      </Stack>

      <Autocomplete
        sx={{ maxWidth: 320 }}
        options={people}
        getOptionLabel={(person) => person.name}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        value={selectedPerson ?? null}
        onChange={(_event, selected) => handlePersonChange(selected)}
        autoHighlight
        renderOption={(props, option) => (
          <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <PersonAvatar name={option.name} size={24} />
            {option.name}
          </Box>
        )}
        renderInput={(params) => <TextField {...params} label="Person" />}
      />

      <Box sx={{ height: 4 }}>{loading && !showSpinner && <LinearProgress />}</Box>

      {!dismissedError && (
        <ErrorBanner messages={bannerMessages} onDismiss={() => setDismissedError(true)} />
      )}

      {showSpinner ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : people.length === 0 ? (
        !peopleError && <EmptyState message="No people exist yet." illustration={emptyPeople} />
      ) : (
        <Stack sx={{ pb: 10 }}>
          {days.map((date) => {
            const dateKey = date.format(DATE_KEY_FORMAT)
            const dayMeetings = meetingsByDate.get(dateKey) ?? []
            const { text: dayText, isToday } = dayLabelFor(date)
            return (
              <Box key={dateKey} sx={{ borderTop: 1, borderColor: 'divider', py: 1.5 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {dayText}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {date.format('D MMM')}
                  </Typography>
                  {isToday && (
                    <Chip
                      label="Today"
                      size="small"
                      sx={{ ml: 'auto', bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700 }}
                    />
                  )}
                </Stack>
                <Stack spacing={0.25} sx={{ pt: 0.75 }}>
                  {dayMeetings.length === 0 ? (
                    // Not shown while meetingsLoading: workspace's cache-and-network refetch (for
                    // a new week/person) can leave dayMeetings transiently empty for days it
                    // hasn't resolved yet, since Query.fields.workspace shares one cache slot
                    // across every `dates` window (see apolloClient.ts's keyArgs: false) - without
                    // this guard, that gap flashes "No meetings" even on days that do have
                    // meetings, right before the real list renders (mootmaker-webapp#72). The
                    // header's LinearProgress already signals this refetch is in flight.
                    !meetingsLoading && (
                      <Typography variant="body2" color="text.secondary">
                        No meetings
                      </Typography>
                    )
                  ) : (
                    dayMeetings.map((meeting) => {
                      const roomColor = roomColorAt(roomIndexById.get(meeting.room.id) ?? 0, theme.palette.mode)
                      return (
                        <ButtonBase
                          key={meeting.id}
                          onClick={() => openMeetingDetail(meeting)}
                          sx={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'stretch',
                            width: '100%',
                            textAlign: 'left',
                            borderRadius: 1,
                            px: 0.5,
                            py: 0.5,
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
                        >
                          {/* Dot centered against just the subject line's own box via flex, not a
                              hand-tuned margin - a fixed offset drifts out of alignment whenever a
                              browser's line-height rendering differs slightly from the one it was
                              tuned against (see mootmaker-webapp#71). */}
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: roomColor, flexShrink: 0 }} />
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {meeting.subject}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary" sx={{ pl: 2 }}>
                            {formatLocalTime(meeting.startTime, timeFormat)}–{formatLocalTime(meeting.endTime, timeFormat)}
                            {' · '}
                            {roomsById.get(meeting.room.id)?.name ?? ''}
                          </Typography>
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

      {/* Hidden while a meeting's detail is showing, on both mobile and desktop - a fixed FAB
          anchored to the content column sits close to where the desktop side panel's own left
          edge begins, so this sidesteps that collision outright rather than repositioning around
          it. See the design doc's FAB-visibility decision. */}
      {!meetingDetailOpen && selectedPerson && (
        <Box
          sx={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            maxWidth: 'md',
            mx: 'auto',
            display: 'flex',
            justifyContent: 'flex-end',
            p: 3,
            pointerEvents: 'none',
          }}
        >
          <Fab
            component={Link}
            to="/meetings/add"
            // Pre-fills the person being viewed as an attendee, not organiser and not blank -
            // opening Add Meeting from someone's calendar reads as "schedule a meeting with them".
            // See the design doc's FAB pre-fill decision. AddMeetingPage reads this via location.state
            // and resolves the name itself from its own reference data - only the id is needed here.
            state={{ attendeeId: selectedPerson.id }}
            color="primary"
            aria-label="Add Meeting"
            sx={{ pointerEvents: 'auto' }}
          >
            <AddIcon />
          </Fab>
        </Box>
      )}

      {meetingDetailOverlay}
    </Stack>
  )
}
