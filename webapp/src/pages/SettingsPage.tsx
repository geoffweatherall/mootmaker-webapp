import { useMutation, useQuery } from '@apollo/client/react'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/authContext'
import { ErrorBanner } from '../components/ErrorBanner'
import { SubmitButton } from '../components/SubmitButton'
import { SuccessToast } from '../components/SuccessToast'
import { errorMessages } from '../graphql/errorMessages'
import { CREATE_PERSON, CREATE_ROOM, UPDATE_PERSON, UPDATE_ROOM } from '../graphql/mutations'
import { LIST_PEOPLE, LIST_ROOMS } from '../graphql/queries'
import {
  PERSON_ERROR_MESSAGES,
  ROOM_ERROR_MESSAGES,
  type CreateRoomResult,
  type Person,
  type Room,
  type UpdatePersonResult,
  type UpdateRoomResult,
} from '../graphql/types'

export default function SettingsPage() {
  const { isAdmin } = useAuth()

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Settings
      </Typography>
      <NameSection />
      {isAdmin && <RoomsSection />}
      {isAdmin && <PeopleSection />}
    </Stack>
  )
}

/** Everyone gets this section - it's the only one a standard user sees. */
function NameSection() {
  const { displayName, email, personId, refreshPerson } = useAuth()
  const [name, setName] = useState(displayName ?? '')
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [updatePerson, { loading, error, reset }] = useMutation<{ updatePerson: UpdatePersonResult }>(UPDATE_PERSON)

  // displayName resolves asynchronously (Cognito name first, then the myPerson query overrides it
  // once it loads) - reseed the field whenever the linked person becomes known so it doesn't get
  // stuck on the pre-load fallback.
  useEffect(() => {
    if (personId) setName(displayName ?? '')
  }, [personId, displayName])

  const bannerMessages = [...fieldErrors, ...errorMessages(error)]

  function dismissBanner() {
    setFieldErrors([])
    reset()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!personId) return
    setFieldErrors([])

    const result = await updatePerson({ variables: { id: personId, person: { name } } })
    const payload = result.data?.updatePerson
    if (payload?.errors.length) {
      setFieldErrors(payload.errors.map((code) => PERSON_ERROR_MESSAGES[code]))
      return
    }
    if (payload?.person) {
      refreshPerson()
      setSuccessMessage('Your name was updated.')
    }
  }

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          Your name
        </Typography>
        <ErrorBanner messages={bannerMessages} onDismiss={dismissBanner} />
        <Stack component="form" direction="row" spacing={2} onSubmit={handleSubmit} sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!personId}
            sx={{ flexGrow: 1, minWidth: 240 }}
          />
          <SubmitButton loading={loading} disabled={!personId}>
            Save
          </SubmitButton>
        </Stack>
        {!personId && (
          <Typography variant="body2" color="text.secondary">
            Your account has no linked person yet, so your name can&apos;t be changed here.
          </Typography>
        )}
        <Stack>
          <Typography variant="body2" color="text.secondary">
            Email
          </Typography>
          <Typography variant="body1">{email}</Typography>
        </Stack>
      </Stack>
      <SuccessToast message={successMessage} onClose={() => setSuccessMessage(null)} />
    </Paper>
  )
}

/** Admin only - lists every room, with an edit dialog per row and an "Add room" dialog. */
function RoomsSection() {
  const { data, loading, error, refetch } = useQuery<{ rooms: Room[] }>(LIST_ROOMS, { fetchPolicy: 'cache-and-network' })
  const [dialogRoom, setDialogRoom] = useState<Room | 'new' | null>(null)

  const rooms = [...(data?.rooms ?? [])].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" component="h2">
            Rooms
          </Typography>
          <Button startIcon={<AddIcon />} onClick={() => setDialogRoom('new')}>
            Add room
          </Button>
        </Stack>
        <ErrorBanner messages={errorMessages(error)} onDismiss={() => {}} />
        {loading && !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : rooms.length === 0 ? (
          !error && <Typography color="text.secondary">No rooms exist yet.</Typography>
        ) : (
          <List dense disablePadding>
            {rooms.map((room) => (
              <ListItem
                key={room.id}
                secondaryAction={
                  <IconButton edge="end" aria-label={`Edit ${room.name}`} onClick={() => setDialogRoom(room)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                }
                disableGutters
              >
                <ListItemText primary={room.name} secondary={`Capacity ${room.capacity}`} />
              </ListItem>
            ))}
          </List>
        )}
      </Stack>
      {dialogRoom !== null && (
        <RoomDialog
          room={dialogRoom === 'new' ? null : dialogRoom}
          onClose={() => setDialogRoom(null)}
          onSaved={() => {
            setDialogRoom(null)
            refetch()
          }}
        />
      )}
    </Paper>
  )
}

interface RoomDialogProps {
  /** null means "create a new room" - otherwise the room being edited. */
  room: Room | null
  onClose: () => void
  onSaved: () => void
}

