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
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { SubmitButton } from '../components/SubmitButton'
import { errorMessages } from '../graphql/errorMessages'
import { CREATE_BOOKING } from '../graphql/mutations'
import { LIST_PEOPLE, LIST_ROOMS } from '../graphql/queries'
import { BOOKING_ERROR_MESSAGES } from '../graphql/types'
import type { CreateBookingResult, Person, Room } from '../graphql/types'

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

  const [roomId, setRoomId] = useState('')
  const [organiserId, setOrganiserId] = useState('')
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
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
      variables: { booking: { roomId, organiserId, attendeeIds, startTime, endTime } },
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

            <TextField
              label="Start time"
              type="datetime-local"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="End time"
              type="datetime-local"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
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
