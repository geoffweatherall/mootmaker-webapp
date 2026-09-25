import { Box, Drawer, useMediaQuery, useTheme } from '@mui/material'
import { useState } from 'react'
import type { Meeting, MeetingDetails, Person, Room } from '../graphql/types'
import { roomColorFor } from '../theme/roomColor'
import { MeetingDetailContent } from './MeetingDetailContent'

/**
 * Builds the fully-resolved shape MeetingDetailContent needs from a day-embedded Meeting (ids only
 * for room/organiser/attendees) plus the caller's own cached rooms/people. MeetingDetailsPage.tsx
 * doesn't need this - MEETING_BY_ID already returns names resolved server-side, in exactly this
 * shape (see graphql/types.ts's MeetingDetails, and its own comment on why).
 *
 * This is a one-time SNAPSHOT, taken at `open()` and never refreshed while the sheet/panel stays
 * open - MeetingDetailContent itself owns keeping every field live from here on (its own
 * `useFragment` binding), including this snapshot's `id`, which never changes even if the meeting
 * is later edited or cancelled.
 */
export function resolveMeetingDetails(
  meeting: Meeting,
  peopleById: Map<string, Person>,
  roomsById: Map<string, Room>,
): MeetingDetails {
  const room = roomsById.get(meeting.room.id)
  return {
    id: meeting.id,
    subject: meeting.subject,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    room: {
      id: meeting.room.id,
      name: room?.name ?? '',
      capacity: room?.capacity ?? 0,
      color: room?.color ?? null,
    },
    organiser: { id: meeting.organiser.id, name: peopleById.get(meeting.organiser.id)?.name ?? '' },
    attendees: meeting.attendees.map((attendee) => ({
      person: { id: attendee.person.id, name: peopleById.get(attendee.person.id)?.name ?? '' },
      status: attendee.status,
    })),
  }
}

/**
 * Shared open/close state and the responsive wrapper (mobile bottom sheet / wide-screen side panel)
 * around MeetingDetailContent. Mount once per page - HomePage, RoomAvailabilityPage,
 * PersonCalendarPage - call `open(meeting)` from a meeting row's onClick, and render the returned
 * `overlay` once near the top of the page's JSX. See designs/meeting-detail-consolidation.md.
 *
 * peopleById/roomsById resolve names for display; roomIndexById is separate from roomsById because
 * room colour depends on a room's position in the full sorted-by-name list (see theme/roomColor.ts),
 * not on the room itself - two rooms with the same name-sort position get the same colour even
 * across different pages' independently-fetched room lists.
 */
export function useMeetingDetailOverlay(
  peopleById: Map<string, Person>,
  roomsById: Map<string, Room>,
  roomIndexById: Map<string, number>,
) {
  const theme = useTheme()
  const isWide = useMediaQuery(theme.breakpoints.up('md'))
  const [openMeeting, setOpenMeeting] = useState<Meeting | null>(null)

  function open(meeting: Meeting) {
    setOpenMeeting(meeting)
  }
  function close() {
    setOpenMeeting(null)
  }

  const resolved = openMeeting ? resolveMeetingDetails(openMeeting, peopleById, roomsById) : null
  const roomColor = openMeeting
    ? roomColorFor(
        roomsById.get(openMeeting.room.id) ?? { color: null },
        roomIndexById.get(openMeeting.room.id) ?? 0,
        theme.palette.mode,
      )
    : ''

  // Narrow: a real modal bottom sheet (MUI Drawer's default backdrop + dismiss). Wide: a hand-rolled
  // fixed side panel with no backdrop at all, deliberately - a backdrop would sit on top of the page
  // content in z-order and swallow clicks meant for a different meeting row, which would break
  // "click another meeting while the panel is open, no need to close first" (see the design doc's
  // Risks). Dismiss on wide screens is the panel's own Close button only.
  const overlay = isWide ? (
    resolved && (
      <Box
        sx={{
          position: 'fixed',
          top: 64,
          right: 0,
          bottom: 0,
          width: 340,
          bgcolor: 'background.paper',
          borderLeft: 1,
          borderColor: 'divider',
          boxShadow: 6,
          zIndex: (t) => t.zIndex.drawer,
        }}
      >
        <MeetingDetailContent key={resolved.id} meeting={resolved} roomColor={roomColor} onClose={close} />
      </Box>
    )
  ) : (
    <Drawer
      anchor="bottom"
      open={Boolean(resolved)}
      onClose={close}
      slotProps={{ paper: { sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16 } } }}
    >
      {resolved && (
        <MeetingDetailContent key={resolved.id} meeting={resolved} roomColor={roomColor} onClose={close} />
      )}
    </Drawer>
  )

  return { open, overlay, isOpen: Boolean(openMeeting) }
}
