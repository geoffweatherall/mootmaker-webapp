import { useMutation, useQuery } from '@apollo/client/react'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import EmailIcon from '@mui/icons-material/EmailOutlined'
import ShieldIcon from '@mui/icons-material/Shield'
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
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { useState, type FormEvent } from 'react'
import { useAuth } from '../auth/authContext'
import { EmptyState } from '../components/EmptyState'
import { ErrorBanner } from '../components/ErrorBanner'
import { PersonAvatar } from '../components/PersonAvatar'
import { SubmitButton } from '../components/SubmitButton'
import { errorMessages } from '../graphql/errorMessages'
import { cachePeople } from '../graphql/referenceDataCache'
import { CREATE_PERSON, DELETE_PERSON, EDIT_PERSON, SET_PERSON_ADMIN } from '../graphql/mutations'
import { REFERENCE_DATA } from '../graphql/queries'
import {
  type CreatePersonResult,
  type DeletePersonResult,
  type EditPersonResult,
  type Person,
  type SetPersonAdminResult,
} from '../graphql/types'
import { PERSON_ERROR_MESSAGES } from '../graphql/validationMessages'
import { PersonsIcon } from '../icons'

/**
 * Admin only (RequireAdmin, see App.tsx). Card grid matching RoomsPage's own pattern - replaces
 * the inline "People" section that used to live in Settings (see the design doc, "Impacts on
 * components"). Cards show the admin badge and linked-email chips; the admin switch itself only
 * lives inside Edit Person, not Add and not a card action - see PersonDialog.
 */
export default function PersonsPage() {
  const [dialogPerson, setDialogPerson] = useState<Person | 'new' | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null)
  const [filter, setFilter] = useState('')
  const { data, loading, error } = useQuery(REFERENCE_DATA, { fetchPolicy: 'cache-and-network' })

  const allPeople = [...(data?.workspace.people ?? [])].sort((a, b) => a.name.localeCompare(b.name))
  // Matches name or any linked email - an admin is as likely to search by one as the other.
  // Client-side only: the whole list is already in cache (see REFERENCE_DATA), so there is no
  // query to narrow server-side.
  const normalizedFilter = filter.trim().toLowerCase()
  const people = normalizedFilter
    ? allPeople.filter(
        (person) =>
          person.name.toLowerCase().includes(normalizedFilter) ||
          person.linkedEmails.some((email) => email.toLowerCase().includes(normalizedFilter)),
      )
    : allPeople
  const showSpinner = loading && !data
  // `loading` disables the FAB and every card's Edit/Remove below - see RoomsPage's identical guard
  // for why: a create/edit/delete fired while this initial cache-and-network fetch is still in
  // flight can have its own cache write overwritten when that now-stale response lands after it.

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h4" component="h1">
          Persons
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Manage the people who can be booked into meetings.
        </Typography>
      </Box>

      <ErrorBanner messages={errorMessages(error)} onDismiss={() => {}} />

      {allPeople.length > 0 && (
        <TextField
          label="Filter"
          placeholder="Search by name or email"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          fullWidth
        />
      )}

      {showSpinner ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : allPeople.length === 0 ? (
        !error && <EmptyState message="No people exist yet." icon={PersonsIcon} />
      ) : people.length === 0 ? (
        <EmptyState message="No people match that filter." icon={PersonsIcon} />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
            gap: 2,
            pb: 10,
          }}
        >
          {people.map((person) => (
            <Paper key={person.id} sx={{ p: 2.5 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <PersonAvatar name={person.name} size={36} />
                  <Typography variant="subtitle1" sx={{ flexGrow: 1, fontWeight: 700 }}>
                    {person.name}
                  </Typography>
                  {person.isAdmin && (
                    <Chip
                      icon={<ShieldIcon fontSize="small" />}
                      label="Admin"
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  )}
                </Stack>
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75, minHeight: 24 }}>
                  {person.linkedEmails.length === 0 ? (
                    <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      Not signed up yet
                    </Typography>
                  ) : (
                    person.linkedEmails.map((email) => (
                      <Chip key={email} icon={<EmailIcon fontSize="small" />} label={email} size="small" variant="outlined" />
                    ))
                  )}
                </Stack>
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', borderTop: 1, borderColor: 'divider', pt: 1 }}>
                  <IconButton
                    size="small"
                    aria-label={`Edit ${person.name}`}
                    disabled={loading}
                    onClick={() => setDialogPerson(person)}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`Remove ${person.name}`}
                    disabled={loading}
                    onClick={() => setDeleteTarget(person)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Stack>
              </Stack>
            </Paper>
          ))}
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
          aria-label="Add person"
          disabled={loading}
          onClick={() => setDialogPerson('new')}
          sx={{ pointerEvents: 'auto' }}
        >
          <AddIcon />
        </Fab>
      </Box>

      {dialogPerson !== null && (
        <PersonDialog person={dialogPerson === 'new' ? null : dialogPerson} onClose={() => setDialogPerson(null)} />
      )}
      {deleteTarget && <DeletePersonDialog person={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </Stack>
  )
}

