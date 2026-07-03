import { Alert, Snackbar } from '@mui/material'

interface SuccessToastProps {
  message: string | null
  onClose: () => void
}

export function SuccessToast({ message, onClose }: SuccessToastProps) {
  return (
    <Snackbar
      open={message !== null}
      autoHideDuration={4000}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert onClose={onClose} severity="success" variant="filled" sx={{ width: '100%' }}>
        {message}
      </Alert>
    </Snackbar>
  )
}
