import { useMutation } from '@apollo/client/react'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { ErrorBanner } from '../components/ErrorBanner'
import { SubmitButton } from '../components/SubmitButton'
import { SuccessToast } from '../components/SuccessToast'
import { errorMessages } from '../graphql/errorMessages'
import { DELETE_MY_ACCOUNT, UPDATE_MY_NAME, UPDATE_MY_PREFERENCES } from '../graphql/mutations'
import { type DateFormat, type TimeFormat, type UpdateMyNameResult, type UpdateMyPreferencesResult } from '../graphql/types'
import { PERSON_ERROR_MESSAGES, PREFERENCES_ERROR_MESSAGES } from '../graphql/validationMessages'

export default function SettingsPage() {
  const { isAdmin } = useAuth()

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Settings
      </Typography>
      {isAdmin && <MovedToAdminPagesBanner />}
      <NameSection />
      <DateTimeFormatSection />
      <DeleteAccountSection />
    </Stack>
  )
}

/**
 * Admin only. Room and Person management used to live inline in this page (AdminSections) -
 * they're now their own top-level pages, reachable from the sidebar's Admin section. This is
 * purely a pointer for anyone who still expects to find them here.
 */
function MovedToAdminPagesBanner() {
  return (
    <Alert severity="info">
      Room and person management has moved. You&apos;ll find them under{' '}
      <Link to="/rooms">Rooms</Link> and <Link to="/persons">Persons</Link> in the menu.
    </Alert>
  )
}

/** Everyone gets this section - it's the only one a standard user sees. */
function NameSection() {
  const { displayName, email, personId, personLoading, refreshPerson } = useAuth()
  const [name, setName] = useState(displayName ?? '')
  const [fieldErrors, setFieldErrors] = useState<string[]>([])
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [updateMyName, { loading, error, reset }] = useMutation<{ updateMyName: UpdateMyNameResult }>(UPDATE_MY_NAME)

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

    const result = await updateMyName({ variables: { name } })
    const payload = result.data?.updateMyName
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
