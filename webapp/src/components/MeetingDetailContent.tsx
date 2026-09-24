import { useFragment } from '@apollo/client/react'
import CloseIcon from '@mui/icons-material/Close'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import ShareIcon from '@mui/icons-material/Share'
import { Box, IconButton, Stack, Typography } from '@mui/material'
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/authContext'
import { formatLocalDate, formatLocalTime } from '../graphql/formatDateTime'
import { MEETING_LIVE_FIELDS_FRAGMENT } from '../graphql/queries'
import type { MeetingDetails } from '../graphql/types'
import { AttendeeStatusBadge } from './AttendeeStatusBadge'
import { AttendeeStatusControl } from './AttendeeStatusControl'
import { CancelMeetingDialog } from './CancelMeetingDialog'
import { EmptyState } from './EmptyState'
import { PersonAvatar } from './PersonAvatar'
import { SuccessToast } from './SuccessToast'

/**
 * Web Share API first (opens the device's native share sheet - Messages, email, Slack, etc.),
 * falling back to a clipboard copy where it isn't available (most desktop browsers). One icon for
 * both paths (see designs/meeting-detail-consolidation.md) - the caller doesn't know or care which
 * fired, so the button never changes appearance based on it. A rejected navigator.share() promise
 * just means the user dismissed the native share sheet, not a failure worth surfacing.
 */
async function shareMeeting(meeting: MeetingDetails, onCopiedToClipboard: () => void) {
  const url = `${window.location.origin}/meetings/${meeting.id}`
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: meeting.subject, url })
    } catch {
      // Cancelling the share sheet rejects the promise - not an error.
    }
    return
  }
  await navigator.clipboard.writeText(url)
  onCopiedToClipboard()
}

/**
 * PARITY INVARIANT: this is the ONE place a meeting's details are rendered. Both the sheet/panel
 * (mounted via useMeetingDetailOverlay.tsx) and the full-page MeetingDetailsPage.tsx render this
 * same component - they cannot silently drift apart the way they did before
 * designs/meeting-detail-consolidation.md (field order, room colour, and avatar alignment had each
 * independently diverged between the two). If you are changing how a meeting's details look or are
 * laid out, change it HERE, never by adding a second, page-specific rendering of this content.
 * MeetingDetailsPage.tsx carries a cross-reference back to this comment.
 */
