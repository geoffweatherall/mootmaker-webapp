import { useMutation } from '@apollo/client/react'
import { Button, Paper, Stack, TextField, Typography } from '@mui/material'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { errorMessages } from '../graphql/errorMessages'
import { CREATE_ROOM } from '../graphql/mutations'
import type { Room } from '../graphql/types'

export default function AddRoomPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [createRoom, { loading, error, reset }] = useMutation<{ createRoom: Room }>(CREATE_ROOM)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()

    const result = await createRoom({
      variables: { room: { name, capacity: Number(capacity) } },
    })
    if (result.data) {
      navigate('/rooms', { state: { toast: `${result.data.createRoom.name} was successfully added.` } })
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Add Room
      </Typography>

      <ErrorBanner messages={errorMessages(error)} onDismiss={reset} />

      <Paper sx={{ p: 3 }}>
        <Stack component="form" spacing={3} onSubmit={handleSubmit}>
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            fullWidth
          />
          <TextField
            label="Capacity"
            type="number"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
            slotProps={{ htmlInput: { min: 0 } }}
            fullWidth
          />
          <Stack direction="row" spacing={2}>
            <Button type="submit" variant="contained" disabled={loading}>
              Save
            </Button>
            <Button variant="outlined" onClick={() => navigate('/rooms')} disabled={loading}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  )
}
