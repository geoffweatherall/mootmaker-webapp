import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface ToastState {
  toast?: string
}

export function useLocationToast() {
  const location = useLocation()
  const navigate = useNavigate()
  const stateMessage = (location.state as ToastState | null)?.toast ?? null
  const [message, setMessage] = useState<string | null>(stateMessage)

  useEffect(() => {
    if (stateMessage) {
      // Clear the navigation state so the toast doesn't reappear on refresh/back.
      navigate(location.pathname, { replace: true, state: null })
    }
    // Intentionally run once on mount only, to consume the one-shot toast state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { message, clear: () => setMessage(null) }
}
