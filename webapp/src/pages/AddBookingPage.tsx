import { useMutation, useQuery } from '@apollo/client/react'
import {
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  OutlinedInput,
  Paper,
  Select,
  type SelectChangeEvent,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import dayjs, { type Dayjs } from 'dayjs'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { SubmitButton } from '../components/SubmitButton'
import { errorMessages } from '../graphql/errorMessages'
import { CREATE_BOOKING } from '../graphql/mutations'
import { LIST_PEOPLE, LIST_ROOMS } from '../graphql/queries'
import { BOOKING_ERROR_MESSAGES } from '../graphql/types'
import type { CreateBookingResult, Person, Room } from '../graphql/types'

// Only offer minutes on a 5-minute boundary in the time picker, matching the
// API's requirement that booking start/end times fall on a 5 minute boundary.
const BOOKING_TIME_STEPS = { minutes: 5 }

function nextFiveMinuteBoundary(from: Dayjs): Dayjs {
  const rounded = from.second(0).millisecond(0)
  const remainder = rounded.minute() % 5
  return remainder === 0 ? rounded : rounded.add(5 - remainder, 'minute')
}

function defaultStartTime(): Dayjs {
  return nextFiveMinuteBoundary(dayjs())
}

function defaultEndTime(): Dayjs {
  return defaultStartTime().add(30, 'minute')
}

export default function AddBookingPage() {
  const navigate = useNavigate()

  const {
    data: roomsData,
    loading: roomsLoading,
    error: roomsError,
  } = useQuery<{ rooms: Room[] }>(LIST_ROOMS)
  const {
    data: peopleData,
    loading: peopleLoading,
    error: peopleError,
  } = useQuery<{ people: Person[] }>(LIST_PEOPLE)

  const [subject, setSubject] = useState('')
  const [roomId, setRoomId] = useState('')
  const [organiserId, setOrganiserId] = useState('')
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [startTime, setStartTime] = useState<Dayjs | null>(defaultStartTime)
  const [endTime, setEndTime] = useState<Dayjs | null>(defaultEndTime)
  const [bookingErrors, setBookingErrors] = useState<string[]>([])

  const [createBooking, { loading: submitting, error: mutationError, reset }] = useMutation<{
    createBooking: CreateBookingResult
  }>(CREATE_BOOKING)

  const rooms = roomsData?.rooms ?? []
  const people = peopleData?.people ?? []

  const bannerMessages = [
    ...errorMessages(roomsError),
    ...errorMessages(peopleError),
    ...bookingErrors,
    ...errorMessages(mutationError),
  ]

  function dismissBanner() {
    setBookingErrors([])
    reset()
  }

  function handleAttendeesChange(event: SelectChangeEvent<string[]>) {
    const value = event.target.value
    setAttendeeIds(typeof value === 'string' ? value.split(',') : value)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBookingErrors([])

    const result = await createBooking({
      variables: {
        booking: {
          subject,
          roomId,
          organiserId,
          attendeeIds,
          startTime: startTime?.format('YYYY-MM-DDTHH:mm:ss') ?? '',
          endTime: endTime?.format('YYYY-MM-DDTHH:mm:ss') ?? '',
        },
      },
    })

    const payload = result.data?.createBooking
    if (payload?.errors.length) {
      setBookingErrors(payload.errors.map((code) => BOOKING_ERROR_MESSAGES[code]))
      return
    }
    if (payload?.booking) {
      navigate('/bookings', { state: { toast: 'Booking was successfully created.' } })
    }
  }

  const loadingReferenceData = roomsLoading || peopleLoading

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Add Booking
      </Typography>

      <ErrorBanner messages={bannerMessages} onDismiss={dismissBanner} />

      <Paper sx={{ p: 3 }}>
        {loadingReferenceData ? (
          <Stack sx={{ alignItems: 'center', py: 4 }}>
            <CircularProgress />
          </Stack>
        ) : (
          <Stack component="form" spacing={3} onSubmit={handleSubmit}>
            <TextField
              label="Subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              autoFocus
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel id="room-label">Room</InputLabel>
              <Select
                labelId="room-label"
                label="Room"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
              >
                {rooms.map((room) => (
                  <MenuItem key={room.id} value={room.id}>
                    {room.name} (capacity {room.capacity})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="organiser-label">Organiser</InputLabel>
              <Select
                labelId="organiser-label"
                label="Organiser"
                value={organiserId}
                onChange={(event) => setOrganiserId(event.target.value)}
              >
                {people.map((person) => (
                  <MenuItem key={person.id} value={person.id}>
                    {person.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="attendees-label">Attendees</InputLabel>
              <Select
                labelId="attendees-label"
                multiple
                value={attendeeIds}
                onChange={handleAttendeesChange}
                input={<OutlinedInput label="Attendees" />}
                renderValue={(selected) =>
                  people
                    .filter((person) => selected.includes(person.id))
                    .map((person) => person.name)
                    .join(', ')
                }
              >
                {people.map((person) => (
                  <MenuItem key={person.id} value={person.id}>
                    <Checkbox checked={attendeeIds.includes(person.id)} />
                    <ListItemText primary={person.name} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <DateTimePicker
              label="Start time"
              value={startTime}
              onChange={(value) => setStartTime(value)}
              timeSteps={BOOKING_TIME_STEPS}
              slotProps={{ textField: { fullWidth: true } }}
            />
            <DateTimePicker
              label="End time"
              value={endTime}
              onChange={(value) => setEndTime(value)}
              timeSteps={BOOKING_TIME_STEPS}
              slotProps={{ textField: { fullWidth: true } }}
            />

            <Stack direction="row" spacing={2}>
              <SubmitButton loading={submitting}>Save</SubmitButton>
              <Button variant="outlined" onClick={() => navigate('/bookings')} disabled={submitting}>
                Cancel
              </Button>
            </Stack>
          </Stack>
        )}
      </Paper>
    </Stack>
  )
}
