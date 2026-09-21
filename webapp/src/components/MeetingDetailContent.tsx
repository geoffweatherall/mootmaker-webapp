import CloseIcon from '@mui/icons-material/Close'
import ShareIcon from '@mui/icons-material/Share'
import { Box, IconButton, Stack, Typography } from '@mui/material'
import { useState } from 'react'
import { useAuth } from '../auth/authContext'
import { formatLocalDate, formatLocalTime } from '../graphql/formatDateTime'
import type { MeetingDetails } from '../graphql/types'
import { AttendeeStatusBadge } from './AttendeeStatusBadge'
import { AttendeeStatusControl } from './AttendeeStatusControl'
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
  headingComponent = 'h2',
}: {
  meeting: MeetingDetails
  roomColor: string
  /** Omitted by MeetingDetailsPage - a full page has no "close", only its own Back/navigation. */
  onClose?: () => void
  /** 'h2' (default) for the sheet/panel, which sits atop a page that already has its own h1 -
   * useMeetingDetailOverlay.tsx doesn't pass this. MeetingDetailsPage.tsx passes 'h1': as a full,
   * standalone page it needs exactly one, for the same accessibility/page-structure reason every
   * other page's own main heading is an h1 - this component doesn't get to skip that just because
   * it's shared with a context where h2 is right. Visual size (variant="h6") stays identical in
   * both - only the semantic level differs. */
  headingComponent?: 'h1' | 'h2'
}) {
  const { timeFormat, dateFormat, personId } = useAuth()
  const [linkCopied, setLinkCopied] = useState(false)

  const myAttendee = meeting.attendees.find((attendee) => attendee.person.id === personId)

  return (
    // Deliberately no fixed width here - the sheet/panel's own wrapper (useMeetingDetailOverlay.tsx)
    // sizes itself (340px side panel, full-width bottom sheet); the full page's Paper sizes itself
    // too (MeetingDetailsPage.tsx). This fills whichever it's given.
    <Stack spacing={2} sx={{ p: 3, maxHeight: '80vh', overflowY: 'auto' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="h6" component={headingComponent}>
          {meeting.subject}
        </Typography>
        <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
          <IconButton
            size="small"
            aria-label="Share meeting"
            onClick={() => shareMeeting(meeting, () => setLinkCopied(true))}
          >
            <ShareIcon fontSize="small" />
          </IconButton>
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
          {meeting.room.name}
        </Typography>
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {formatLocalDate(meeting.startTime, dateFormat)}
      </Typography>

      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {formatLocalTime(meeting.startTime, timeFormat)}–{formatLocalTime(meeting.endTime, timeFormat)}
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
          <PersonAvatar name={meeting.organiser.name} size={26} />
          <Typography variant="body2" sx={{ flexGrow: 1 }}>
            {meeting.organiser.name}
          </Typography>
          {personId != null && meeting.organiser.id === personId && (
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
          Attendees · {meeting.attendees.length}
        </Typography>
        {meeting.attendees.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No attendees.
          </Typography>
        ) : (
          meeting.attendees.map((attendee) => {
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
    </Stack>
  )
}
