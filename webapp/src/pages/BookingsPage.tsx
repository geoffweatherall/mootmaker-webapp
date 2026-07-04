import { useQuery } from '@apollo/client/react'
import AddIcon from '@mui/icons-material/Add'
import {
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Link } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { SuccessToast } from '../components/SuccessToast'
import { errorMessages } from '../graphql/errorMessages'
import { formatLocalDateTime } from '../graphql/formatDateTime'
import { LIST_BOOKINGS } from '../graphql/queries'
import { useLocationToast } from '../hooks/useLocationToast'
import type { Booking } from '../graphql/types'
import { useState } from 'react'

export default function BookingsPage() {
  const { data, loading, error } = useQuery<{ bookings: Booking[] }>(LIST_BOOKINGS, {
    fetchPolicy: 'cache-and-network',
  })
  const { message, clear } = useLocationToast()
  const [dismissedError, setDismissedError] = useState(false)

  const bookings = data?.bookings ?? []

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          Bookings
        </Typography>
        <Button component={Link} to="/bookings/add" variant="contained" startIcon={<AddIcon />}>
          Add
        </Button>
      </Stack>

      {loading && data && <LinearProgress />}

      {!dismissedError && (
        <ErrorBanner messages={errorMessages(error)} onDismiss={() => setDismissedError(true)} />
      )}

      {loading && !data ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : bookings.length === 0 ? (
        !error && <Typography color="text.secondary">No bookings exist yet.</Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Room</TableCell>
                <TableCell>Organiser</TableCell>
                <TableCell>Attendees</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bookings.map((booking) => (
                <TableRow key={booking.id}>
                  <TableCell>{booking.room.name}</TableCell>
                  <TableCell>{booking.organiser.name}</TableCell>
                  <TableCell>{booking.attendees.map((a) => a.name).join(', ') || '—'}</TableCell>
                  <TableCell>{formatLocalDateTime(booking.startTime)}</TableCell>
                  <TableCell>{formatLocalDateTime(booking.endTime)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <SuccessToast message={message} onClose={clear} />
    </Stack>
  )
}
