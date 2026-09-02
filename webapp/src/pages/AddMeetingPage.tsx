import { useLazyQuery, useMutation, useQuery } from '@apollo/client/react'
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { TimePicker } from '@mui/x-date-pickers/TimePicker'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { datePickerFormat, timePickerUsesAmPm } from '../graphql/formatDateTime'
import { ErrorBanner } from '../components/ErrorBanner'
import { SubmitButton } from '../components/SubmitButton'
import { errorMessages } from '../graphql/errorMessages'
import { CREATE_MEETING } from '../graphql/mutations'
import { LIST_PEOPLE, LIST_ROOMS, SUGGEST_ROOM } from '../graphql/queries'
import {
  MEETING_ERROR_MESSAGES,
} from '../graphql/validationMessages'
import type { CreateMeetingResult, Person, Room } from '../graphql/types'
import addMeetingHero from '../assets/add-meeting-hero.svg'
import { SparkleIcon } from '../icons'
import {
  advanceSuggestion,
  filterAttendeeOptions,
  filterOrganiserOptions,
  initialSuggestionCache,
  type SuggestionCache,
} from './addMeetingLogic'

// Only offer minutes on a 15-minute boundary in the time picker, matching the
// API's requirement that meeting start/end times fall on a 15 minute boundary.
const MEETING_TIME_STEPS = { minutes: 15 }

const NO_ROOM_AVAILABLE_MESSAGE = 'No suitable room is available for that time - try adjusting the attendees or time.'

function nextFifteenMinuteBoundary(from: Dayjs): Dayjs {
  const rounded = from.second(0).millisecond(0)
  const remainder = rounded.minute() % 15
  return remainder === 0 ? rounded : rounded.add(15 - remainder, 'minute')
}

