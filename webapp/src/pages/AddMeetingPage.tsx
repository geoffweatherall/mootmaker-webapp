import { useLazyQuery, useMutation, useQuery } from '@apollo/client/react'
import {
  Box,
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
import addMeetingHero from '../assets/add-meeting-hero.svg'
import { SparkleIcon } from '../icons'

// Only offer minutes on a 5-minute boundary in the time picker, matching the
// API's requirement that meeting start/end times fall on a 5 minute boundary.
const MEETING_TIME_STEPS = { minutes: 5 }

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
  // leaving the field blank exactly like before this page defaulted anything. Also skipped for as
  // long as the signed-in user has already added themselves as an attendee - the organiser and
  // attendee lists are mutually exclusive (see the Attendees/Organiser field filtering below), and
  // an explicit attendee pick like that is exactly the kind of deliberate choice this default must
  // not override, same as an explicit organiser pick. Re-running on attendeeIds too means removing
  // that self-attendee pick lets the default apply retroactively, matching how removing someone as
  // an attendee always makes them selectable as organiser again elsewhere on this form.
  useEffect(() => {
    if (personId && !organiserTouched && !attendeeIds.includes(personId)) {
      setOrganiserId(personId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, attendeeIds])

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

  // The organiser and attendees are kept mutually exclusive: whoever is picked as one is not
  // offered as a choice for the other. This is enforced authoritatively server-side (the
  // OrganiserIsAttendee validation error) - filtering here is purely a UX nicety so a user can't
  // even attempt the combination, not a substitute for that server-side check. Because each list
  // is derived from organiserId/attendeeIds on every render, adding someone to one side
  // immediately removes them as an option on the other, and removing them makes them a selectable
  // option again there - there's no separate "sync" step to keep these consistent.
  const organiserOptions = people.filter((person) => !attendeeIds.includes(person.id))
  const attendeeOptions = people.filter((person) => person.id !== organiserId)

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
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
        <Box component="img" src={addMeetingHero} alt="" sx={{ width: 56, flexShrink: 0 }} />
        <Typography variant="h4" component="h1">
          Add Meeting
        </Typography>
      </Stack>

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
              <InputLabel id="organiser-label">Organiser</InputLabel>
              <Select
                labelId="organiser-label"
                label="Organiser"
                value={organiserId}
                onChange={handleOrganiserChange}
              >
                {organiserOptions.map((person) => (
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
                {attendeeOptions.map((person) => (
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

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
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
                onClick={handleSuggestRoom}
                disabled={suggesting}
                startIcon={suggesting ? <CircularProgress size={16} color="inherit" /> : <SparkleIcon />}
                // This is the app's one "smart" feature - a gradient fill (rather than the
                // ordinary outlined/contained buttons used everywhere else) so it reads as
                // distinct at a glance, not just another secondary action next to the Room field.
                sx={(theme) => ({
                  flexShrink: 0,
                  width: { xs: '100%', sm: 'auto' },
                  height: 56,
                  color: '#fff',
                  background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                  '&:hover': {
                    background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                    filter: 'brightness(1.08)',
                  },
                  '&.Mui-disabled': {
                    color: 'rgba(255, 255, 255, 0.7)',
                    background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main})`,
                    opacity: 0.6,
                  },
                })}
              >
                Suggest a room
              </Button>
            </Stack>

            <Stack direction="row" spacing={2}>
              <SubmitButton loading={submitting} hasError={bannerMessages.length > 0}>
                Save
              </SubmitButton>
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
