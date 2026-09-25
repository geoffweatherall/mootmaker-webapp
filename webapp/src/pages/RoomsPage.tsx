import { useMutation, useQuery } from '@apollo/client/react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fab,
  IconButton,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material'
import { useState, type FormEvent } from 'react'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { SubmitButton } from '../components/SubmitButton'
import { errorMessages } from '../graphql/errorMessages'
import { cacheRooms } from '../graphql/referenceDataCache'
import { CREATE_ROOM, DELETE_ROOM, UPDATE_ROOM } from '../graphql/mutations'
import { REFERENCE_DATA } from '../graphql/queries'
import {
  type CreateRoomResult,
  type DeleteRoomResult,
  type Room,
  type RoomColor,
  type UpdateRoomResult,
} from '../graphql/types'
import { ROOM_ERROR_MESSAGES } from '../graphql/validationMessages'
import { RoomIcon } from '../icons'
import { ROOM_COLOR_SLOTS, roomColorAt, roomColorFor } from '../theme/roomColor'

/**
 * Admin only (RequireAdmin, see App.tsx). Card grid matching RoomAvailabilityPage's own card
 * pattern - replaces the inline "Rooms" section that used to live in Settings (see the design doc,
 * "Impacts on components").
 */
export default function RoomsPage() {
  const [dialogRoom, setDialogRoom] = useState<Room | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null)
  const theme = useTheme()
  const { data, loading, error } = useQuery(REFERENCE_DATA, { fetchPolicy: 'cache-and-network' })

  const rooms = [...(data?.workspace.rooms ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  const showSpinner = loading && !data
  // `cache-and-network` always fires its network leg on mount, even with a warm cache to show in
  // the meantime (that's the whole point - see M.99). A create/edit/delete fired while that leg is
  // still in flight writes the mutation's own returned `rooms` into the cache first, then loses it
  // when the OLDER, now-stale network response for the SAME field lands after and overwrites it
  // wholesale (Query.workspace's merge policy in apolloClient.ts is a shallow spread, so whichever
  // write to `rooms` lands last wins - there's no positional/id-aware reconciliation). `loading`
  // only stays true for that one initial leg per mount, so disabling these three actions until it
  // settles closes the window without needing the FAB to move or disappear (see the layout-
  // stability rationale on the FAB below) - found via a real deployed environment where the race
  // only showed up once enough rooms existed for a first visit's fetch to still be in flight when
  // an action-hungry Playwright test collided with it.

  return (
    <Stack spacing={3}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" component="h1">
            Rooms
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage the rooms available for booking.
          </Typography>
        </Box>
      </Stack>

      <ErrorBanner messages={errorMessages(error)} onDismiss={() => {}} />

      {showSpinner ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : rooms.length === 0 ? (
        !error && <EmptyState message="No rooms exist yet." icon={RoomIcon} />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 2,
            pb: 10,
          }}
        >
          {rooms.map((room, index) => {
            const roomColor = roomColorFor(room, index, theme.palette.mode)
            return (
              <Paper key={room.id} sx={{ p: 2.5 }}>
                <Stack spacing={1.5}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: roomColor, flexShrink: 0 }} />
                    <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 700 }}>
                      {room.name}
                    </Typography>
                    <Chip label={`Capacity ${room.capacity}`} size="small" variant="outlined" />
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', borderTop: 1, borderColor: 'divider', pt: 1 }}>
                    <IconButton
                      size="small"
                      aria-label={`Edit ${room.name}`}
                      disabled={loading}
                      onClick={() => setDialogRoom(room)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label={`Remove ${room.name}`}
                      disabled={loading}
                      onClick={() => setDeleteTarget(room)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Stack>
              </Paper>
            )
          })}
        </Box>
      )}

      <Box
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          maxWidth: 'md',
          mx: 'auto',
          display: 'flex',
          justifyContent: 'flex-end',
          p: 3,
          pointerEvents: 'none',
        }}
      >
        <Fab
          color="primary"
          aria-label="Add room"
          disabled={loading}
          onClick={() => setDialogRoom('new')}
          sx={{ pointerEvents: 'auto' }}
        >
          <AddIcon />
        </Fab>
      </Box>

      {dialogRoom !== null && (
        <RoomDialog room={dialogRoom === 'new' ? null : dialogRoom} onClose={() => setDialogRoom(null)} />
      )}
      {deleteTarget && <DeleteRoomDialog room={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </Stack>
  )
}

interface RoomDialogProps {
  /** null means "create a new room" - otherwise the room being edited. */
  room: Room | null
  onClose: () => void
}