interface PersonDialogProps {
  /** null means "create a new person" - otherwise the person being edited. */
  person: Person | null
  onClose: () => void
}

function PersonDialog({ person, onClose }: PersonDialogProps) {
  const { personId: viewerPersonId } = useAuth()
  const [name, setName] = useState(person?.name ?? '')
  const [isAdmin, setIsAdmin] = useState(person?.isAdmin ?? false)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [syncFailedFor, setSyncFailedFor] = useState<{ id: string; name: string; isAdmin: boolean } | null>(null)

  // No refetch to race it deliberately - both mutations return the whole `people` collection, which
  // replaces the cached list wholesale (see referenceDataCache.ts). The remaining race, against the
  // page's OWN initial cache-and-network fetch, is closed by disabling the triggering buttons in
  // the parent until that fetch settles - see the comment there.
  const [createPerson, createState] = useMutation<{ createPerson: CreatePersonResult }>(CREATE_PERSON, {
    update: (cache, { data }) => cachePeople(cache, data?.createPerson.people),
  })
  // setPersonAdmin runs second in this combined document (GraphQL executes root mutation fields
  // serially), so its people/person snapshot is the authoritative final state - the one written to
  // cache. renamePerson's own snapshot, taken before setPersonAdmin's write, is not selected here.
  const [editPerson, editState] = useMutation<{ renamePerson: { errors: string[] }; setPersonAdmin: SetPersonAdminResult }>(
    EDIT_PERSON,
    { update: (cache, { data }) => cachePeople(cache, data?.setPersonAdmin.people) },
  )
  const loading = createState.loading || editState.loading
  const bannerMessages = [...fieldErrors, ...errorMessages(createState.error), ...errorMessages(editState.error)]

  const isSelf = person !== null && person.id === viewerPersonId
  const hasNoLinkedAccount = person !== null && person.linkedEmails.length === 0
  const adminSwitchDisabled = isSelf || hasNoLinkedAccount

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFieldErrors([])

    if (person) {
      const result = await editPerson({ variables: { id: person.id, name, isAdmin } })
      const payload = result.data
      const errors = [...(payload?.renamePerson.errors ?? []), ...(payload?.setPersonAdmin.errors ?? [])]
      if (errors.length) {
        setFieldErrors(errors.map((code) => PERSON_ERROR_MESSAGES[code as EditPersonResult['setPersonAdmin']['errors'][number]]))
        return
      }
      if (payload?.setPersonAdmin.cognitoSyncFailed) {
        setSyncFailedFor({ id: person.id, name, isAdmin })
        return
      }
      onClose()
    } else {
      if (!name.trim()) {
        setFieldErrors([PERSON_ERROR_MESSAGES.NameRequired])
        return
      }
      const result = await createPerson({ variables: { name } })
      const payload = result.data?.createPerson
      if (payload?.errors.length) {
        setFieldErrors(payload.errors.map((code) => PERSON_ERROR_MESSAGES[code]))
        return
      }
      if (payload?.person) onClose()
    }
  }

  // The sync-failed prompt mounts alongside the (already-closed) Edit Person dialog rather than
  // replacing it in place - the DynamoDB write already succeeded, so Cancel here just dismisses a
  // follow-up prompt, not an in-progress form. See the design doc's "UI handling of
  // cognitoSyncFailed: true".
  if (syncFailedFor) {
    return <CognitoSyncFailedDialog target={syncFailedFor} onClose={onClose} />
  }

  return (
    <Dialog open onClose={loading ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{person ? 'Edit person' : 'Add person'}</DialogTitle>
      <Stack component="form" onSubmit={handleSubmit}>
        <DialogContent>
          <Stack spacing={3}>
            <ErrorBanner messages={bannerMessages} onDismiss={() => setFieldErrors([])} />
            <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} autoFocus fullWidth />

            {person && person.linkedEmails.length > 0 && (
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  Linked sign-in accounts
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                  {person.linkedEmails.map((email) => (
                    <Chip key={email} label={email} size="small" variant="outlined" />
                  ))}
                </Stack>
              </Stack>
            )}

            {person && (
              <Stack spacing={0.5}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <Switch
                    checked={isAdmin}
                    disabled={adminSwitchDisabled}
                    onChange={(event) => setIsAdmin(event.target.checked)}
                    slotProps={{ input: { 'aria-label': 'Admin' } }}
                  />
                  <Typography variant="body2">Admin</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  {hasNoLinkedAccount
                    ? "This person hasn't signed in yet - admin access can only be granted once they've signed up."
                    : isSelf
                      ? "You can't change your own admin access here."
                      : 'Can add, edit and remove rooms and people, and grant admin to others.'}
                </Typography>
              </Stack>
            )}

            {!person && (
              <Typography variant="caption" color="text.secondary">
                Accounts link automatically the first time someone signs up using this exact name - there&apos;s nothing to
                enter here.
              </Typography>
            )}
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
 * Follow-up prompt for a partial success: the DynamoDB write already landed, only the sync to
 * Cognito's custom:class failed, so Cancel leaves the change as already saved rather than rolling
 * anything back. Retry re-sends setPersonAdmin alone (idempotent) with the same id/isAdmin -
 * there's no need to resend the name, which already saved successfully.
 */
function CognitoSyncFailedDialog({
  target,
  onClose,
}: {
  target: { id: string; name: string; isAdmin: boolean }
  onClose: () => void
}) {
  const [setPersonAdmin, { loading, error, reset }] = useMutation<{ setPersonAdmin: SetPersonAdminResult }>(
    SET_PERSON_ADMIN,
    { update: (cache, { data }) => cachePeople(cache, data?.setPersonAdmin.people) },
  )
  const [stillFailing, setStillFailing] = useState(false)

  async function handleRetry() {
    setStillFailing(false)
    const result = await setPersonAdmin({ variables: { id: target.id, isAdmin: target.isAdmin } })
    const payload = result.data?.setPersonAdmin
    if (payload && !payload.errors.length && !payload.cognitoSyncFailed) {
      onClose()
      return
    }
    setStillFailing(true)
  }

  return (
    <Dialog open onClose={loading ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Sync to sign-in failed</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <ErrorBanner messages={[...errorMessages(error), ...(stillFailing ? ['Still not synced - you can try again or cancel.'] : [])]} onDismiss={reset} />
          <Typography>
            {target.name}&apos;s admin access was saved, but couldn&apos;t be synced to their sign-in account yet - they
            won&apos;t be able to use it until this succeeds.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleRetry} disabled={loading}>
          {loading ? <CircularProgress size={20} color="inherit" /> : 'Retry'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function DeletePersonDialog({ person, onClose }: { person: Person; onClose: () => void }) {
  const [deletePerson, { loading, error, reset }] = useMutation<{ deletePerson: DeletePersonResult }>(DELETE_PERSON, {
    update: (cache, { data }) => cachePeople(cache, data?.deletePerson.people),
  })
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const bannerMessages = [...fieldErrors, ...errorMessages(error)]

  async function handleConfirm() {
    setFieldErrors([])
    const result = await deletePerson({ variables: { id: person.id } })
    const payload = result.data?.deletePerson
    if (payload?.errors.length) {
      setFieldErrors(payload.errors.map((code) => PERSON_ERROR_MESSAGES[code]))
      return
    }
    onClose()
  }

  return (
    <Dialog open onClose={loading ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>Remove {person.name}?</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <ErrorBanner messages={bannerMessages} onDismiss={() => { setFieldErrors([]); reset() }} />
          <Typography>
            All meetings they organise will be cancelled - other attendees will no longer see them. Meetings they only
            attend will just have them removed. This can&apos;t be undone.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button color="error" variant="contained" onClick={handleConfirm} disabled={loading}>
          {loading ? <CircularProgress size={20} color="inherit" /> : 'Remove person'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