// Matches RoomAvailabilityPage's own DATE_PARAM_PATTERN - the shape of the date it passes via
// router state when linking here (see below), so a malformed/unexpected state value falls back
// to today rather than producing an invalid Dayjs.
const VIEWED_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function defaultDate(viewedDate?: string): Dayjs {
  if (viewedDate && VIEWED_DATE_PATTERN.test(viewedDate)) {
    const parsed = dayjs(viewedDate)
    if (parsed.isValid()) {
      return parsed.startOf('day')
    }
  }
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
  const location = useLocation()
  const { personId, dateFormat, timeFormat } = useAuth()
  // RoomAvailabilityPage's "Add Meeting" links pass the date currently being viewed via router
  // state, so the form defaults to that date rather than always today - see defaultDate() above.
  // Only read once, on mount: this is a one-time initial value, not something that should keep
  // resetting the field if location.state were to change later on the same mounted page.
  const viewedDate = (location.state as { date?: string } | null)?.date

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
  const [date, setDate] = useState<Dayjs | null>(() => defaultDate(viewedDate))
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
  // through it - see addMeetingLogic.ts's SuggestionCache for why `candidates: null` is kept
  // distinct from an empty array.
  const [suggestionCache, setSuggestionCache] = useState<SuggestionCache>(initialSuggestionCache)

  const meetingStartTime = combineDateAndTime(date, startTime)
  const meetingEndTime = combineDateAndTime(date, endTime)

  // The cached suggestion list is only valid for the time/attendee-count it was fetched for -
  // handleSuggestRoom compares this against suggestionCache.key on every press and re-fetches
  // whenever they differ, rather than a separate effect clearing the cache asynchronously
  // whenever these inputs change (see addMeetingLogic.ts's SuggestionCache doc comment for why
  // that shape had a real race under genuine network latency).
  const suggestionKey = `${meetingStartTime}|${meetingEndTime}|${attendeeIds.length}`

  // Sorted alphabetically, matching the convention SettingsPage/RoomAvailabilityPage/
  // PersonCalendarPage already use for these same lists.
  const rooms = [...(roomsData?.rooms ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  const people = [...(peopleData?.people ?? [])].sort((a, b) => a.name.localeCompare(b.name))

  // The organiser and attendees are kept mutually exclusive: whoever is picked as one is not
  // offered as a choice for the other. This is enforced authoritatively server-side (the
  // OrganiserIsAttendee validation error) - filtering here is purely a UX nicety so a user can't
  // even attempt the combination, not a substitute for that server-side check. Because each list
  // is derived from organiserId/attendeeIds on every render, adding someone to one side
  // immediately removes them as an option on the other, and removing them makes them a selectable
  // option again there - there's no separate "sync" step to keep these consistent. See
  // addMeetingLogic.ts for the (unit-tested) filtering functions themselves.
  const organiserOptions = filterOrganiserOptions(people, attendeeIds)
  const attendeeOptions = filterAttendeeOptions(people, organiserId)

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

  function handleAttendeesChange(selected: Person[]) {
    setAttendeeIds(selected.map((person) => person.id))
  }

  function handleOrganiserChange(selected: Person | null) {
    setOrganiserTouched(true)
    setOrganiserId(selected?.id ?? '')
  }

  function handleRoomChange(selected: Room | null) {
    setRoomId(selected?.id ?? '')
  }

  async function handleSuggestRoom() {
    setSuggestionErrors([])

    let fetchedRooms: Room[] | undefined
    if (suggestionCache.key !== suggestionKey || suggestionCache.candidates === null) {
      const result = await suggestRoom({
        variables: {
          startTime: meetingStartTime,
          endTime: meetingEndTime,
          requiredCapacity: attendeeIds.length + 1,
        },
      })
      fetchedRooms = result.data?.suggestRoom ?? []
    }

    const { cache, room } = advanceSuggestion(suggestionCache, suggestionKey, fetchedRooms)
    setSuggestionCache(cache)

    if (room === null) {
      setSuggestionErrors([NO_ROOM_AVAILABLE_MESSAGE])
    } else {
      setRoomId(room.id)
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

            <Autocomplete
              options={organiserOptions}
              getOptionLabel={(person) => person.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={people.find((person) => person.id === organiserId) ?? null}
              onChange={(_event, selected) => handleOrganiserChange(selected)}
              autoHighlight
              renderInput={(params) => <TextField {...params} label="Organiser" />}
            />

            <Autocomplete
              multiple
              disableCloseOnSelect
              limitTags={3}
              options={attendeeOptions}
              getOptionLabel={(person) => person.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={people.filter((person) => attendeeIds.includes(person.id))}
              onChange={(_event, selected) => handleAttendeesChange(selected)}
              autoHighlight
              renderOption={(props, option, { selected }) => {
                const { key, ...optionProps } = props
                return (
                  <li key={key} {...optionProps}>
                    <Checkbox checked={selected} />
                    <ListItemText primary={option.name} />
                  </li>
                )
              }}
              renderInput={(params) => <TextField {...params} label="Attendees" />}
            />

            {/* Explicit format/ampm rather than MUI's locale defaults, which are US-style
                (MM/DD/YYYY, 12-hour) and so used to disagree with the ISO/24-hour strings the
                rest of the app rendered. This is the one place a format drives input parsing as
                well as display: what the user types is read back through the same pattern. */}
            <DatePicker
              label="Date"
              format={datePickerFormat(dateFormat)}
              value={date}
              onChange={(value) => setDate(value)}
              slotProps={{ textField: { fullWidth: true } }}
            />
            <TimePicker
              label="Start time"
              ampm={timePickerUsesAmPm(timeFormat)}
              value={startTime}
              onChange={(value) => setStartTime(value)}
              timeSteps={MEETING_TIME_STEPS}
              slotProps={{ textField: { fullWidth: true } }}
            />
            <TimePicker
              label="End time"
              ampm={timePickerUsesAmPm(timeFormat)}
              value={endTime}
              onChange={(value) => setEndTime(value)}
              timeSteps={MEETING_TIME_STEPS}
              slotProps={{ textField: { fullWidth: true } }}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' } }}>
              <Autocomplete
                fullWidth
                options={rooms}
                getOptionLabel={(room) => `${room.name} (capacity ${room.capacity})`}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                value={rooms.find((room) => room.id === roomId) ?? null}
                onChange={(_event, selected) => handleRoomChange(selected)}
                autoHighlight
                renderInput={(params) => <TextField {...params} label="Room" />}
              />
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

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
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
