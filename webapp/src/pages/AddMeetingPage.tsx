import { useLazyQuery, useMutation, useQuery } from '@apollo/client/react'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
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
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { ErrorBanner } from '../components/ErrorBanner'
import { SubmitButton } from '../components/SubmitButton'
import { errorMessages } from '../graphql/errorMessages'
import { CREATE_MEETING } from '../graphql/mutations'
import { LIST_PEOPLE, LIST_ROOMS, SUGGEST_ROOM } from '../graphql/queries'
import { MEETING_ERROR_MESSAGES } from '../graphql/types'
import type { CreateMeetingResult, Person, Room } from '../graphql/types'

// Only offer minutes on a 5-minute boundary in the time picker, matching the
// API's requirement that meeting start/end times fall on a 5 minute boundary.
const MEETING_TIME_STEPS = { minutes: 5 }

const STEPS = ['Details', 'Room']

const NO_ROOM_AVAILABLE_MESSAGE = 'No suitable room is available for that time - try adjusting the attendees or time.'

function nextFifteenMinuteBoundary(from: Dayjs): Dayjs {
  const rounded = from.second(0).millisecond(0)
  const remainder = rounded.minute() % 15
  return remainder === 0 ? rounded : rounded.add(15 - remainder, 'minute')
}

function defaultDate(): Dayjs {
  return dayjs().startOf('day')
}

function defaultStartTime(): Dayjs {
  return nextFifteenMinuteBoundary(dayjs())
}

// A meeting cannot span midnight (see MeetingError.SpansMultipleDays), so the default end time
// never rolls past 23:55 even if the default start time falls late in the day.
function defaultEndTime(start: Dayjs): Dayjs {
  const candidate = start.add(1, 'hour')
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
  const { personId } = useAuth()

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

  const [activeStep, setActiveStep] = useState(0)
  const [subject, setSubject] = useState('')
  const [roomId, setRoomId] = useState('')
  const [organiserId, setOrganiserId] = useState('')
  const [organiserTouched, setOrganiserTouched] = useState(false)
  const [attendeeIds, setAttendeeIds] = useState<string[]>([])
  const [date, setDate] = useState<Dayjs | null>(defaultDate)
  const [startTime, setStartTime] = useState<Dayjs | null>(defaultStartTime)
  const [endTime, setEndTime] = useState<Dayjs | null>(() => defaultEndTime(defaultStartTime()))
  const [meetingErrors, setMeetingErrors] = useState<string[]>([])
  const [suggestionErrors, setSuggestionErrors] = useState<string[]>([])

  // Defaults the organiser to the signed-in user's own Person, once it's known - not on every
  // render, and never overriding a choice the user already made (e.g. organising on someone
  // else's behalf). Demo/e2e sign-ins have no linked Person, so this simply never fires for them,
  // leaving the field blank exactly like before this page defaulted anything.
  useEffect(() => {
    if (personId && !organiserTouched) {
      setOrganiserId(personId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId])

  const [createMeeting, { loading: submitting, error: mutationError, reset }] = useMutation<{
    createMeeting: CreateMeetingResult
  }>(CREATE_MEETING)

  const [suggestRoom, { loading: suggesting }] = useLazyQuery<{ suggestRoom: Room[] }>(SUGGEST_ROOM, {
    fetchPolicy: 'network-only',
  })

  // The ranked list of suggested rooms, fetched from the server once (on the first "Suggest a
  // room" press for a given time/attendee count) and cached here so later presses just step
  // through it - null means "not fetched yet for the current inputs" and is distinct from an
  // empty array, which means "fetched, but nothing qualified".
  const [suggestedRooms, setSuggestedRooms] = useState<Room[] | null>(null)
  const [suggestionIndex, setSuggestionIndex] = useState(0)

  const meetingStartTime = combineDateAndTime(date, startTime)
  const meetingEndTime = combineDateAndTime(date, endTime)

  // The cached suggestion list is only valid for the time/attendee-count it was fetched for, so
  // clear it whenever any of those change - the next button press will fetch a fresh ranked list.
  useEffect(() => {
    setSuggestedRooms(null)
    setSuggestionIndex(0)
  }, [meetingStartTime, meetingEndTime, attendeeIds.length])

  const rooms = roomsData?.rooms ?? []
  const people = peopleData?.people ?? []

  const bannerMessages = [
    ...errorMessages(roomsError),
    ...errorMessages(peopleError),
    ...meetingErrors,
    ...suggestionErrors,
    ...errorMessages(mutationError),
  ]

  function dismissBanner() {
    setMeetingErrors([])
    setSuggestionErrors([])
    reset()
  }

  function handleAttendeesChange(event: SelectChangeEvent<string[]>) {
    const value = event.target.value
    setAttendeeIds(typeof value === 'string' ? value.split(',') : value)
  }

  function handleOrganiserChange(event: SelectChangeEvent) {
    setOrganiserTouched(true)
    setOrganiserId(event.target.value)
  }

  async function handleSuggestRoom() {
    setSuggestionErrors([])

    let candidates = suggestedRooms
    let index = suggestionIndex

    if (candidates === null) {
      const result = await suggestRoom({
        variables: {
          startTime: meetingStartTime,
          endTime: meetingEndTime,
          requiredCapacity: attendeeIds.length + 1,
        },
      })
      candidates = result.data?.suggestRoom ?? []
      index = 0
      setSuggestedRooms(candidates)
    } else if (candidates.length > 0) {
      index = (index + 1) % candidates.length
    }

    setSuggestionIndex(index)

    if (candidates.length === 0) {
      setSuggestionErrors([NO_ROOM_AVAILABLE_MESSAGE])
    } else {
      setRoomId(candidates[index].id)
    }
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
          startTime: meetingStartTime,
          endTime: meetingEndTime,
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
          <Stack spacing={3}>
            <Stepper activeStep={activeStep}>
              {STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            {activeStep === 0 ? (
              <Stack spacing={3}>
                <TextField
                  label="Subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  autoFocus
                  fullWidth
                />

                <FormControl fullWidth>
                  <InputLabel id="organiser-label">Organiser</InputLabel>
                  <Select
                    labelId="organiser-label"
                    label="Organiser"
                    value={organiserId}
                    onChange={handleOrganiserChange}
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
                  <Button variant="contained" onClick={() => setActiveStep(1)}>
                    Next
                  </Button>
                  <Button variant="outlined" onClick={() => navigate(-1)}>
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            ) : (
              <Stack component="form" spacing={3} onSubmit={handleSubmit}>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
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
                  <Button
                    variant="outlined"
                    onClick={handleSuggestRoom}
                    disabled={suggesting}
                    startIcon={suggesting ? <CircularProgress size={16} color="inherit" /> : <AutoAwesomeIcon />}
                    sx={{ flexShrink: 0, height: 56 }}
                  >
                    Suggest a room
                  </Button>
                </Stack>

                <Stack direction="row" spacing={2}>
                  <SubmitButton loading={submitting}>Save</SubmitButton>
                  <Button variant="outlined" onClick={() => setActiveStep(0)} disabled={submitting}>
                    Back
                  </Button>
                  <Button variant="outlined" onClick={() => navigate(-1)} disabled={submitting}>
                    Cancel
                  </Button>
                </Stack>
              </Stack>
            )}
          </Stack>
        )}
      </Paper>
    </Stack>
  )
}