export function MeetingDetailContent({
  meeting,
  roomColor,
  onClose,
  onCancelled = onClose ?? (() => {}),
  headingComponent = 'h2',
}: {
  meeting: MeetingDetails
  roomColor: string
  /** Omitted by MeetingDetailsPage - a full page has no "close", only its own Back/navigation. */
  onClose?: () => void
  /** Called once a cancel this component initiates actually succeeds - distinct from `onClose`
   * because there is nothing left to show once your own meeting is gone: the whole sheet/panel (or
   * the full page) should close/navigate away, not just the confirmation dialog. Defaults to
   * `onClose` (the overlay's own dismiss); MeetingDetailsPage.tsx, which has no `onClose`, passes
   * its own `() => navigate('/')` instead. */
  onCancelled?: () => void
  /** 'h2' (default) for the sheet/panel, which sits atop a page that already has its own h1 -
   * useMeetingDetailOverlay.tsx doesn't pass this. MeetingDetailsPage.tsx passes 'h1': as a full,
   * standalone page it needs exactly one, for the same accessibility/page-structure reason every
   * other page's own main heading is an h1 - this component doesn't get to skip that just because
   * it's shared with a context where h2 is right. Visual size (variant="h6") stays identical in
   * both - only the semantic level differs. */
  headingComponent?: 'h1' | 'h2'
}) {
  const { timeFormat, dateFormat, personId, isAdmin } = useAuth()
  const [linkCopied, setLinkCopied] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)

  // A live view of every field updateMeeting/cancelMeeting can change, independent of the `meeting`
  // prop above - which is a snapshot captured once, at open() time, and never itself refreshed (see
  // useMeetingDetailOverlay.tsx's resolveMeetingDetails). `useFragment` is Apollo's purpose-built
  // tool for reading one normalised entity's CURRENT cached fields regardless of which query
  // populated them - see MEETING_LIVE_FIELDS_FRAGMENT's own doc comment for why this fragment's
  // shape is safe to read as complete from every page that can open this component.
  const { data: live, complete } = useFragment({
    fragment: MEETING_LIVE_FIELDS_FRAGMENT,
    from: { __typename: 'Meeting' as const, id: meeting.id },
  })

  // Distinguishes "the fragment hasn't resolved complete yet" (true for an instant on first mount,
  // before this hook's first re-render) from "it WAS complete, and now isn't" - only the latter
  // means the meeting was genuinely cancelled out from under this open sheet/panel, via someone
  // else's cancelMeeting evicting and then garbage-collecting the now-unreachable entity. A ref, not
  // state: this must never itself trigger a re-render, only be read during one `complete` already
  // caused.
  const wasEverComplete = useRef(false)
  if (complete) wasEverComplete.current = true
  const cancelledElsewhere = wasEverComplete.current && !complete

  // The live fragment's own values once it has resolved (every field it covers, room/organiser/
  // attendee names included - MEETING_LIVE_FIELDS_FRAGMENT selects names directly, no separate
  // lookup map needed here); the frozen snapshot otherwise, for the brief window before it does.
  const current: MeetingDetails =
    complete && live
      ? {
          id: meeting.id,
          subject: live.subject,
          startTime: live.startTime,
          endTime: live.endTime,
          room: live.room,
          organiser: live.organiser,
          attendees: live.attendees,
        }
      : meeting

  const myAttendee = current.attendees.find((attendee) => attendee.person.id === personId)
  const canEdit = isAdmin || (personId != null && current.organiser.id === personId)
  const currentDate = current.startTime.slice(0, 10)

  if (cancelledElsewhere) {
    return (
      <Stack spacing={2} sx={{ p: 3 }}>
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
          {onClose && (
            <IconButton size="small" aria-label="Close" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
        <EmptyState message="This meeting was cancelled." />
      </Stack>
    )
  }

  return (
    // Deliberately no fixed width here - the sheet/panel's own wrapper (useMeetingDetailOverlay.tsx)
    // sizes itself (340px side panel, full-width bottom sheet); the full page's Paper sizes itself
    // too (MeetingDetailsPage.tsx). This fills whichever it's given.
    <Stack spacing={2} sx={{ p: 3, maxHeight: '80vh', overflowY: 'auto' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="h6" component={headingComponent}>
          {current.subject}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
          <IconButton
            size="small"
            aria-label="Share meeting"
            onClick={() => shareMeeting(current, () => setLinkCopied(true))}
          >
            <ShareIcon fontSize="small" />
          </IconButton>
          {/* Hidden outright for anyone canEdit rejects, with no disabled-and-explained state -
              matching AttendeeStatusControl's own precedent (shown only to an attendee, absent
              otherwise). This is presentation only: real enforcement is the API's own organiser-
              or-admin check, never bypassable by editing what the client happens to render. */}
          {canEdit && (
            <IconButton size="small" aria-label="Edit meeting" component={Link} to={`/meetings/${meeting.id}/edit`}>
              <EditIcon fontSize="small" />
            </IconButton>
          )}
          {canEdit && (
            <IconButton size="small" aria-label="Cancel meeting" onClick={() => setCancelDialogOpen(true)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
          {onClose && (
            <IconButton size="small" aria-label="Close" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: roomColor, flexShrink: 0 }} />
        <Typography variant="body2" color="text.secondary">
          {current.room.name}
        </Typography>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {formatLocalDate(current.startTime, dateFormat)}
      </Typography>

      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {formatLocalTime(current.startTime, timeFormat)}–{formatLocalTime(current.endTime, timeFormat)}
      </Typography>

      <Stack spacing={1.5} sx={{ pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
        {/* Organiser row now styled identically to an attendee row below - same avatar size,
            same plain-text name, same "You" treatment when it's the signed-in caller - under its
            own caption matching "Attendees · N", instead of the old bold name + inline "·
            Organiser" suffix that read as a visually distinct treatment (mootmaker-webapp#73). No
            AttendeeStatusBadge here: the organiser's status is an implicit, never-stored "Going"
            (see designs/attendee-response-status.md) - there is no status value to show a badge
            for, and adding one would invent status semantics the design deliberately doesn't have. */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}
        >
          Organiser
        </Typography>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <PersonAvatar name={current.organiser.name} size={26} />
          <Typography variant="body2" sx={{ flexGrow: 1 }}>
            {current.organiser.name}
          </Typography>
          {personId != null && current.organiser.id === personId && (
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
              You
            </Typography>
          )}
        </Stack>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}
        >
          Attendees · {current.attendees.length}
        </Typography>
        {current.attendees.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No attendees.
          </Typography>
        ) : (
          current.attendees.map((attendee) => {
            const isMe = personId != null && attendee.person.id === personId
            return (
              <Stack
                key={attendee.person.id}
                direction="row"
                spacing={1.5}
                sx={{ alignItems: 'center' }}
              >
                <PersonAvatar name={attendee.person.name} size={26} />
                <Typography variant="body2" sx={{ flexGrow: 1 }}>
                  {attendee.person.name}
                </Typography>
                {isMe ? (
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
                    You
                  </Typography>
                ) : (
                  <AttendeeStatusBadge status={attendee.status} />
                )}
              </Stack>
            )
          })
        )}
        {/* Only when the caller is actually an attendee - the organiser has nothing to set (see
            AttendeeStatusControl.tsx), and someone viewing a shared link they have no part in gets
            no control either. */}
        {myAttendee && <AttendeeStatusControl meetingId={meeting.id} status={myAttendee.status} />}
      </Stack>

      <SuccessToast message={linkCopied ? 'Link copied to clipboard.' : null} onClose={() => setLinkCopied(false)} />

      {canEdit && (
        <CancelMeetingDialog
          open={cancelDialogOpen}
          meetingId={meeting.id}
          meetingDate={currentDate}
          subject={current.subject}
          onClose={() => setCancelDialogOpen(false)}
          onCancelled={() => {
            setCancelDialogOpen(false)
            onCancelled()
          }}
        />
      )}
    </Stack>
  )
}
