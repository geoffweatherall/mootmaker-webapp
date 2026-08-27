import { useQuery } from '@apollo/client/react'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import {
  Autocomplete,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  IconButton,
  LinearProgress,
  Paper,
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
import { errorMessages } from '../graphql/errorMessages'
import { formatLocalTime } from '../graphql/formatDateTime'
import { LIST_MEETINGS, LIST_PEOPLE, LIST_ROOMS } from '../graphql/queries'
import type { Meeting, MeetingsFilter, Person, Room } from '../graphql/types'
import { roomColorAt } from '../theme/roomColor'

const WEEKS_SHOWN = 6
const WORK_DAYS_PER_WEEK = 5
const WORK_DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
const DATE_KEY_FORMAT = 'YYYY-MM-DD'
const DATE_TIME_FORMAT = 'YYYY-MM-DDTHH:mm:ss'

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
  const { personId: ownPersonId, displayName: ownDisplayName } = useAuth()
  const theme = useTheme()

  // People change rarely, so fetch once and read from the cache from then on (`cache-first`)
  // instead of refetching on every visit; a full page refresh resets the in-memory cache and
  // picks up any changes.
  const {
    data: peopleData,
    loading: peopleLoading,
    error: peopleError,
  } = useQuery<{ people: Person[] }>(LIST_PEOPLE, { fetchPolicy: 'cache-first' })

  // Fetched purely to colour-code each meeting by room below (see theme/roomColor.ts) - sorted
  // the same way RoomAvailabilityPage sorts its own room list, so a room gets the same colour on
  // both pages. Likely already warm in Apollo's cache if RoomAvailabilityPage was visited this
  // session, since both use the same query with the same `cache-first` policy.
  const { data: roomsData } = useQuery<{ rooms: Room[] }>(LIST_ROOMS, { fetchPolicy: 'cache-first' })
  const roomIndexById = useMemo(() => {
    const sorted = [...(roomsData?.rooms ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    return new Map(sorted.map((room, index) => [room.id, index]))
  }, [roomsData])

  const people = useMemo(
    () => [...(peopleData?.people ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [peopleData],
  )
  // Before the full people list has loaded, fall back to the signed-in user's own name - already
  // known via useAuth(), independent of this page's own LIST_PEOPLE query - rather than leaving
  // the dropdown showing placeholder text until the list resolves. This covers the common case
  // (HomePage's "Calendar" button always links here with the signed-in user's own personId); it doesn't help for
  // a cold deep link to someone else's calendar, since nothing else knows their name yet either.
  const selectedPerson = useMemo(() => {
    const fromList = people.find((person) => person.id === personId)
    if (fromList) return fromList
    if (personId && personId === ownPersonId && ownDisplayName) {
      return { id: personId, name: ownDisplayName }
    }
    return undefined
  }, [people, personId, ownPersonId, ownDisplayName])

  // The visible 6-week window's start - navigable via the Previous/Next week controls below,
  // rather than fixed to "now" forever. Shifting by one week per press (rather than by the whole
  // 6-week block) gives the finer-grained "weeks" half of the use case's "weeks/months" wording
  // directly, while still reaching any month after enough presses.
  const [firstMonday, setFirstMonday] = useState(() => startOfWorkWeek(dayjs()))
  const thisWeek = useMemo(() => startOfWorkWeek(dayjs()), [])
  const isShowingThisWeek = firstMonday.isSame(thisWeek, 'day')

  const weeks = useMemo(
    () =>
      Array.from({ length: WEEKS_SHOWN }, (_, weekIndex) =>
        Array.from({ length: WORK_DAYS_PER_WEEK }, (_, dayIndex) =>
          firstMonday.add(weekIndex * 7 + dayIndex, 'day'),
        ),
      ),
    [firstMonday],
  )

  // This person's meetings across the full visible window (first Monday through the last
  // Friday shown) - the API filters server-side (organiser-or-attendee match, date range) so
  // this page never fetches another person's meetings or meetings outside the weeks shown.
  const meetingsFilter = useMemo<MeetingsFilter>(() => {
    const lastFriday = firstMonday.add((WEEKS_SHOWN - 1) * 7 + (WORK_DAYS_PER_WEEK - 1), 'day')
    return {
      fromStartTime: firstMonday.format(DATE_TIME_FORMAT),
      toEndTime: lastFriday.add(1, 'day').format(DATE_TIME_FORMAT),
      personId,
    }
  }, [firstMonday, personId])
  const {
    data: meetingsData,
    loading: meetingsLoading,
    error: meetingsError,
  } = useQuery<{ meetings: Meeting[] }, { filter: MeetingsFilter }>(LIST_MEETINGS, {
    variables: { filter: meetingsFilter },
    skip: !personId,
    fetchPolicy: 'cache-and-network',
  })

  const meetingsByDate = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    for (const meeting of meetingsData?.meetings ?? []) {
      const dateKey = meeting.startTime.slice(0, 10)
      const list = map.get(dateKey) ?? []
      list.push(meeting)
      map.set(dateKey, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime))
    }
    return map
  }, [meetingsData])

  function handlePersonChange(selected: Person | null) {
    if (selected) {
      navigate(`/persons/${selected.id}/calendar`)
    }
  }

  const loading = peopleLoading || meetingsLoading
  // True only on a genuine first load - no cached people, or no cached meetings for the currently
  // selected person - not on a cache-and-network background revalidation of data we already have
  // (meetingsLoading stays true then too, but meetingsData is already populated from the cache).
  const showSpinner = (peopleLoading && !peopleData) || (meetingsLoading && !meetingsData)
  const bannerMessages = [...errorMessages(peopleError), ...errorMessages(meetingsError)]
  const today = dayjs().format(DATE_KEY_FORMAT)

  const lastFridayShown = firstMonday.add((WEEKS_SHOWN - 1) * 7 + (WORK_DAYS_PER_WEEK - 1), 'day')

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
          >
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="body2" sx={{ minWidth: 170, textAlign: 'center' }}>
            {firstMonday.format('D MMM')} – {lastFridayShown.format('D MMM YYYY')}
          </Typography>
          <IconButton
            onClick={() => setFirstMonday((current) => current.add(7, 'day'))}
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
        // `?? null` (rather than leaving this `undefined` before people have loaded) keeps the
        // component controlled from the very first render — Autocomplete decides
        // controlled-vs-uncontrolled once, based on whether `value` starts out `undefined`, and
        // warns if that ever changes.
        value={selectedPerson ?? null}
        onChange={(_event, selected) => handlePersonChange(selected)}
        autoHighlight
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
        <Paper sx={{ p: 2, overflowX: 'auto' }}>
          <Box sx={{ minWidth: 700 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${WORK_DAYS_PER_WEEK}, 1fr)`,
                gap: 1,
                mb: 1,
              }}
            >
              {WORK_DAY_NAMES.map((dayName) => (
                <Typography
                  key={dayName}
                  variant="subtitle2"
                  align="center"
                  sx={{ fontWeight: 700 }}
                >
                  {dayName}
                </Typography>
              ))}
            </Box>

            <Stack spacing={1}>
              {weeks.map((week) => (
                <Box
                  key={week[0].format(DATE_KEY_FORMAT)}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${WORK_DAYS_PER_WEEK}, 1fr)`,
                    gap: 1,
                  }}
                >
                  {week.map((date) => {
                    const dateKey = date.format(DATE_KEY_FORMAT)
                    const dayMeetings = meetingsByDate.get(dateKey) ?? []
                    return (
                      <Paper
                        key={dateKey}
                        variant="outlined"
                        sx={{
                          p: 1,
                          minHeight: 110,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 0.5,
                          bgcolor: dateKey === today ? 'action.selected' : undefined,
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {date.format('D MMM')}
                        </Typography>
                        {dayMeetings.map((meeting) => {
                          const roomIndex = roomIndexById.get(meeting.room.id) ?? 0
                          const roomColor = roomColorAt(roomIndex, theme.palette.mode)
                          return (
                          <ButtonBase
                            key={meeting.id}
                            component={Link}
                            to={`/meetings/${meeting.id}`}
                            focusRipple
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 0.75,
                              width: '100%',
                              textAlign: 'left',
                              borderRadius: 1,
                              px: 0.5,
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Box
                              sx={{
                                width: 8,
                                height: 8,
                                mt: 0.5,
                                borderRadius: '50%',
                                bgcolor: roomColor,
                                flexShrink: 0,
                              }}
                            />
                            <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                              {formatLocalTime(meeting.startTime)}–{formatLocalTime(meeting.endTime)}{' '}
                              {meeting.subject} – {meeting.room.name}
                            </Typography>
                          </ButtonBase>
                          )
                        })}
                      </Paper>
                    )
                  })}
                </Box>
              ))}
            </Stack>
          </Box>
        </Paper>
      )}
    </Stack>
  )
}
