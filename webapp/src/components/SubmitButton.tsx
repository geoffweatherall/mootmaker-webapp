import { Button, CircularProgress, type ButtonProps } from '@mui/material'
import { useEffect, useState } from 'react'

const FLASH_DURATION_MS = 600

interface SubmitButtonProps extends ButtonProps {
  loading: boolean
  /**
   * True while the form has errors to show. Triggers a brief red flash on the button itself -
   * immediate feedback at the point the user is already looking/tapping, for the case where the
   * ErrorBanner explaining what went wrong is scrolled out of view (e.g. a long form on a short
   * mobile screen). Each transition from no-error to has-error re-triggers the flash, including a
   * second failed attempt with the same errors, since callers clear their error state before
   * resubmitting.
   */
  hasError?: boolean
}

export function SubmitButton({ loading, hasError = false, disabled, children, sx, ...rest }: SubmitButtonProps) {
  const [flashing, setFlashing] = useState(false)

  useEffect(() => {
    if (!hasError) return
    setFlashing(true)
    const timeout = setTimeout(() => setFlashing(false), FLASH_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [hasError])

  return (
    <Button
      type="submit"
      variant="contained"
      color={flashing ? 'error' : 'primary'}
      disabled={disabled || loading}
      startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
      sx={[
        flashing && {
          animation: `submitButtonShake ${FLASH_DURATION_MS}ms`,
          '@keyframes submitButtonShake': {
            '10%, 90%': { transform: 'translateX(-1px)' },
            '20%, 80%': { transform: 'translateX(2px)' },
            '30%, 50%, 70%': { transform: 'translateX(-3px)' },
            '40%, 60%': { transform: 'translateX(3px)' },
          },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
      {...rest}
    >
      {children}
    </Button>
  )
}
