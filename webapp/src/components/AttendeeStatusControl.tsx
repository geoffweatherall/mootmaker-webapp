import { useMutation } from '@apollo/client/react'
import { Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { useState } from 'react'
import { dayInvalidations } from '../apolloClient'
import { RESPOND_TO_MEETING } from '../graphql/mutations'
import type { AttendeeStatus, RespondToMeetingResult } from '../graphql/types'
import { RESPOND_TO_MEETING_ERROR_MESSAGES } from '../graphql/validationMessages'

/**
 * The signed-in caller's own response control - Going / Maybe / Not going, mirroring
 * `respondToMeeting`'s self-only mutation (see mootmaker-api README's `respondToMeeting` entry).
 * No "No response" option: that is the unset default, not something to switch back to once
 * answered - matching the design prototype's control, which offers the same three.
 *
 * Deliberately does not select `day` on the mutation response the way `createMeeting` does -
 * `respondToMeeting`'s schema has no `day` field. Selecting the whole `meeting` (see
 * graphql/mutations.ts) is what lets the response overwrite the normalised `Meeting:<id>` cache
 * entity in place, same effect by a different route - which is also what makes the `status` prop
 * below reflect a just-confirmed change with no local state of its own: MeetingDetailContent.tsx
 * reads this meeting's attendees live via `useFragment`, so the fresh prop arrives on its own.
 */
export function AttendeeStatusControl({
  meetingId,
  meetingDate,
  status,
}: {
  meetingId: string
  /** The meeting's own date (YYYY-MM-DD), for `dayInvalidations.noteOwnWrite` - see below. */
  meetingDate: string
  status: AttendeeStatus
}) {
  const [respondToMeeting, { loading, error: transportError }] = useMutation<{
    respondToMeeting: RespondToMeetingResult
  }>(RESPOND_TO_MEETING)
  const [fieldErrors, setFieldErrors] = useState<string[]>([])

  async function handleChange(next: AttendeeStatus | null) {
    if (!next || next === status) return
    setFieldErrors([])
    // The response overwrites Meeting:<id> authoritatively, so this tab's copy of the broadcast
    // is one to ignore, like every other meeting mutation's. Noted before the request because the
    // API broadcasts inside it, so the broadcast can beat the response (mootmaker-webapp#162).
    dayInvalidations.noteOwnWrite([meetingDate])
    const result = await respondToMeeting({ variables: { meetingId, status: next } })
    const payload = result.data?.respondToMeeting
    if (!payload?.meeting && payload?.errors.length) {
      setFieldErrors(payload.errors.map((code) => RESPOND_TO_MEETING_ERROR_MESSAGES[code]))
    }
  }

  const messages = [...fieldErrors, ...(transportError ? ["Couldn't save your response - please try again."] : [])]

  return (
    <Stack spacing={0.75} sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 1.25 }}>
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
        Your response
      </Typography>
      <ToggleButtonGroup
        value={status}
        exclusive
        size="small"
        fullWidth
        disabled={loading}
        onChange={(_event, next: AttendeeStatus | null) => void handleChange(next)}
        aria-label="Your response"
      >
        <ToggleButton value="Going" color="success" aria-label="Going">
          Going
        </ToggleButton>
        <ToggleButton value="Maybe" color="warning" aria-label="Maybe">
          Maybe
        </ToggleButton>
        <ToggleButton value="NotGoing" color="error" aria-label="Not going">
          Not going
        </ToggleButton>
      </ToggleButtonGroup>
      {messages.map((message) => (
        <Typography key={message} variant="caption" color="error">
          {message}
        </Typography>
      ))}
    </Stack>
  )
}
