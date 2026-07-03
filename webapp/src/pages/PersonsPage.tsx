import { useQuery } from '@apollo/client/react'
import AddIcon from '@mui/icons-material/Add'
import {
  Box,
  Button,
  CircularProgress,
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
import { LIST_PEOPLE } from '../graphql/queries'
import { useLocationToast } from '../hooks/useLocationToast'
import type { Person } from '../graphql/types'
import { useState } from 'react'

export default function PersonsPage() {
  const { data, loading, error } = useQuery<{ people: Person[] }>(LIST_PEOPLE, {
    fetchPolicy: 'cache-and-network',
  })
  const { message, clear } = useLocationToast()
  const [dismissedError, setDismissedError] = useState(false)

  const people = data?.people ?? []

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          People
        </Typography>
        <Button component={Link} to="/persons/add" variant="contained" startIcon={<AddIcon />}>
          Add
        </Button>
      </Stack>

      {!dismissedError && (
        <ErrorBanner messages={errorMessages(error)} onDismiss={() => setDismissedError(true)} />
      )}

      {loading && !data ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : people.length === 0 ? (
        !error && <Typography color="text.secondary">No people exist yet.</Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>ID</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {people.map((person) => (
                <TableRow key={person.id}>
                  <TableCell>{person.name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                    {person.id}
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
