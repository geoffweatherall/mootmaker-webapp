import { Button, CircularProgress, type ButtonProps } from '@mui/material'

interface SubmitButtonProps extends ButtonProps {
  loading: boolean
}

export function SubmitButton({ loading, disabled, children, ...rest }: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      variant="contained"
      disabled={disabled || loading}
      startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
      {...rest}
    >
      {children}
    </Button>
  )
}
