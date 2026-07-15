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
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { BUSINESS_END_HOUR, BUSINESS_START_HOUR } from '../constants/businessHours'
import { errorMessages } from '../graphql/errorMessages'
import { formatLocalTime } from '../graphql/formatDateTime'
import { LIST_BOOKINGS, LIST_ROOMS } from '../graphql/queries'
import type { Booking, Room } from '../graphql/types'

const DATE_PARAM_FORMAT = 'YYYY-MM-DD'
const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/

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
  // page refresh resets the in-memory cache and picks up any changes. Bookings change constantly,
  // so that query below still refetches on every visit.
  const {
    data: roomsData,
    loading: roomsLoading,
    error: roomsError,
  } = useQuery<{ rooms: Room[] }>(LIST_ROOMS, { fetchPolicy: 'cache-first' })
  const {
    data: bookingsData,
    loading: bookingsLoading,
    error: bookingsError,
  } = useQuery<{ bookings: Booking[] }>(LIST_BOOKINGS, { fetchPolicy: 'cache-and-network' })

  const rooms = useMemo(
    () => [...(roomsData?.rooms ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [roomsData],
  )

  const bookingsByRoom = useMemo(() => {
    const dateKey = selectedDate.format(DATE_PARAM_FORMAT)
    const map = new Map<string, Booking[]>()
    for (const booking of bookingsData?.bookings ?? []) {
      if (!booking.startTime.startsWith(dateKey)) continue
      const list = map.get(booking.room.id) ?? []
      list.push(booking)
      map.set(booking.room.id, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime))
    }
    return map
  }, [bookingsData, selectedDate])

  const loading = roomsLoading || bookingsLoading
  const bannerMessages = [...errorMessages(roomsError), ...errorMessages(bookingsError)]

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
          <Button component={Link} to="/rooms/add" variant="outlined" startIcon={<AddIcon />}>
            Add Room
          </Button>
          <Button component={Link} to="/bookings/add" variant="contained" startIcon={<AddIcon />}>
            New Booking
          </Button>
        </Stack>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        Showing business hours ({BUSINESS_START_HOUR.toString().padStart(2, '0')}:00–
        {BUSINESS_END_HOUR.toString().padStart(2, '0')}:00).
      </Typography>

      {loading && roomsData && <LinearProgress />}

      {!dismissedError && (
        <ErrorBanner messages={bannerMessages} onDismiss={() => setDismissedError(true)} />
      )}

      {loading && !roomsData ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : rooms.length === 0 ? (
        !roomsError && <Typography color="text.secondary">No rooms exist yet.</Typography>
      ) : (
        <Paper sx={{ p: 2, overflowX: 'auto' }}>
          <Box sx={{ minWidth: 720 }}>
            <Box sx={{ display: 'flex' }}>
              <Box sx={{ width: 200, flexShrink: 0 }} />
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

            {rooms.map((room) => (
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
                  }}
                >
                  <Typography variant="subtitle2">{room.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Capacity {room.capacity}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    position: 'relative',
                    flexGrow: 1,
                    height: 48,
                    bgcolor: 'action.hover',
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
                  {(bookingsByRoom.get(room.id) ?? []).map((booking) => {
                    const left = percentThroughBusinessDay(minutesSinceMidnight(booking.startTime))
                    const right = percentThroughBusinessDay(minutesSinceMidnight(booking.endTime))
                    if (right <= left) return null
                    return (
                      <Tooltip
                        key={booking.id}
                        title={`${booking.subject}: ${formatLocalTime(booking.startTime)}–${formatLocalTime(booking.endTime)}`}
                      >
                        <ButtonBase
                          component={Link}
                          to={`/bookings/${booking.id}`}
                          focusRipple
                          sx={{
                            position: 'absolute',
                            top: 4,
                            bottom: 4,
                            left: `${left}%`,
                            width: `${right - left}%`,
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            borderRadius: 1,
                            px: 0.75,
                            overflow: 'hidden',
                            justifyContent: 'flex-start',
                            '&:hover': { bgcolor: 'primary.dark' },
                          }}
                        >
                          <Typography variant="caption" noWrap component="span">
                            {booking.subject}
                          </Typography>
                        </ButtonBase>
                      </Tooltip>
                    )
                  })}
                </Box>
              </Box>
            ))}
          </Box>
        </Paper>
      )}
    </Stack>
  )
}
