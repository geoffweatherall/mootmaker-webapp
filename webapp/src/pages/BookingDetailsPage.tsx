import { useQuery } from '@apollo/client/react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Box, Button, CircularProgress, Divider, Paper, Stack, Typography } from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { errorMessages } from '../graphql/errorMessages'
import { formatLocalDateTime } from '../graphql/formatDateTime'
import { LIST_BOOKINGS } from '../graphql/queries'
import type { Booking } from '../graphql/types'
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

export default function BookingDetailsPage() {
  const { bookingId } = useParams<{ bookingId: string }>()
  const navigate = useNavigate()
  const [dismissedError, setDismissedError] = useState(false)

  const { data, loading, error } = useQuery<{ bookings: Booking[] }>(LIST_BOOKINGS, {
    fetchPolicy: 'cache-and-network',
  })

  const booking = data?.bookings.find((candidate) => candidate.id === bookingId)

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
      ) : !booking ? (
        !error && <Typography color="text.secondary">Booking not found.</Typography>
      ) : (
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h4" component="h1">
              {booking.subject}
            </Typography>
            <Divider />
            <Stack spacing={1.5}>
              <DetailRow label="Room" value={`${booking.room.name} (capacity ${booking.room.capacity})`} />
              <DetailRow label="Organiser" value={booking.organiser.name} />
              <DetailRow
                label="Attendees"
                value={booking.attendees.map((attendee) => attendee.name).join(', ') || 'None'}
              />
              <DetailRow label="Start" value={formatLocalDateTime(booking.startTime)} />
              <DetailRow label="End" value={formatLocalDateTime(booking.endTime)} />
            </Stack>
          </Stack>
        </Paper>
      )}
    </Stack>
  )
}