function RoomDialog({ room, onClose }: RoomDialogProps) {
  const theme = useTheme()
  const [name, setName] = useState(room?.name ?? '')
  const [capacity, setCapacity] = useState(room ? String(room.capacity) : '')
  const [color, setColor] = useState<RoomColor | null>(room?.color ?? null)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  // No refetch to race it deliberately - both mutations return the whole `rooms` collection, which
  // replaces the cached list wholesale (see referenceDataCache.ts). The remaining race, against the
  // page's OWN initial cache-and-network fetch rather than a refetch, is closed by disabling the
  // triggering buttons in the parent until that fetch settles - see the comment there.
  const [createRoom, createState] = useMutation<{ createRoom: CreateRoomResult }>(CREATE_ROOM, {
    update: (cache, { data }) => cacheRooms(cache, data?.createRoom.rooms),
  })
  const [updateRoom, updateState] = useMutation<{ updateRoom: UpdateRoomResult }>(UPDATE_ROOM, {
    update: (cache, { data }) => cacheRooms(cache, data?.updateRoom.rooms),
  })
  const loading = createState.loading || updateState.loading
  const bannerMessages = [...fieldErrors, ...errorMessages(createState.error), ...errorMessages(updateState.error)]

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldErrors([])
    const roomInput = { name, capacity: Number(capacity), color }

    if (room) {
      const result = await updateRoom({ variables: { id: room.id, room: roomInput } })
      const payload = result.data?.updateRoom
      if (payload?.errors.length) {
        setFieldErrors(payload.errors.map((code) => ROOM_ERROR_MESSAGES[code]))
        return
      }
      if (payload?.room) onClose()
    } else {
      const result = await createRoom({ variables: { room: roomInput } })
      const payload = result.data?.createRoom
      if (payload?.errors.length) {
        setFieldErrors(payload.errors.map((code) => ROOM_ERROR_MESSAGES[code]))
        return
      }
      if (payload?.room) onClose()
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
            <Stack spacing={1}>
              <Typography variant="body2" color="text.secondary">
                Colour
              </Typography>
              {/* A fixed 8-hue palette, not a free colour picker - see theme/roomColor.ts. "None"
                  reverts to the same deterministic by-position assignment every room without an
                  explicit choice already gets. exclusive + a value of '' for "None" (ToggleButton
                  values must be non-empty strings) is what makes this behave like a radio group:
                  exactly one selected at a time, never zero. */}
              <ToggleButtonGroup
                value={color ?? ''}
                exclusive
                onChange={(_event, next: RoomColor | '' | null) => setColor(next ? next : null)}
                sx={{ flexWrap: 'wrap' }}
              >
                <ToggleButton value="" aria-label="No colour" sx={{ px: 1.5 }}>
                  None
                </ToggleButton>
                {ROOM_COLOR_SLOTS.map((slot) => (
                  <ToggleButton key={slot} value={slot} aria-label={slot} sx={{ p: 1 }}>
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        bgcolor: roomColorAt(ROOM_COLOR_SLOTS.indexOf(slot), theme.palette.mode),
                      }}
                    />
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <SubmitButton loading={loading} hasError={bannerMessages.length > 0}>
            Save
          </SubmitButton>
        </DialogActions>
      </Stack>
    </Dialog>
  )
}

function DeleteRoomDialog({ room, onClose }: { room: Room; onClose: () => void }) {
  const [deleteRoom, { loading, error, reset }] = useMutation<{ deleteRoom: DeleteRoomResult }>(DELETE_ROOM, {
    update: (cache, { data }) => cacheRooms(cache, data?.deleteRoom.rooms),
  })
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const bannerMessages = [...fieldErrors, ...errorMessages(error)]

  async function handleConfirm() {
    setFieldErrors([])
    const result = await deleteRoom({ variables: { id: room.id } })
    const payload = result.data?.deleteRoom
    if (payload?.errors.length) {
      setFieldErrors(payload.errors.map((code) => ROOM_ERROR_MESSAGES[code]))
      return
    }
    onClose()
  }

  return (
    <Dialog open onClose={loading ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Remove {room.name}?</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <ErrorBanner messages={bannerMessages} onDismiss={() => { setFieldErrors([]); reset() }} />
          <Typography>
            This room will no longer be offered for new meetings. Existing meetings booked in it are not affected.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button color="error" variant="contained" onClick={handleConfirm} disabled={loading}>
          {loading ? <CircularProgress size={20} color="inherit" /> : 'Remove room'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
