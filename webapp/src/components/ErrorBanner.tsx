import { Alert } from '@mui/material'

interface ErrorBannerProps {
  messages: string[]
  onDismiss: () => void
}

export function ErrorBanner({ messages, onDismiss }: ErrorBannerProps) {
  if (messages.length === 0) return null

  return (
    <Alert
      severity="error"
      onClose={onDismiss}
      // Sticky rather than fixed at the top of the page: on a long form the user may have
      // scrolled well past it by the time they submit, so pin it just below the mobile app bar
      // (there's no fixed app bar from "md" up, hence top: 0 there) as soon as it would otherwise
      // scroll out of view, instead of leaving it undiscoverable off-screen.
      // zIndex must clear MUI's own floating InputLabel (z-index: 1) - otherwise a field label
      // scrolled directly beneath the stuck banner wins the DOM-order tiebreak at equal z-index
      // and paints through it.
      sx={{ mb: 3, position: 'sticky', top: { xs: 56, sm: 64, md: 0 }, zIndex: 2 }}
    >
      {messages.length === 1 ? (
        messages[0]
      ) : (
        <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </Alert>
  )
}
