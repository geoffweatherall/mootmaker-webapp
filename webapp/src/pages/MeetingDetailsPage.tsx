import { useQuery } from '@apollo/client/react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Box, Button, CircularProgress, Divider, Paper, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { PersonAvatar } from '../components/PersonAvatar'
import { errorMessages } from '../graphql/errorMessages'
import { useAuth } from '../auth/authContext'
import { formatLocalDate, formatLocalTime } from '../graphql/formatDateTime'
import { MEETING_BY_ID } from '../graphql/queries'
import type { Person } from '../graphql/types'
import { useState } from 'react'

interface DetailRowProps {
  label: string
  value: ReactNode
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <Stack direction="row" spacing={2}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 140, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography component="div" variant="body1">
        {value}
      </Typography>
    </Stack>
  )
}

/** A person's avatar next to their name - used for both the Organiser and Attendees rows below. */
function PersonRow({ person }: { person: Person }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <PersonAvatar name={person.name} size={24} />
      <Typography variant="body1">{person.name}</Typography>
    </Stack>
  )
}

export default function MeetingDetailsPage() {
  const { dateFormat, timeFormat } = useAuth()
  const { meetingId } = useParams<{ meetingId: string }>()
  const navigate = useNavigate()
  const [dismissedError, setDismissedError] = useState(false)

  // One meeting, by id, in two point reads on the server - an id-to-date pointer and then that day.
  // This used to fetch EVERY meeting ever stored and find() the right one client-side, which the
  // schema's own documentation warned against and which got slower with every meeting booked.
  //
  // Names are selected here, unlike the day-embedded meetings elsewhere: a details page reached cold
  // from a shared or bookmarked link has no cached rooms or people to resolve ids against.
  const { data, loading, error } = useQuery(MEETING_BY_ID, {
    variables: { id: meetingId ?? '' },
    skip: !meetingId,
    fetchPolicy: 'cache-and-network',
  })

  // Null covers both "no such meeting" and "its day has aged out of retention" - deliberately the
  // same answer, so this page has one not-found state rather than two.
  const meeting = data?.meeting

  return (
    <Stack spacing={3}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ alignSelf: 'flex-start' }}>
        Back
      </Button>

      {!dismissedError && (
        <ErrorBanner messages={errorMessages(error)} onDismiss={() => setDismissedError(true)} />
      )}

      {loading && !data ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : !meeting ? (
        !error && <Typography color="text.secondary">Meeting not found.</Typography>
      ) : (
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h4" component="h1">
              {meeting.subject}
            </Typography>
            <Divider />
            <Stack spacing={1.5}>
              <DetailRow label="Room" value={`${meeting.room.name} (capacity ${meeting.room.capacity})`} />
              <DetailRow label="Organiser" value={<PersonRow person={meeting.organiser} />} />
              <DetailRow
                label="Attendees"
                value={
                  meeting.attendees.length === 0 ? (
                    <Typography variant="body1" color="text.secondary">
                      None
                    </Typography>
                  ) : (
                    <Stack spacing={1}>
                      {meeting.attendees.map((attendee) => (
                        <PersonRow key={attendee.id} person={attendee} />
                      ))}
                    </Stack>
                  )
                }
              />
              <DetailRow label="Date" value={formatLocalDate(meeting.startTime, dateFormat)} />
              <DetailRow
                label="Time"
                value={`${formatLocalTime(meeting.startTime, timeFormat)}–${formatLocalTime(meeting.endTime, timeFormat)}`}
              />
            </Stack>
          </Stack>
        </Paper>
      )}
    </Stack>
  )
}