function RoomDialog({ room, onClose, onSaved }: RoomDialogProps) {
  const [name, setName] = useState(room?.name ?? '')
  const [capacity, setCapacity] = useState(room ? String(room.capacity) : '')
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [createRoom, createState] = useMutation<{ createRoom: CreateRoomResult }>(CREATE_ROOM)
  const [updateRoom, updateState] = useMutation<{ updateRoom: UpdateRoomResult }>(UPDATE_ROOM)
  const loading = createState.loading || updateState.loading
  const bannerMessages = [...fieldErrors, ...errorMessages(createState.error), ...errorMessages(updateState.error)]

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldErrors([])
    const roomInput = { name, capacity: Number(capacity) }

    if (room) {
      const result = await updateRoom({ variables: { id: room.id, room: roomInput } })
      const payload = result.data?.updateRoom
      if (payload?.errors.length) {
        setFieldErrors(payload.errors.map((code) => ROOM_ERROR_MESSAGES[code]))
        return
      }
      if (payload?.room) onSaved()
    } else {
      const result = await createRoom({ variables: { room: roomInput } })
      const payload = result.data?.createRoom
      if (payload?.errors.length) {
        setFieldErrors(payload.errors.map((code) => ROOM_ERROR_MESSAGES[code]))
        return
      }
      if (payload?.room) onSaved()
    }
  }

  return (
    <Dialog open onClose={loading ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{room ? 'Edit room' : 'Add room'}</DialogTitle>
      <Stack component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={3}>
            <ErrorBanner messages={bannerMessages} onDismiss={() => setFieldErrors([])} />
            <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} autoFocus fullWidth />
            <TextField
              label="Capacity"
              type="number"
              value={capacity}
              onChange={(event) => setCapacity(event.target.value)}
              slotProps={{ htmlInput: { min: 0 } }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <SubmitButton loading={loading}>Save</SubmitButton>
        </DialogActions>
      </Stack>
    </Dialog>
  )
}

/** Admin only - lists every person, with an edit dialog per row and an "Add person" dialog. */
function PeopleSection() {
  const { data, loading, error, refetch } = useQuery<{ people: Person[] }>(LIST_PEOPLE, { fetchPolicy: 'cache-and-network' })
  const [dialogPerson, setDialogPerson] = useState<Person | 'new' | null>(null)

  const people = [...(data?.people ?? [])].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Paper sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" component="h2">
            People
          </Typography>
          <Button startIcon={<AddIcon />} onClick={() => setDialogPerson('new')}>
            Add person
          </Button>
        </Stack>
        <ErrorBanner messages={errorMessages(error)} onDismiss={() => {}} />
        {loading && !data ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : people.length === 0 ? (
          !error && <Typography color="text.secondary">No people exist yet.</Typography>
        ) : (
          <List dense disablePadding>
            {people.map((person) => (
              <ListItem
                key={person.id}
                secondaryAction={
                  <IconButton edge="end" aria-label={`Edit ${person.name}`} onClick={() => setDialogPerson(person)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                }
                disableGutters
              >
                <ListItemText primary={person.name} />
              </ListItem>
            ))}
          </List>
        )}
      </Stack>
      {dialogPerson !== null && (
        <PersonDialog
          person={dialogPerson === 'new' ? null : dialogPerson}
          onClose={() => setDialogPerson(null)}
          onSaved={() => {
            setDialogPerson(null)
            refetch()
          }}
        />
      )}
    </Paper>
  )
}

interface PersonDialogProps {
  /** null means "create a new person" - otherwise the person being edited. */
  person: Person | null
  onClose: () => void
  onSaved: () => void
}

function PersonDialog({ person, onClose, onSaved }: PersonDialogProps) {
  const [name, setName] = useState(person?.name ?? '')
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [createPerson, createState] = useMutation<{ createPerson: Person }>(CREATE_PERSON)
  const [updatePerson, updateState] = useMutation<{ updatePerson: UpdatePersonResult }>(UPDATE_PERSON)
  const loading = createState.loading || updateState.loading
  const bannerMessages = [...fieldErrors, ...errorMessages(createState.error), ...errorMessages(updateState.error)]

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldErrors([])

    if (person) {
      const result = await updatePerson({ variables: { id: person.id, person: { name } } })
      const payload = result.data?.updatePerson
      if (payload?.errors.length) {
        setFieldErrors(payload.errors.map((code) => PERSON_ERROR_MESSAGES[code]))
        return
      }
      if (payload?.person) onSaved()
    } else {
      if (!name.trim()) {
        setFieldErrors([PERSON_ERROR_MESSAGES.NameRequired])
        return
      }
      const result = await createPerson({ variables: { person: { name } } })
      if (result.data?.createPerson) onSaved()
    }
  }

  return (
    <Dialog open onClose={loading ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{person ? 'Edit person' : 'Add person'}</DialogTitle>
      <Stack component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={3}>
            <ErrorBanner messages={bannerMessages} onDismiss={() => setFieldErrors([])} />
            <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} autoFocus fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <SubmitButton loading={loading}>Save</SubmitButton>
        </DialogActions>
      </Stack>
    </Dialog>
  )
}
