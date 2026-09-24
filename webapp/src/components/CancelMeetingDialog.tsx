import { useMutation } from '@apollo/client/react'
import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { dayInvalidations } from '../apolloClient'
import { CANCEL_MEETING } from '../graphql/mutations'
import type { CancelMeetingResult } from '../graphql/types'
import { MEETING_ERROR_MESSAGES } from '../graphql/validationMessages'
import { ErrorBanner } from './ErrorBanner'

/**
 * A hard delete - once confirmed, the meeting is gone, not marked cancelled (see
 * designs/edit-and-cancel-meetings.md's Decision 4). Mirrors SettingsPage.tsx's
 * `DeleteAccountSection` confirmation-dialog pattern: real friction (an explicit second step), no
 * re-authentication, warning copy that names the consequence before the destructive action fires.
 *
 * Deliberately a plain MUI `Dialog`, mounted alongside (never in place of) whatever opened it - a
 * `Dialog` is a portal that overlays with its own backdrop without unmounting the page underneath,
 * so the meeting's own details stay visible, dimmed, behind this while someone decides. That's a
 * requirement, not an implementation detail: see the design doc's Decision 5, caught as a real bug
 * in an earlier UI prototype that built the two states as mutually exclusive instead.
 */
export function CancelMeetingDialog({
  open,
  meetingId,
  meetingDate,
  subject,
  onClose,
  onCancelled,
}: {
  open: boolean
  meetingId: string
  /** The meeting's own date (YYYY-MM-DD), so a successful cancel can suppress this client's own
   * flicker the same way every other meeting mutation does - see `dayInvalidations.noteOwnWrite`. */
  meetingDate: string
  subject: string
  onClose: () => void
  /** Called after a successful cancel - distinct from `onClose` because the caller who just
   * cancelled their own meeting has nothing left to look at: the whole detail sheet/panel (or, on
   * the full page, the page itself) should close/navigate away, not just this confirmation dialog. */
  onCancelled: () => void
}) {
  const [cancelMeeting, { loading, error: transportError, reset }] = useMutation<{
    cancelMeeting: CancelMeetingResult
  }>(CANCEL_MEETING)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])

  const bannerMessages = [...fieldErrors, ...(transportError ? [transportError.message] : [])]

  function dismissBanner() {
    setFieldErrors([])
    reset()
  }

  function closeDialog() {
    setFieldErrors([])
    reset()
    onClose()
  }

  async function handleConfirm() {
    setFieldErrors([])
    const result = await cancelMeeting({ variables: { id: meetingId } })
    const payload = result.data?.cancelMeeting
    if (payload?.errors.length) {
      setFieldErrors(payload.errors.map((code) => MEETING_ERROR_MESSAGES[code]))
      return
    }
    if (payload?.day) {
      dayInvalidations.noteOwnWrite([meetingDate])
      onCancelled()
    }
  }

  return (
    <Dialog open={open} onClose={loading ? undefined : closeDialog} fullWidth maxWidth="xs">
      <DialogTitle>Cancel this meeting?</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <ErrorBanner messages={bannerMessages} onDismiss={dismissBanner} />
          <Typography>
            This permanently deletes &quot;{subject}&quot; for every attendee. This can&apos;t be undone.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={closeDialog} disabled={loading}>
          Keep meeting
        </Button>
        <Button color="error" variant="contained" onClick={() => void handleConfirm()} disabled={loading}>
          {loading ? <CircularProgress size={20} color="inherit" /> : 'Cancel meeting'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
