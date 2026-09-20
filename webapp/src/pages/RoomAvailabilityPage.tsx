import { useQuery } from '@apollo/client/react'
import AddIcon from '@mui/icons-material/Add'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import {
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  Collapse,
  Fab,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Typography,
  useTheme,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import emptyRooms from '../assets/empty-rooms.svg'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { useMeetingDetailOverlay } from '../components/useMeetingDetailOverlay'
import { errorMessages } from '../graphql/errorMessages'
import { useAuth } from '../auth/authContext'
import { formatLocalTime } from '../graphql/formatDateTime'
import { DAYS, REFERENCE_DATA } from '../graphql/queries'
import type { Meeting, Person } from '../graphql/types'
import { roomColorAt } from '../theme/roomColor'
import { dayRelativeLabel } from './dayRelativeLabel'
import { segmentsForRoom, statusForRoom } from './roomAvailabilityLogic'

const DATE_PARAM_FORMAT = 'YYYY-MM-DD'
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DATE_KEY_FORMAT = 'YYYY-MM-DD'

function parseDateParam(value: string | undefined): Dayjs | null {
  if (!value || !DATE_PARAM_PATTERN.test(value)) return null
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : null
}

export default function RoomAvailabilityPage() {
  const { timeFormat } = useAuth()
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const [dismissedError, setDismissedError] = useState(false)
  const theme = useTheme()
  const [expandedRoomIds, setExpandedRoomIds] = useState<Set<string>>(new Set())

  function toggleExpanded(roomId: string) {
    setExpandedRoomIds((current) => {
      const next = new Set(current)
      if (next.has(roomId)) next.delete(roomId)
      else next.add(roomId)
      return next
    })
  }

  const parsedDate = parseDateParam(date)

  useEffect(() => {
    if (!parsedDate) {
      navigate(`/rooms/${dayjs().format(DATE_PARAM_FORMAT)}/availability`, { replace: true })
    }
    // Only re-check when the URL's date segment changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const selectedDate = parsedDate ?? dayjs()

  function goToDate(next: Dayjs) {
    navigate(`/rooms/${next.format(DATE_PARAM_FORMAT)}/availability`)
  }

  // Rooms change rarely, so `cache-first` fetches once and reuses the cache from then on; a full
  // page refresh resets the in-memory cache and picks up any changes. Meetings change constantly,
  // so that query below still refetches whenever the selected date (and so the filter) changes.
  const {
    data: roomsData,
    loading: roomsLoading,
    error: roomsError,
  } = useQuery(REFERENCE_DATA, { fetchPolicy: 'cache-first' })

  // Only the selected day's meetings, across every room - the API filters server-side so this
  // page never fetches more than one day's worth of meetings. One day, read by its own key -
  // day-keyed reads are consistent, so a query issued immediately after a write returns the
  // meeting just created. See mootmaker-webapp#12 for the bug that made a workaround necessary
  // before this page moved onto DAYS.
  const {
    data: meetingsData,
    loading: meetingsLoading,
    error: meetingsError,
  } = useQuery(DAYS, {
    variables: { dates: [selectedDate.format(DATE_KEY_FORMAT)] },
    fetchPolicy: 'cache-and-network',
  })

  const rooms = useMemo(
    () => [...(roomsData?.workspace.rooms ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [roomsData],
  )
  const roomIndexById = useMemo(() => new Map(rooms.map((room, index) => [room.id, index])), [rooms])
  const roomsById = useMemo(
    () => new Map((roomsData?.workspace.rooms ?? []).map((room) => [room.id, room])),
    [roomsData],
  )
  const peopleById = useMemo(
    () => new Map<string, Person>((roomsData?.workspace.people ?? []).map((person) => [person.id, person])),
    [roomsData],
  )
  const { open: openMeetingDetail, overlay: meetingDetailOverlay } = useMeetingDetailOverlay(
    peopleById,
    roomsById,
    roomIndexById,
  )

  const meetingsByRoom = useMemo(() => {
    // Exactly the day asked for, and nothing to reconcile: the response replaced this day's entity
    // in the cache, so there is no window in which a just-created meeting is missing.
    const fetched = meetingsData?.workspace.days.at(0)?.meetings ?? []

    const map = new Map<string, Meeting[]>()
    for (const meeting of fetched) {
      const list = map.get(meeting.room.id) ?? []
      list.push(meeting)
      map.set(meeting.room.id, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime))
    }
    return map
  }, [meetingsData])

  const loading = roomsLoading || meetingsLoading
  // True only on a genuine first load - no cached rooms, or no cached meetings for the currently
  // selected date - not on a cache-and-network background revalidation of data we already have
  // (meetingsLoading stays true then too, but meetingsData is already populated from the cache).
  const showSpinner = (roomsLoading && !roomsData) || (meetingsLoading && !meetingsData)
  const bannerMessages = [...errorMessages(roomsError), ...errorMessages(meetingsError)]

  const now = dayjs()
  // "today"/"tomorrow" for the two near days (Google Calendar/Fantastical convention), the plain
  // weekday name beyond that - avoids "in 4 days" while still reading naturally in "See Friday's
  // meetings". See designs/room-availability-and-person-calendar-redesign.md's "Day-relative
  // framing" decision.
  const relative = dayRelativeLabel(selectedDate, now)
  const isToday = relative === 'today'
  const dayLabel = relative ?? selectedDate.format('dddd')

  return (
    <Stack spacing={3}>
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}
      >
        <Typography variant="h4" component="h1">
          Room Availability
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <IconButton
            onClick={() => goToDate(selectedDate.subtract(1, 'day'))}
            aria-label="Previous day"
          >
            <ChevronLeftIcon />
          </IconButton>
          <DatePicker
            value={selectedDate}
            onChange={(value) => value && goToDate(value)}
            format="dddd D MMM YYYY"
            slotProps={{ textField: { size: 'small' } }}
          />
          <IconButton onClick={() => goToDate(selectedDate.add(1, 'day'))} aria-label="Next day">
            <ChevronRightIcon />
          </IconButton>
        </Stack>
      </Stack>

      <Box sx={{ height: 4 }}>{loading && !showSpinner && <LinearProgress />}</Box>

      {!dismissedError && (
        <ErrorBanner messages={bannerMessages} onDismiss={() => setDismissedError(true)} />
      )}

      {showSpinner ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : rooms.length === 0 ? (
        !roomsError && <EmptyState message="No rooms exist yet." illustration={emptyRooms} />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 2,
            // Room for the fixed FAB below so the last row's expanded content is never hidden
            // under it.
            pb: 10,
          }}
        >
          {rooms.map((room, roomIndex) => {
            // See theme/roomColor.ts - a room's colour is a secondary scan aid, not its only
            // identity: the room name is always shown as text alongside it too.
            const roomColor = roomColorAt(roomIndex, theme.palette.mode)
            const meetings = meetingsByRoom.get(room.id) ?? []
            const status = statusForRoom(meetings, isToday, now, timeFormat)
            const segments = segmentsForRoom(meetings)
            const expanded = expandedRoomIds.has(room.id)

            return (
              <Paper key={room.id} sx={{ p: 2.5 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Box
                      sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: roomColor, flexShrink: 0 }}
                    />
                    <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 700 }}>
                      {room.name}
                    </Typography>
                    <Chip label={`Capacity ${room.capacity}`} size="small" variant="outlined" />
                  </Stack>

                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Chip
                      label={status.label}
                      size="small"
                      sx={{
                        fontWeight: 700,
                        bgcolor: status.free ? 'rgba(14,143,130,.14)' : 'action.selected',
                        color: status.free ? 'secondary.dark' : 'text.secondary',
                      }}
                    />
                    <Typography variant="body2" color="text.secondary">
                      {status.subLabel}
                    </Typography>
                  </Stack>

                  {/* Scan-at-a-glance busy/free timeline across the whole day - purely a visual
                      summary of information already available as text (the status chip/subLabel
                      above, and the meeting list below), so it carries no unique information a
                      screen reader user would otherwise miss - aria-hidden accordingly. See
                      mootmaker-webapp#75 and the prototype's own version:
                      https://claude.ai/artifact/1Z3gT9MmFGRzRq5jpvS4Xr */}
                  <Box
                    aria-hidden="true"
                    sx={{
                      position: 'relative',
                      height: 8,
                      borderRadius: 1,
                      bgcolor: `${roomColor}1f`,
                      overflow: 'hidden',
                    }}
                  >
                    {meetings.map((meeting, index) => (
                      <Box
                        key={meeting.id}
                        sx={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: `${segments[index].left}%`,
                          width: `${segments[index].width}%`,
                          bgcolor: roomColor,
                        }}
                      />
                    ))}
                  </Box>

                  <Button
                    onClick={() => toggleExpanded(room.id)}
                    aria-expanded={expanded}
                    sx={{ justifyContent: 'space-between', textTransform: 'none' }}
                    endIcon={
                      <ExpandMoreIcon
                        sx={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 150ms ease' }}
                      />
                    }
                  >
                    {expanded ? `Hide ${dayLabel}'s meetings` : `See ${dayLabel}'s meetings (${meetings.length})`}
                  </Button>
                  <Collapse in={expanded}>
                    <Stack spacing={0.5} sx={{ pt: 0.5 }}>
                      {meetings.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No meetings booked for {dayLabel}.
                        </Typography>
                      ) : (
                        meetings.map((meeting) => (
                          <ButtonBase
                            key={meeting.id}
                            onClick={() => openMeetingDetail(meeting)}
                            sx={{
                              display: 'flex',
                              alignItems: 'baseline',
                              // ButtonBase's root defaults to justifyContent: 'center' (mimicking
                              // a native <button>); textAlign only affects text within a block, not
                              // how a flex container positions its children, so without this the
                              // row centers as a group instead of sitting flush left
                              // (mootmaker-webapp#84).
                              justifyContent: 'flex-start',
                              gap: 1.5,
                              width: '100%',
                              px: 1,
                              py: 0.75,
                              borderRadius: 1,
                              textAlign: 'left',
                              color: 'text.primary',
                              '&:hover': { bgcolor: 'action.hover' },
                            }}
                          >
                            <Typography variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>
                              {formatLocalTime(meeting.startTime, timeFormat)}–{formatLocalTime(meeting.endTime, timeFormat)}
                            </Typography>
                            <Typography variant="body2">{meeting.subject}</Typography>
                          </ButtonBase>
                        ))
                      )}
                    </Stack>
                  </Collapse>
                </Stack>
              </Paper>
            )
          })}
        </Box>
      )}

      {/* Anchored to the same max-width column Layout.tsx's own <Container maxWidth="md"> uses
          for every page's content, not the bare viewport edge - a plain position:fixed;right:20px
          drifts away from the content on a wide screen. See the design doc's FAB anchoring
          decision. */}
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
          state={{ date: selectedDate.format(DATE_PARAM_FORMAT) }}
          color="primary"
          aria-label="Add Meeting"
          sx={{ pointerEvents: 'auto' }}
        >
          <AddIcon />
        </Fab>
      </Box>

      {meetingDetailOverlay}
    </Stack>
  )
}
