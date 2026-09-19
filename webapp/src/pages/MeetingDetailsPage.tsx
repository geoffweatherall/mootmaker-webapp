import { useQuery } from '@apollo/client/react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Box, Button, CircularProgress, Paper, Stack, Typography, useTheme } from '@mui/material'
import { useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ErrorBanner } from '../components/ErrorBanner'
import { MeetingDetailContent } from '../components/MeetingDetailContent'
import { errorMessages } from '../graphql/errorMessages'
import { MEETING_BY_ID, REFERENCE_DATA } from '../graphql/queries'
import { roomColorAt } from '../theme/roomColor'

/**
 * The one lookup that works from a cold, shared or bookmarked link - see designs/
 * meeting-detail-consolidation.md. Nothing else in this app links here any more: every other
 * meeting row opens the shared sheet/panel in place instead (useMeetingDetailOverlay.tsx). This
 * page exists purely so that URL keeps working standalone.
 *
 * Renders the SAME MeetingDetailContent the sheet/panel uses - see that component's own
 * "PARITY INVARIANT" comment (components/MeetingDetailContent.tsx). Do not re-implement this
 * page's own version of a meeting's fields; render MeetingDetailContent, and if it's missing
 * something this page needs, add it there.
 */
export default function MeetingDetailsPage() {
  const { meetingId } = useParams<{ meetingId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const theme = useTheme()
  const [dismissedError, setDismissedError] = useState(false)

  // One meeting, by id, in two point reads on the server - an id-to-date pointer and then that day.
  // This used to fetch EVERY meeting ever stored and find() the right one client-side, which the
  // schema's own documentation warned against and which got slower with every meeting booked.
  //
  // Names are selected here, unlike the day-embedded meetings elsewhere: a details page reached cold
  // from a shared or bookmarked link has no cached rooms or people to resolve ids against.
  const { data, loading, error } = useQuery(MEETING_BY_ID, {
    variables: { id: meetingId ?? '' },
    skip: !meetingId,
    fetchPolicy: 'cache-and-network',
  })

  // Fetched purely for room colour, which needs a room's POSITION in the full sorted-by-name room
  // list (see theme/roomColor.ts), not just the single room MEETING_BY_ID already returns embedded
  // on the meeting. A second, independent fetch rather than relying on a warm cache, for the same
  // "reached cold" reason MEETING_BY_ID selects names itself.
  const { data: roomsData } = useQuery(REFERENCE_DATA, { fetchPolicy: 'cache-first' })
  const roomIndexById = useMemo(() => {
    const sorted = [...(roomsData?.workspace.rooms ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    return new Map(sorted.map((room, index) => [room.id, index]))
  }, [roomsData])

  // Null covers both "no such meeting" and "its day has aged out of retention" - deliberately the
  // same answer, so this page has one not-found state rather than two.
  const meeting = data?.meeting
  const roomColor = meeting ? roomColorAt(roomIndexById.get(meeting.room.id) ?? 0, theme.palette.mode) : ''

  // Shown only after a genuine in-app navigation that explicitly says so via router state - NOT
  // based on browser history depth (history.length, navigate(-1) unconditionally). Pasting this
  // page's URL into a tab that already had unrelated browsing history, signing in through the
  // resulting /signin redirect, and clicking an unconditional Back would leave the app entirely -
  // see designs/meeting-detail-consolidation.md's "Back" trade-off. Nothing in this app currently
  // sets fromInApp - every other meeting row opens the shared overlay in place rather than
  // navigating here - so Back does not render today. This is the mechanism to use if a future
  // internal link into this route is ever added: pass state={{ fromInApp: true }} on that Link/
  // navigate() call.
  const cameFromApp = Boolean((location.state as { fromInApp?: boolean } | null)?.fromInApp)

  return (
    <Stack spacing={3}>
      {cameFromApp && (
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ alignSelf: 'flex-start' }}>
          Back
        </Button>
      )}

      {!dismissedError && (
        <ErrorBanner messages={errorMessages(error)} onDismiss={() => setDismissedError(true)} />
      )}

      {loading && !data ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : !meeting ? (
        !error && <Typography color="text.secondary">Meeting not found.</Typography>
      ) : (
        <Paper sx={{ maxWidth: 480 }}>
          <MeetingDetailContent meeting={meeting} roomColor={roomColor} />
        </Paper>
      )}
    </Stack>
  )
}
