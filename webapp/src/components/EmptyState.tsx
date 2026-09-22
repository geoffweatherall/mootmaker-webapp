import { Stack, Typography, useTheme, type SvgIconProps } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type { ComponentType } from 'react'
import { EmptyStateIcon } from '../icons'

interface EmptyStateProps {
  message: string
  /** Defaults to the generic EmptyStateIcon glyph, so a future empty state doesn't need a
   * bespoke icon before it can use this component. */
  icon?: ComponentType<SvgIconProps>
  /** "success" (green) is reserved for a state that means something was resolved - e.g.
   * Needs-your-response's "you're caught up". Every other empty state ("nothing exists yet" -
   * no rooms, no people, no meetings today) uses the neutral primary-indigo default. See
   * designs/home-and-misc-pages-redesign.md's "Trade-offs and decisions". */
  tone?: 'neutral' | 'success'
}

// A small brand moment for the handful of "there's nothing here" spots (no meetings today, no
// rooms yet, no people yet, nothing awaiting a response) that used to be a single line of muted
// `Typography`, then bespoke full-colour SVG illustrations - now one shared icon-in-a-tinted-
// circle pattern (matching PersonAvatar's own tonal-wash treatment), so every empty state reads
// as part of the same family.
export function EmptyState({ message, icon: Icon = EmptyStateIcon, tone = 'neutral' }: EmptyStateProps) {
  const theme = useTheme()
  const hue = tone === 'success' ? theme.palette.success.main : theme.palette.primary.main

  return (
    <Stack spacing={1.5} sx={{ alignItems: 'center', py: 3, color: 'text.secondary' }}>
      <Stack
        sx={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          bgcolor: alpha(hue, 0.12),
          color: hue,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* titleAccess gives the icon role="img" + an accessible name (see SvgIcon.js) instead of
            the aria-hidden default - so this reads as more than a bare text row (e.g. to
            acceptance/tests/home-page.spec.ts's D.23), matching this project's "locate by role
            and accessible name" convention rather than a generic <img> query. */}
        <Icon sx={{ fontSize: 24 }} titleAccess={message} />
      </Stack>
      <Typography color="text.secondary" align="center">
        {message}
      </Typography>
    </Stack>
  )
}
