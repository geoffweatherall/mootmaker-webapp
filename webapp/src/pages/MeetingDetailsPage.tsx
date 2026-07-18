import { useQuery } from '@apollo/client/react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Box, Button, CircularProgress, Divider, Paper, Stack, Typography } from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { errorMessages } from '../graphql/errorMessages'
import { formatLocalDateTime } from '../graphql/formatDateTime'
import { LIST_MEETINGS } from '../graphql/queries'
import type { Meeting } from '../graphql/types'
import { useState } from 'react'

interface DetailRowProps {
  label: string
  value: string
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <Stack direction="row" spacing={2}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 140, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body1">{value}</Typography>
    </Stack>
  )
}

export default function MeetingDetailsPage() {
  const { meetingId } = useParams<{ meetingId: string }>()
  const navigate = useNavigate()
  const [dismissedError, setDismissedError] = useState(false)

  const { data, loading, error } = useQuery<{ meetings: Meeting[] }>(LIST_MEETINGS, {
    fetchPolicy: 'cache-and-network',
  })

  const meeting = data?.meetings.find((candidate) => candidate.id === meetingId)

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
              <DetailRow label="Organiser" value={meeting.organiser.name} />
              <DetailRow
                label="Attendees"
                value={meeting.attendees.map((attendee) => attendee.name).join(', ') || 'None'}
              />
              <DetailRow label="Start" value={formatLocalDateTime(meeting.startTime)} />
              <DetailRow label="End" value={formatLocalDateTime(meeting.endTime)} />
            </Stack>
          </Stack>
        </Paper>
      )}
    </Stack>
  )
}
