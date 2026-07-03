import { Alert } from '@mui/material'

interface ErrorBannerProps {
  messages: string[]
  onDismiss: () => void
}

export function ErrorBanner({ messages, onDismiss }: ErrorBannerProps) {
  if (messages.length === 0) return null

  return (
    <Alert severity="error" onClose={onDismiss} sx={{ mb: 3 }}>
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
