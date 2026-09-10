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
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { ErrorBanner } from '../components/ErrorBanner'
import { SubmitButton } from '../components/SubmitButton'
import { SuccessToast } from '../components/SuccessToast'
import type { ErrorLike } from '@apollo/client'
import { errorMessages } from '../graphql/errorMessages'
import { cachePeople, cacheRooms } from '../graphql/referenceDataCache'
import {
  CREATE_PERSON,
  CREATE_ROOM,
  DELETE_MY_ACCOUNT,
  UPDATE_MY_PREFERENCES,
  UPDATE_PERSON,
  UPDATE_ROOM,
} from '../graphql/mutations'
import { REFERENCE_DATA } from '../graphql/queries'
import {
  type CreateRoomResult,
  type DateFormat,
  type Person,
  type Room,
  type TimeFormat,
  type UpdateMyPreferencesResult,
  type CreatePersonResult,
  type UpdatePersonResult,
  type UpdateRoomResult,
} from '../graphql/types'
import {
  PERSON_ERROR_MESSAGES,
  PREFERENCES_ERROR_MESSAGES,
  ROOM_ERROR_MESSAGES,
} from '../graphql/validationMessages'

export default function SettingsPage() {
  const { isAdmin } = useAuth()

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Settings
      </Typography>
      <NameSection />
      <DateTimeFormatSection />
      {isAdmin && <AdminSections />}
      <DeleteAccountSection />
    </Stack>
  )
}

