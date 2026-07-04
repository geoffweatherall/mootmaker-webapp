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
import { LIST_ROOMS } from '../graphql/queries'
import { useLocationToast } from '../hooks/useLocationToast'
import type { Room } from '../graphql/types'
import { useState } from 'react'

export default function RoomsPage() {
  const { data, loading, error } = useQuery<{ rooms: Room[] }>(LIST_ROOMS, {
    fetchPolicy: 'cache-and-network',
  })
  const { message, clear } = useLocationToast()
  const [dismissedError, setDismissedError] = useState(false)

  const rooms = data?.rooms ?? []

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          Rooms
        </Typography>
        <Button component={Link} to="/rooms/add" variant="contained" startIcon={<AddIcon />}>
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
      ) : rooms.length === 0 ? (
        !error && <Typography color="text.secondary">No rooms exist yet.</Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell align="right">Capacity</TableCell>
                <TableCell>ID</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell>{room.name}</TableCell>
                  <TableCell align="right">{room.capacity}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                    {room.id}
                  </TableCell>
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
