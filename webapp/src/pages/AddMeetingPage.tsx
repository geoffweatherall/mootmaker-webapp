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
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { datePickerFormat, timePickerUsesAmPm } from '../graphql/formatDateTime'
import { ErrorBanner } from '../components/ErrorBanner'
import { PersonAvatar } from '../components/PersonAvatar'
import { SubmitButton } from '../components/SubmitButton'
import { dayInvalidations } from '../apolloClient'
import { errorMessages } from '../graphql/errorMessages'
import { CREATE_MEETING, UPDATE_MEETING } from '../graphql/mutations'
import { MEETING_BY_ID, REFERENCE_DATA, SUGGEST_ROOM } from '../graphql/queries'
import {
  MEETING_ERROR_MESSAGES,
} from '../graphql/validationMessages'
import type { CreateMeetingResult, Person, Room, UpdateMeetingResult } from '../graphql/types'
import { SparkleIcon } from '../icons'
import {
  advanceSuggestion,
  defaultMeetingTimes,
  filterAttendeeOptions,
  filterOrganiserOptions,
  prioritizeCurrentRoom,
  referenceDataReady,
  initialSuggestionCache,
  type DefaultMeetingTimes,
  type SuggestionCache,
} from './addMeetingLogic'

// Only offer minutes on a 15-minute boundary in the time picker, matching the
// API's requirement that meeting start/end times fall on a 15 minute boundary.
const MEETING_TIME_STEPS = { minutes: 15 }

const NO_ROOM_AVAILABLE_MESSAGE = 'No suitable room is available for that time - try adjusting the attendees or time.'

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

// Combines a calendar date with a time-of-day into the ISO-8601 local date-time string the API
// expects, e.g. "2026-07-01T14:30:00" - both startTime and endTime are built from the same date
// value, so a meeting can never span midnight from this form.
function combineDateAndTime(date: Dayjs | null, time: Dayjs | null): string {
  if (!date || !time) {
    return ''
  }
  return date.hour(time.hour()).minute(time.minute()).second(0).millisecond(0).format('YYYY-MM-DDTHH:mm:ss')
}

/**
 * Serves both `/meetings/add` and `/meetings/:meetingId/edit` - one form component for both,
 * mirroring SettingsPage.tsx's RoomDialog/PersonDialog precedent for a single component handling
 * create and edit, rather than two separately maintained copies of this field set (see
 * designs/edit-and-cancel-meetings.md's Decision 2). `meetingId` present (from the route) is what
 * switches every edit-specific behaviour below: heading, prefill, which mutation fires, and
 * `excludingMeetingId`/same-room-priority on "Suggest a room".
 */
