import { useMutation } from '@apollo/client/react'
import { Button, Paper, Stack, TextField, Typography } from '@mui/material'
import dayjs from 'dayjs'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { SubmitButton } from '../components/SubmitButton'
import { errorMessages } from '../graphql/errorMessages'
import { CREATE_ROOM } from '../graphql/mutations'
import { ROOM_ERROR_MESSAGES } from '../graphql/types'
import type { CreateRoomResult } from '../graphql/types'

export default function AddRoomPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('')
  const [roomErrors, setRoomErrors] = useState<string[]>([])
  const [createRoom, { loading, error, reset }] = useMutation<{ createRoom: CreateRoomResult }>(
    CREATE_ROOM,
  )

  const bannerMessages = [...roomErrors, ...errorMessages(error)]

  function dismissBanner() {
    setRoomErrors([])
    reset()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setRoomErrors([])

    const result = await createRoom({
      variables: { room: { name, capacity: Number(capacity) } },
    })

    const payload = result.data?.createRoom
    if (payload?.errors.length) {
      setRoomErrors(payload.errors.map((code) => ROOM_ERROR_MESSAGES[code]))
      return
    }
    if (payload?.room) {
      navigate(`/rooms/${dayjs().format('YYYY-MM-DD')}/availability`, {
        state: { toast: `${payload.room.name} was successfully added.` },
      })
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Add Room
      </Typography>

      <ErrorBanner messages={bannerMessages} onDismiss={dismissBanner} />

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
            <SubmitButton loading={loading}>Save</SubmitButton>
            <Button variant="outlined" onClick={() => navigate(-1)} disabled={loading}>
              Cancel
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  )
}
