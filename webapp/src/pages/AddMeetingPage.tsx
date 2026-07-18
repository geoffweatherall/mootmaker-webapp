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
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import dayjs, { type Dayjs } from 'dayjs'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { SubmitButton } from '../components/SubmitButton'
import { errorMessages } from '../graphql/errorMessages'
import { CREATE_MEETING } from '../graphql/mutations'
import { LIST_PEOPLE, LIST_ROOMS } from '../graphql/queries'
import { MEETING_ERROR_MESSAGES } from '../graphql/types'
import type { CreateMeetingResult, Person, Room } from '../graphql/types'

// Only offer minutes on a 5-minute boundary in the time picker, matching the
// API's requirement that meeting start/end times fall on a 5 minute boundary.
const MEETING_TIME_STEPS = { minutes: 5 }

function nextFiveMinuteBoundary(from: Dayjs): Dayjs {
  const rounded = from.second(0).millisecond(0)
  const remainder = rounded.minute() % 5
  return remainder === 0 ? rounded : rounded.add(5 - remainder, 'minute')
}

function defaultDate(): Dayjs {
  return dayjs().startOf('day')
}

function defaultStartTime(): Dayjs {
  return nextFiveMinuteBoundary(dayjs())
}

// A meeting cannot span midnight (see MeetingError.SpansMultipleDays), so the default end time
// never rolls past 23:55 even if the default start time falls late in the day.
function defaultEndTime(start: Dayjs): Dayjs {
  const candidate = start.add(30, 'minute')
  return candidate.isSame(start, 'day') ? candidate : start.hour(23).minute(55).second(0).millisecond(0)
}

// Combines a calendar date with a time-of-day into the ISO-8601 local date-time string the API
// expects, e.g. "2026-07-01T14:30:00" - both startTime and endTime are built from the same date
// value, so a meeting can never span midnight from this form.
function combineDateAndTime(date: Dayjs | null, time: Dayjs | null): string {
  if (!date || !time) {
    return ''
  }
  return date.hour(time.hour()).minute(time.minute()).second(0).millisecond(0).format('YYYY-MM-DDTHH:mm:ss')
}

export default function AddMeetingPage() {
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
  const [date, setDate] = useState<Dayjs | null>(defaultDate)
  const [startTime, setStartTime] = useState<Dayjs | null>(defaultStartTime)
  const [endTime, setEndTime] = useState<Dayjs | null>(() => defaultEndTime(defaultStartTime()))
  const [meetingErrors, setMeetingErrors] = useState<string[]>([])

  const [createMeeting, { loading: submitting, error: mutationError, reset }] = useMutation<{
    createMeeting: CreateMeetingResult
  }>(CREATE_MEETING)

  const rooms = roomsData?.rooms ?? []
  const people = peopleData?.people ?? []

  const bannerMessages = [
    ...errorMessages(roomsError),
    ...errorMessages(peopleError),
    ...meetingErrors,
    ...errorMessages(mutationError),
  ]

  function dismissBanner() {
    setMeetingErrors([])
    reset()
  }

  function handleAttendeesChange(event: SelectChangeEvent<string[]>) {
    const value = event.target.value
    setAttendeeIds(typeof value === 'string' ? value.split(',') : value)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setMeetingErrors([])

    const result = await createMeeting({
      variables: {
        meeting: {
          subject,
          roomId,
          organiserId,
          attendeeIds,
          startTime: combineDateAndTime(date, startTime),
          endTime: combineDateAndTime(date, endTime),
        },
      },
    })

    const payload = result.data?.createMeeting
    if (payload?.errors.length) {
      setMeetingErrors(payload.errors.map((code) => MEETING_ERROR_MESSAGES[code]))
      return
    }
    if (payload?.meeting) {
      navigate(`/rooms/${payload.meeting.startTime.slice(0, 10)}/availability`, {
        state: { toast: 'Meeting was successfully scheduled.' },
      })
    }
  }

  const loadingReferenceData = roomsLoading || peopleLoading

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Schedule Meeting
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

            <DatePicker
              label="Date"
              value={date}
              onChange={(value) => setDate(value)}
              slotProps={{ textField: { fullWidth: true } }}
            />
            <TimePicker
              label="Start time"
              value={startTime}
              onChange={(value) => setStartTime(value)}
              timeSteps={MEETING_TIME_STEPS}
              slotProps={{ textField: { fullWidth: true } }}
            />
            <TimePicker
              label="End time"
              value={endTime}
              onChange={(value) => setEndTime(value)}
              timeSteps={MEETING_TIME_STEPS}
              slotProps={{ textField: { fullWidth: true } }}
            />

            <Stack direction="row" spacing={2}>
              <SubmitButton loading={submitting}>Save</SubmitButton>
              <Button variant="outlined" onClick={() => navigate(-1)} disabled={submitting}>
                Cancel
              </Button>
            </Stack>
          </Stack>
        )}
      </Paper>
    </Stack>
  )
}
