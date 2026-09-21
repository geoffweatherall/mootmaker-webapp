import { useTheme } from '@mui/material'
import type { AttendeeStatus } from '../graphql/types'

const STATUS_LABELS: Record<AttendeeStatus, string> = {
  Going: 'Going',
  NotGoing: 'Not going',
  Maybe: 'Maybe',
  NoResponse: 'No response',
}

/**
 * Option A from the design prototype (https://claude.ai/artifact/NifSs32je8ejXWttFsh95D) - a
 * filled circle with a white glyph, chosen over an outline or colour-only treatment because it
 * carries the state two ways at once (colour and shape), so it still reads for a colourblind
 * viewer and in greyscale. Reuses MUI's own success/error/warning palette rather than inventing a
 * fourth categorical colour scheme alongside the room-colour palette (theme/roomColor.ts), which
 * exists for a different purpose (telling rooms apart) - see designs/attendee-response-status.md's
 * "Choices you had me make".
 */
export function AttendeeStatusBadge({ status, size = 20 }: { status: AttendeeStatus; size?: number }) {
  const theme = useTheme()
  const glyphSize = size * 0.55

  const { background, foreground } = (() => {
    switch (status) {
      case 'Going':
        return { background: theme.palette.success.main, foreground: theme.palette.success.contrastText }
      case 'NotGoing':
        return { background: theme.palette.error.main, foreground: theme.palette.error.contrastText }
      case 'Maybe':
        return { background: theme.palette.warning.main, foreground: theme.palette.warning.contrastText }
      case 'NoResponse':
        return { background: theme.palette.action.disabledBackground, foreground: theme.palette.text.disabled }
    }
  })()

  return (
    // role="img" + aria-label rather than a bare decorative circle: the status is information, not
    // decoration, and this is often the ONLY place it's conveyed (e.g. Home page cards have no
    // adjacent text naming the status) - see PersonAvatar.tsx for the opposite case, where an
    // adjacent name already covers what a screen reader needs.
    <div
      role="img"
      aria-label={STATUS_LABELS[status]}
      title={STATUS_LABELS[status]}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        background,
      }}
    >
      {status === 'Going' && (
        <svg width={glyphSize} height={glyphSize} viewBox="0 0 16 16" fill="none">
          <path
            d="M4 8.5l2.7 2.7L12 5"
            stroke={foreground}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {status === 'NotGoing' && (
        <svg width={glyphSize} height={glyphSize} viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke={foreground} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )}
      {status === 'Maybe' && (
        <span style={{ fontSize: glyphSize, fontWeight: 800, color: foreground, lineHeight: 1 }}>?</span>
      )}
      {status === 'NoResponse' && (
        <div
          style={{
            width: size * 0.3,
            height: size * 0.3,
            borderRadius: '50%',
            background: foreground,
            opacity: 0.6,
          }}
        />
      )}
    </div>
  )
}
