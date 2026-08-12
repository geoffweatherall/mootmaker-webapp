import { Box, Stack, Typography } from '@mui/material'
import { EmptyStateIcon } from '../icons'

interface EmptyStateProps {
  message: string
  /** A full-colour flat-illustration asset (see src/assets/empty-*.svg) for this specific empty
   * state. Falls back to the generic circular EmptyStateIcon glyph when omitted, so a future
   * empty state doesn't need bespoke art before it can use this component. */
  illustration?: string
}

// A small brand moment for the handful of "there's nothing here" spots (no meetings today/
// tomorrow, no rooms yet, no people yet) that used to be a single line of muted `Typography`.
export function EmptyState({ message, illustration }: EmptyStateProps) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', py: 3, color: 'text.secondary' }}>
      {illustration ? (
        <Box component="img" src={illustration} alt="" sx={{ width: 140, maxWidth: '100%' }} />
      ) : (
        <Stack
          sx={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            bgcolor: 'action.hover',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <EmptyStateIcon sx={{ fontSize: 24 }} />
        </Stack>
      )}
      <Typography color="text.secondary" align="center">
        {message}
      </Typography>
    </Stack>
  )
}