/** Everyone gets this section - it's the only one a standard user sees. */
function NameSection() {
  const { displayName, email, personId, personLoading, refreshPerson } = useAuth()
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
    <Paper component="section" sx={{ p: 3 }}>
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
          <SubmitButton loading={loading} disabled={!personId} hasError={bannerMessages.length > 0}>
            Save
          </SubmitButton>
        </Stack>
        {/* Gated on personLoading too, not just personId, for two reasons. It's a claim about the
            account that isn't true yet while myPerson is still in flight - the same reasoning
            HomePage's own !personId && !personLoading branch spells out. And rendering it during
            that window and removing it a moment later shifts every section below this one upwards,
            which silently swallows a click that was already in progress: mousedown lands on a
            button, the paragraph goes away, mouseup lands elsewhere, and the browser fires click on
            the common ancestor rather than the button, so onClick never runs. That cost a
            120-second acceptance timeout on "Add room" in release 0.0.17 - see mootmaker-webapp#43. */}
        {!personId && !personLoading && (
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

/**
 * Everyone gets this too. The formats are display-only: they change how this app renders and
 * parses date/times, never what the API stores or returns (always ISO-8601). A shared view always
 * renders in the *viewer's* own format, never the organiser's - see the design doc.
 */
function DateTimeFormatSection() {
  const { dateFormat, timeFormat, personId, personLoading, refreshPerson } = useAuth()
  const [pendingDateFormat, setPendingDateFormat] = useState<DateFormat>(dateFormat)
  const [pendingTimeFormat, setPendingTimeFormat] = useState<TimeFormat>(timeFormat)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [updateMyPreferences, { loading, error, reset }] =
    useMutation<{ updateMyPreferences: UpdateMyPreferencesResult }>(UPDATE_MY_PREFERENCES)

  // Same reseeding reason as NameSection: the real preferences only arrive once the myPerson
  // query resolves, so a field seeded at first render would otherwise stay stuck on the default.
  useEffect(() => {
    if (personId) {
      setPendingDateFormat(dateFormat)
      setPendingTimeFormat(timeFormat)
    }
  }, [personId, dateFormat, timeFormat])

  const bannerMessages = [...fieldErrors, ...errorMessages(error)]

  function dismissBanner() {
    setFieldErrors([])
    reset()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!personId) return
    setFieldErrors([])

    // Both formats go every time - the mutation replaces the pair rather than patching one, and
    // both are non-null in the schema.
    const result = await updateMyPreferences({
      variables: { preferences: { dateFormat: pendingDateFormat, timeFormat: pendingTimeFormat } },
    })
    const payload = result.data?.updateMyPreferences
    if (payload?.errors.length) {
      setFieldErrors(payload.errors.map((code) => PREFERENCES_ERROR_MESSAGES[code]))
      return
    }
    if (payload?.person) {
      refreshPerson()
      setSuccessMessage('Your date and time formats were updated.')
    }
  }

  return (
    <Paper component="section" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          Date and time format
        </Typography>
        <Typography variant="body2" color="text.secondary">
          How dates and times are shown to you, and how you type them in. This only changes what
          you see - it doesn&apos;t change anyone else&apos;s view.
        </Typography>
        <ErrorBanner messages={bannerMessages} onDismiss={dismissBanner} />
        <Stack
          component="form"
          direction="row"
          spacing={2}
          onSubmit={handleSubmit}
          sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}
        >
          <TextField
            select
            label="Date format"
            value={pendingDateFormat}
            onChange={(event) => setPendingDateFormat(event.target.value as DateFormat)}
            disabled={!personId}
            sx={{ flexGrow: 1, minWidth: 240 }}
          >
            <MenuItem value="Iso">2026-08-24</MenuItem>
            <MenuItem value="British">24/08/2026</MenuItem>
            <MenuItem value="Usa">08/24/2026</MenuItem>
          </TextField>
          <TextField
            select
            label="Time format"
            value={pendingTimeFormat}
            onChange={(event) => setPendingTimeFormat(event.target.value as TimeFormat)}
            disabled={!personId}
            sx={{ flexGrow: 1, minWidth: 240 }}
          >
            <MenuItem value="TwentyFourHour">14:30</MenuItem>
            <MenuItem value="AmPm">02:30 PM</MenuItem>
          </TextField>
          <SubmitButton loading={loading} disabled={!personId} hasError={bannerMessages.length > 0}>
            Save
          </SubmitButton>
        </Stack>
        {/* Gated on personLoading too, not just personId, for two reasons. It's a claim about the
            account that isn't true yet while myPerson is still in flight - the same reasoning
            HomePage's own !personId && !personLoading branch spells out. And rendering it during
            that window and removing it a moment later shifts every section below this one upwards,
            which silently swallows a click that was already in progress: mousedown lands on a
            button, the paragraph goes away, mouseup lands elsewhere, and the browser fires click on
            the common ancestor rather than the button, so onClick never runs. That cost a
            120-second acceptance timeout on "Add room" in release 0.0.17 - see mootmaker-webapp#43. */}
        {!personId && !personLoading && (
          <Typography variant="body2" color="text.secondary">
            Your account has no linked person yet, so these can&apos;t be changed here.
          </Typography>
        )}
      </Stack>
      <SuccessToast message={successMessage} onClose={() => setSuccessMessage(null)} />
    </Paper>
  )
}

/**
 * Admin only. Owns both admin queries so the two sections appear together, rather than each
 * arriving whenever its own query happens to resolve.
 *
 * That matters for more than tidiness. Rooms renders above People, so a rooms list arriving late
 * grows from a spinner to a full list - hundreds of pixels in a real environment - and pushes
 * People's "Add person" button down. A control that moves under the cursor silently eats a click
 * already in progress: mousedown lands on the button, the layout shifts, mouseup lands elsewhere,
 * and the browser fires click on the common ancestor rather than the button, so onClick never
 * runs. mootmaker-webapp#43 cost a 120-second acceptance timeout to exactly that mechanism.
 *
 * The rule this follows: an async result must never change the size of anything above an
 * interactive control that is already clickable. Either the space is reserved, or the control is
 * not there yet. A list of unknown length cannot reserve its space, so this takes the other
 * option - neither Add button exists until both lists are ready.
 *
 * The queries live here rather than in the sections so this costs no extra requests. Leaving them
 * in the children and merely gating the parent would fire each `cache-and-network` query a second
 * time.
 */
function AdminSections() {
    // One query for both sections, so they can no longer settle independently and appear one at a
  // time - the layout-shift problem webapp#50 was about.
  const referenceData = useQuery(REFERENCE_DATA, { fetchPolicy: 'cache-and-network' })

  // An errored query has settled, even though it has no data - so this waits for the network, not
  // for success, and a failure still renders the section with its ErrorBanner.
  if (referenceData.loading && !referenceData.data) {
    return (
      <Paper component="section" sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress size={24} />
        </Box>
      </Paper>
    )
  }

  return (
    <>
      <RoomsSection rooms={referenceData.data?.workspace.rooms ?? []} error={referenceData.error} refetch={referenceData.refetch} />
      <PeopleSection people={referenceData.data?.workspace.people ?? []} error={referenceData.error} refetch={referenceData.refetch} />
    </>
  )
}

interface AdminSectionProps<T> {
  items: T[]
  error: ErrorLike | undefined
  refetch: () => void
}

/** Admin only - lists every room, with an edit dialog per row and an "Add room" dialog. */
function RoomsSection({ rooms: roomList, error, refetch }: { rooms: Room[] } & Omit<AdminSectionProps<Room>, 'items'>) {
  const [dialogRoom, setDialogRoom] = useState<Room | 'new' | null>(null)

  const rooms = [...roomList].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Paper component="section" sx={{ p: 3 }}>
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
        {rooms.length === 0 ? (
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
  // No update function, and no refetch to race it.
  //
  // createRoom now returns the whole `rooms` collection alongside the created room, so the cached
  // list is replaced by an authoritative one that came back with the write. The old version merged
  // the single created room into the cached list by hand, because a room had been observed missing
  // from the list immediately after a successful create - a race between concurrent fetches of the
  // list query, where a response issued before the write landed after the refetch's and overwrote
  // it. There is no read to lose that race now. See mootmaker-webapp#1 and #12.
  const [createRoom, createState] = useMutation<{ createRoom: CreateRoomResult }>(CREATE_ROOM, {
    // The returned collection has to be written into workspace.rooms explicitly - see
    // referenceDataCache. Without it the new room never reaches Add Meeting's dropdown.
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
          <SubmitButton loading={loading} hasError={bannerMessages.length > 0}>
            Save
          </SubmitButton>
        </DialogActions>
      </Stack>
    </Dialog>
  )
}

/** Admin only - lists every person, with an edit dialog per row and an "Add person" dialog. */
function PeopleSection({
  people: peopleList,
  error,
  refetch,
}: { people: Person[] } & Omit<AdminSectionProps<Person>, 'items'>) {
  const [dialogPerson, setDialogPerson] = useState<Person | 'new' | null>(null)

  const people = [...peopleList].sort((a, b) => a.name.localeCompare(b.name))

  return (
    <Paper component="section" sx={{ p: 3 }}>
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
        {people.length === 0 ? (
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
  // No update function here either - createPerson returns the whole `people` collection with the
  // write, so there is no cached list to merge into and no read that could lose a race with it.
  const [createPerson, createState] = useMutation<{ createPerson: CreatePersonResult }>(CREATE_PERSON, {
    update: (cache, { data }) => cachePeople(cache, data?.createPerson.people),
  })
  const [updatePerson, updateState] = useMutation<{ updatePerson: UpdatePersonResult }>(UPDATE_PERSON, {
    update: (cache, { data }) => cachePeople(cache, data?.updatePerson.people),
  })
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
          <SubmitButton loading={loading} hasError={bannerMessages.length > 0}>
            Save
          </SubmitButton>
        </DialogActions>
      </Stack>
    </Dialog>
  )
}

/**
 * Everyone gets this section - self-service account deletion, not gated on isAdmin. A simple
 * confirmation dialog (no re-authentication step - see mootmaker/designs/archive/delete-my-account.md's "Confirm
 * friction" decision) that explicitly warns about organised-meeting cancellation before the user
 * commits, since that's a real side effect on other people's data, not just their own.
 */
function DeleteAccountSection() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteMyAccount, { loading, error, reset }] = useMutation<{ deleteMyAccount: boolean }>(DELETE_MY_ACCOUNT)

  async function handleConfirm() {
    const result = await deleteMyAccount()
    if (result.data?.deleteMyAccount) {
      // No session to return to afterwards - sign out and land back on the public home page,
      // the same place a fresh visitor lands.
      signOut()
      navigate('/')
    }
  }

  function closeDialog() {
    setConfirmOpen(false)
    reset()
  }

  return (
    <Paper component="section" sx={{ p: 3 }}>
      <Stack spacing={2}>
        <Typography variant="h6" component="h2">
          Delete account
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Permanently deletes your account and everything linked to it. This can&apos;t be undone.
        </Typography>
        <Box>
          <Button color="error" variant="outlined" onClick={() => setConfirmOpen(true)}>
            Delete my account
          </Button>
        </Box>
      </Stack>
      {confirmOpen && (
        <Dialog open onClose={loading ? undefined : closeDialog} fullWidth maxWidth="xs">
          <DialogTitle>Delete your account?</DialogTitle>
          <DialogContent>
            <Stack spacing={2}>
              <ErrorBanner messages={errorMessages(error)} onDismiss={reset} />
              <Typography>
                This permanently deletes your account. <strong>All meetings you organise will be cancelled</strong> -
                other attendees will no longer see them. Meetings you only attend will just have you removed from
                them. This can&apos;t be undone.
              </Typography>
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={closeDialog} disabled={loading}>
              Cancel
            </Button>
            <Button color="error" variant="contained" onClick={handleConfirm} disabled={loading}>
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Delete my account'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Paper>
  )
}
