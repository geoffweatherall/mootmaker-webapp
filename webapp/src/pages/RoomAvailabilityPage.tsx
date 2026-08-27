import { useQuery } from '@apollo/client/react'
import AddIcon from '@mui/icons-material/Add'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import {
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
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
import { BUSINESS_END_HOUR, BUSINESS_START_HOUR } from '../constants/businessHours'
import { errorMessages } from '../graphql/errorMessages'
import { formatLocalTime } from '../graphql/formatDateTime'
import { LIST_MEETINGS, LIST_ROOMS } from '../graphql/queries'
import type { Meeting, MeetingsFilter, Room } from '../graphql/types'
import { alpha } from '@mui/material/styles'
import { readableTextOn, roomColorAt } from '../theme/roomColor'

const DATE_PARAM_FORMAT = 'YYYY-MM-DD'
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME_FORMAT = 'YYYY-MM-DDTHH:mm:ss'

const BUSINESS_START_MINUTES = BUSINESS_START_HOUR * 60
const BUSINESS_END_MINUTES = BUSINESS_END_HOUR * 60
const BUSINESS_MINUTES = BUSINESS_END_MINUTES - BUSINESS_START_MINUTES

// One label per hour boundary, e.g. 08:00, 09:00, ... 17:00.
const HOUR_MARKS = Array.from(
  { length: BUSINESS_END_HOUR - BUSINESS_START_HOUR + 1 },
  (_, i) => BUSINESS_START_HOUR + i,
)

function parseDateParam(value: string | undefined): Dayjs | null {
  if (!value || !DATE_PARAM_PATTERN.test(value)) return null
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed : null
}

function minutesSinceMidnight(isoLocalDateTime: string): number {
  const [, time] = isoLocalDateTime.split('T')
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// Clamp to the business-hours window and express as a 0-100 percentage across it.
function percentThroughBusinessDay(minutes: number): number {
  const clamped = Math.min(Math.max(minutes, BUSINESS_START_MINUTES), BUSINESS_END_MINUTES)
  return ((clamped - BUSINESS_START_MINUTES) / BUSINESS_MINUTES) * 100
}

export default function RoomAvailabilityPage() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const [dismissedError, setDismissedError] = useState(false)
  const theme = useTheme()

  // The grid (fixed-width business-hours columns) scrolls horizontally within its own container
  // on narrow screens rather than the whole page - these track how far scrolled it is, purely to
  // show/hide the left/right fade hints below (not to run the scroll itself).
  //
  // State (via a ref callback) rather than a plain useRef: this grid only mounts once *both*
  // LIST_ROOMS and LIST_MEETINGS have resolved (see showSpinner below), and those two queries
  // settle independently - LIST_ROOMS often finishes first. A useRef + useEffect keyed on the
  // rooms array can miss the grid's real mount entirely: the rooms array can stop changing before
  // showSpinner ever goes false, so the effect fires once while the ref is still null (grid not
  // mounted yet) and never fires again once it actually mounts, since its own dependency never
  // changes a second time - the ResizeObserver below never gets attached. A ref callback sidesteps
  // this: React calls it exactly when the DOM node mounts/unmounts, independent of any query's
  // loading state, so the effect that depends on this state always gets a real chance to run.
  const [gridScrollEl, setGridScrollEl] = useState<HTMLDivElement | null>(null)
  // The inner minWidth:720 content box - its rendered width is what actually determines whether
  // gridScrollEl (the Paper) is scrollable (scrollWidth), independently of the Paper's own box size.
  const [gridContentEl, setGridContentEl] = useState<HTMLDivElement | null>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  function updateScrollFades() {
    const el = gridScrollEl
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
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
  } = useQuery<{ rooms: Room[] }>(LIST_ROOMS, { fetchPolicy: 'cache-first' })

  // Only the selected day's meetings, across every room - the API filters server-side so this
  // page never fetches more than one day's worth of meetings.
  const meetingsFilter = useMemo<MeetingsFilter>(() => {
    const dayStart = selectedDate.startOf('day')
    return {
      fromStartTime: dayStart.format(DATE_TIME_FORMAT),
      toEndTime: dayStart.add(1, 'day').format(DATE_TIME_FORMAT),
    }
  }, [selectedDate])
  const {
    data: meetingsData,
    loading: meetingsLoading,
    error: meetingsError,
  } = useQuery<{ meetings: Meeting[] }, { filter: MeetingsFilter }>(LIST_MEETINGS, {
    variables: { filter: meetingsFilter },
    fetchPolicy: 'cache-and-network',
  })

  const rooms = useMemo(
    () => [...(roomsData?.rooms ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [roomsData],
  )

  // Attaches (and re-measures) exactly when both boxes are actually mounted, and re-measures again
  // whenever either's rendered size changes afterward - rotating a phone from portrait to
  // landscape, web fonts swapping in after their async load (this app self-hosts via @fontsource -
  // see main.tsx), or anything else that reflows the grid without gridScrollEl/gridContentEl
  // themselves changing. See the state declarations above for why this depends on ref-callback
  // state rather than a rooms-array-keyed effect - that version had a real, confirmed-live bug
  // where the observer could simply never get attached (e-room-availability.md's E.36 Notes).
  useEffect(() => {
    if (!gridScrollEl || !gridContentEl) return
    const observer = new ResizeObserver(updateScrollFades)
    observer.observe(gridScrollEl)
    observer.observe(gridContentEl)
    updateScrollFades()
    return () => observer.disconnect()
  }, [gridScrollEl, gridContentEl])

  const meetingsByRoom = useMemo(() => {
    const map = new Map<string, Meeting[]>()
    for (const meeting of meetingsData?.meetings ?? []) {
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
          {/* Hidden below "sm" - the header row has no room to wrap this in sensibly alongside
              the date-nav controls without it overflowing the viewport, so on narrow screens it
              moves to its own full-width copy at the foot of the page instead (see below). */}
          <Button
            component={Link}
            to="/meetings/add"
            state={{ date: selectedDate.format(DATE_PARAM_FORMAT) }}
            variant="contained"
            startIcon={<AddIcon />}
            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
          >
            Add Meeting
          </Button>
        </Stack>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        Showing business hours ({BUSINESS_START_HOUR.toString().padStart(2, '0')}:00–
        {BUSINESS_END_HOUR.toString().padStart(2, '0')}:00).
      </Typography>

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
        <Box sx={{ position: 'relative' }}>
          <Paper ref={setGridScrollEl} onScroll={updateScrollFades} sx={{ p: 2, overflowX: 'auto' }}>
            <Box ref={setGridContentEl} sx={{ minWidth: 720 }}>
              <Box sx={{ display: 'flex' }}>
                <Box
                  sx={{ width: 200, flexShrink: 0, position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper' }}
                />
                <Box sx={{ position: 'relative', flexGrow: 1, height: 24 }}>
                  {HOUR_MARKS.map((hour, i) => (
                    <Typography
                      key={hour}
                      variant="caption"
                      color="text.secondary"
                      sx={{
                        position: 'absolute',
                        left: `${(i / (HOUR_MARKS.length - 1)) * 100}%`,
                        transform:
                          i === HOUR_MARKS.length - 1
                            ? 'translateX(-100%)'
                            : i === 0
                              ? undefined
                              : 'translateX(-50%)',
                      }}
                    >
                      {hour.toString().padStart(2, '0')}:00
                    </Typography>
                  ))}
                </Box>
              </Box>

              {rooms.map((room, roomIndex) => {
                // See theme/roomColor.ts - a room's colour is a secondary scan aid, not its only
                // identity: the room name is always shown as text alongside it too.
                const roomColor = roomColorAt(roomIndex, theme.palette.mode)
                const meetingTextColor = readableTextOn(roomColor, theme.palette.text.primary)
                return (
                  <Box
                    key={room.id}
                    sx={{
                      display: 'flex',
                      alignItems: 'stretch',
                      borderTop: '1px solid',
                      borderColor: 'divider',
                      py: 1.5,
                    }}
                  >
                    <Box
                      sx={{
                        width: 200,
                        flexShrink: 0,
                        pr: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        // Stays put as the grid scrolls horizontally on narrow screens, so a
                        // room's name/capacity is never scrolled out of view while checking its
                        // later hours.
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        bgcolor: 'background.paper',
                      }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: roomColor,
                            flexShrink: 0,
                          }}
                        />
                        <Typography variant="subtitle2">{room.name}</Typography>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Capacity {room.capacity}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        position: 'relative',
                        flexGrow: 1,
                        height: 48,
                        bgcolor: alpha(roomColor, 0.14),
                        borderRadius: 1,
                      }}
                    >
                      {HOUR_MARKS.slice(1, -1).map((hour, i) => (
                        <Box
                          key={hour}
                          sx={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: `${((i + 1) / (HOUR_MARKS.length - 1)) * 100}%`,
                            borderLeft: '1px solid',
                            borderColor: 'divider',
                          }}
                        />
                      ))}
                      {(meetingsByRoom.get(room.id) ?? []).map((meeting) => {
                        const left = percentThroughBusinessDay(minutesSinceMidnight(meeting.startTime))
                        const right = percentThroughBusinessDay(minutesSinceMidnight(meeting.endTime))
                        if (right <= left) return null
                        return (
                          <Tooltip
                            key={meeting.id}
                            title={`${meeting.subject}: ${formatLocalTime(meeting.startTime)}–${formatLocalTime(meeting.endTime)}`}
                          >
                            <ButtonBase
                              component={Link}
                              to={`/meetings/${meeting.id}`}
                              focusRipple
                              sx={{
                                position: 'absolute',
                                top: 4,
                                bottom: 4,
                                left: `${left}%`,
                                width: `${right - left}%`,
                                bgcolor: roomColor,
                                color: meetingTextColor,
                                borderRadius: 1,
                                px: 0.75,
                                overflow: 'hidden',
                                justifyContent: 'flex-start',
                                transition: 'filter 120ms ease',
                                '&:hover': { filter: 'brightness(0.92)' },
                              }}
                            >
                              <Typography variant="caption" noWrap component="span">
                                {meeting.subject}
                              </Typography>
                            </ButtonBase>
                          </Tooltip>
                        )
                      })}
                    </Box>
                  </Box>
                )
              })}
            </Box>
          </Paper>
          {/* Fade hints for the grid's own horizontal scroll (see gridScrollEl above) - a static
              width is fine since they only need to signal "there's more this way", not track the
              exact remaining distance. Sit outside the scrolling Paper so they stay pinned to the
              visible edges rather than scrolling away with the content. left: 200 keeps the left
              fade from covering the sticky room-label column it sits beside. */}
          {canScrollLeft && (
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: 200,
                width: 24,
                pointerEvents: 'none',
                background: (t) => `linear-gradient(to right, ${t.palette.background.paper}, transparent)`,
              }}
            />
          )}
          {canScrollRight && (
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                right: 0,
                width: 24,
                pointerEvents: 'none',
                background: (t) => `linear-gradient(to left, ${t.palette.background.paper}, transparent)`,
              }}
            />
          )}
        </Box>
      )}

      {/* The header row's own "Add Meeting" button (see above) is hidden below "sm" - this is
          its narrow-screen replacement, full-width at the foot of the page rather than crammed
          into the header alongside the date-nav controls. */}
      <Button
        component={Link}
        to="/meetings/add"
        state={{ date: selectedDate.format(DATE_PARAM_FORMAT) }}
        variant="contained"
        startIcon={<AddIcon />}
        fullWidth
        sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
      >
        Add Meeting
      </Button>
    </Stack>
  )
}