export default function AddMeetingPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { meetingId } = useParams<{ meetingId?: string }>()
  const isEdit = Boolean(meetingId)
  const { personId, personLoading, dateFormat, timeFormat } = useAuth()
  // RoomAvailabilityPage's "Add Meeting" links pass the date currently being viewed via router
  // state, so the form defaults to that date rather than always today - see defaultDate() above.
  // Person Calendar's FAB instead passes the person being viewed, pre-filled as an attendee (not
  // organiser - opening this form from someone's calendar reads as "schedule a meeting with them",
  // see the design doc's FAB pre-fill decision). Both read once, on mount: one-time initial values,
  // not something that should keep resetting a field if location.state were to change later on the
  // same mounted page. Neither applies to edit - Edit always fetches the meeting fresh by id
  // (below), never trusting location.state, so a bookmarked/shared edit link works the same as a
  // freshly-clicked one.
  const routerState = location.state as { date?: string; attendeeId?: string } | null
  const viewedDate = isEdit ? undefined : routerState?.date
  const prefilledAttendeeId = isEdit ? undefined : routerState?.attendeeId

  const {
    data: referenceData,
    loading: referenceLoading,
    error: referenceError,
  } = useQuery(REFERENCE_DATA)

  // Only runs in edit mode (`skip`). Always a fresh fetch by id, never the sheet/panel's own
  // in-memory snapshot - see the design doc's Decision 3: this is what makes a bookmarked/shared
  // `/meetings/:meetingId/edit` link work, and avoids editing stale data if the sheet's snapshot
  // has drifted from the server.
  const {
    data: existingMeetingData,
    loading: existingMeetingLoading,
    error: existingMeetingError,
  } = useQuery(MEETING_BY_ID, {
    variables: { id: meetingId ?? '' },
    skip: !isEdit,
    fetchPolicy: 'network-only',
  })
  const existingMeeting = existingMeetingData?.meeting

  const [subject, setSubject] = useState('')
  const [roomId, setRoomId] = useState('')
  const [organiserId, setOrganiserId] = useState('')
  const [organiserTouched, setOrganiserTouched] = useState(false)
  const [attendeeIds, setAttendeeIds] = useState<string[]>(() => (prefilledAttendeeId ? [prefilledAttendeeId] : []))
  const [date, setDate] = useState<Dayjs | null>(() => defaultDate(viewedDate))
  // One computation for both, held in state so a re-render never re-reads the clock - see
  // defaultMeetingTimes for why the start and end must come from the same instant.
  const [initialTimes] = useState<DefaultMeetingTimes>(() => defaultMeetingTimes(dayjs()))
  const [startTime, setStartTime] = useState<Dayjs | null>(initialTimes.start)
  const [endTime, setEndTime] = useState<Dayjs | null>(initialTimes.end)
  const [meetingErrors, setMeetingErrors] = useState<string[]>([])
  const [suggestionErrors, setSuggestionErrors] = useState<string[]>([])
  // The meeting's OWN current room, captured once when the fetched meeting is seeded into the
  // form below - distinct from `roomId` state, which the user can go on to change. This is what
  // "Suggest a room"'s same-room-priority (Decision 16) prioritizes: the room the meeting is IN
  // right now, not whatever the Room field happens to hold mid-edit.
  const [originalRoomId, setOriginalRoomId] = useState<string | null>(null)
  // Guards the seeding effect below so a MEETING_BY_ID refetch (this query's fetchPolicy is
  // network-only) never clobbers edits already in progress - seeding happens exactly once, the
  // instant the fetched meeting first becomes available.
  const [formSeeded, setFormSeeded] = useState(false)

  // Seeds every field from the fetched meeting, once, in edit mode only. Effect rather than a
  // lazy useState initializer because the fetch is asynchronous - the meeting isn't known yet on
  // this component's first render.
  useEffect(() => {
    if (!isEdit || !existingMeeting || formSeeded) return
    setSubject(existingMeeting.subject)
    setRoomId(existingMeeting.room.id)
    setOriginalRoomId(existingMeeting.room.id)
    setOrganiserId(existingMeeting.organiser.id)
    setOrganiserTouched(true)
    setAttendeeIds(existingMeeting.attendees.map((attendee) => attendee.person.id))
    const start = dayjs(existingMeeting.startTime)
    setDate(start.startOf('day'))
    setStartTime(start)
    setEndTime(dayjs(existingMeeting.endTime))
    setFormSeeded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, existingMeeting, formSeeded])

  const [createMeeting, { loading: creating, error: createError, reset: resetCreateError }] = useMutation<{
    createMeeting: CreateMeetingResult
  }>(CREATE_MEETING)
  const [updateMeeting, { loading: updating, error: updateError, reset: resetUpdateError }] = useMutation<{
    updateMeeting: UpdateMeetingResult
  }>(UPDATE_MEETING)
  const submitting = isEdit ? updating : creating
  const mutationError = isEdit ? updateError : createError
  const resetMutationError = isEdit ? resetUpdateError : resetCreateError

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
  //
  // Never runs at all in edit mode - the seeding effect above sets organiserTouched itself, so an
  // edit never has this default apply over the meeting's own already-fetched organiser.
  useEffect(() => {
    if (!isEdit && personId && !organiserTouched && !attendeeIds.includes(personId)) {
      setOrganiserId(personId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, personId, attendeeIds])

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
  const rooms = [...(referenceData?.workspace.rooms ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  const people = [...(referenceData?.workspace.people ?? [])].sort((a, b) => a.name.localeCompare(b.name))

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
    ...errorMessages(referenceError),
    ...errorMessages(existingMeetingError),
    ...meetingErrors,
    ...suggestionErrors,
    ...errorMessages(mutationError),
  ]

  function dismissBanner() {
    setMeetingErrors([])
    setSuggestionErrors([])
    resetMutationError()
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
          excludingMeetingId: isEdit ? meetingId : undefined,
        },
      })
      const raw = result.data?.suggestRoom ?? []
      // Same-room priority (Decision 16) - a no-op outside edit mode, since originalRoomId is
      // null until the seeding effect above sets it.
      fetchedRooms = prioritizeCurrentRoom(raw, originalRoomId)
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

    const meetingInput = {
      subject,
      roomId,
      organiserId,
      attendeeIds,
      startTime: meetingStartTime,
      endTime: meetingEndTime,
    }

    if (isEdit) {
      const result = await updateMeeting({ variables: { id: meetingId ?? '', meeting: meetingInput } })
      const payload = result.data?.updateMeeting
      if (payload?.errors.length) {
        setMeetingErrors(payload.errors.map((code) => MEETING_ERROR_MESSAGES[code]))
        return
      }
      if (payload?.meeting) {
        const bookedDate = payload.meeting.startTime.slice(0, 10)
        // Both dates: a same-day edit only touches one, but a cross-day one touches two, and
        // suppressing eviction for the wrong (or only one) of them would flicker the other -
        // see designs/edit-and-cancel-meetings.md's "Real-time" technical consideration.
        dayInvalidations.noteOwnWrite(
          originalRoomId !== null && existingMeeting ? [existingMeeting.startTime.slice(0, 10), bookedDate] : [bookedDate],
        )
        navigate(`/rooms/${bookedDate}/availability`, {
          state: { toast: 'Meeting was successfully updated.' },
        })
      }
      return
    }

    const result = await createMeeting({ variables: { meeting: meetingInput } })

    const payload = result.data?.createMeeting
    if (payload?.errors.length) {
      setMeetingErrors(payload.errors.map((code) => MEETING_ERROR_MESSAGES[code]))
      return
    }
    if (payload?.meeting) {
      const bookedDate = payload.meeting.startTime.slice(0, 10)

      // This tab is also a subscriber, so the server's broadcast for this booking comes back to
      // us. Without this it would evict the Day our own mutation response just wrote
      // authoritatively, and re-render empty while refetching - the person who made the booking
      // watching their own screen flicker, on every create.
      dayInvalidations.noteOwnWrite([bookedDate])

      // Nothing is carried with the navigation any more: createMeeting returns the whole affected
      // Day, which Apollo has written over that day's cache entity, so the page being navigated to
      // already holds it. (This used to hand the new meeting over, because the old read went
      // through a GSI and DynamoDB rejects ConsistentRead on an index - both the GSI and that race
      // are gone.)
      navigate(`/rooms/${bookedDate}/availability`, {
        state: { toast: 'Meeting was successfully scheduled.' },
      })
    }
  }

  // Also gated on personLoading, not just the reference-data query, because the organiser default
  // comes from the signed-in user's own Person - which arrives from the SESSION query, NOT from the
  // reference data this page renders from. Rendering an interactive form before it lands means the
  // Organiser field is momentarily blank and the form is submittable, so a fast Save sends
  // organiserId: "" and the SERVER rejects it with OrganiserRequired: "Please select an organiser."
  // - while the field visibly fills in with the user's own name a moment later.
  //
  // Latent until reference data started being served from cache. Previously every visit paid a
  // round trip for rooms/people, which was reliably slower than the SESSION query and hid this. Now
  // a second visit renders the form instantly and the two races are the other way round. Caught by
  // F.50, which creates a room (loading reference data into the cache) and then opens this page.
  //
  // Not the same thing as having no linked Person: personLoading goes false either way, so an
  // account with no Person still gets the form with a blank Organiser, exactly as before.
  //
  // In edit mode, ALSO gated on the meeting itself having arrived and been seeded - rendering the
  // form before that would show every field blank for an instant, then jump to the fetched values,
  // exactly the flash referenceDataReady already exists to prevent for the reference-data case.
  const loadingReferenceData =
    !referenceDataReady(referenceLoading, personLoading) || (isEdit && (existingMeetingLoading || !formSeeded))

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        {isEdit ? 'Edit Meeting' : 'Add Meeting'}
      </Typography>

      <ErrorBanner messages={bannerMessages} onDismiss={dismissBanner} />

      <Paper sx={{ p: 3, maxWidth: 560 }}>
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
              renderOption={(props, option) => {
                const { key, ...optionProps } = props
                return (
                  <Box component="li" key={key} {...optionProps} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <PersonAvatar name={option.name} size={24} />
                    <ListItemText primary={option.name} />
                  </Box>
                )
              }}
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
                    <PersonAvatar name={option.name} size={24} />
                    <ListItemText primary={option.name} sx={{ ml: 1 }} />
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
