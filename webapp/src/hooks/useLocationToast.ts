import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

interface ToastState {
  toast?: string
}

export function useLocationToast() {
  const location = useLocation()
  const navigate = useNavigate()
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    // Re-runs on every navigation (not just mount) - the component calling this hook (Layout)
    // stays mounted across client-side route changes, so a `useState` initializer alone would
    // only ever see whichever location.state existed at Layout's very first render, never a
    // later one.
    const stateMessage = (location.state as ToastState | null)?.toast ?? null
    if (stateMessage) {
      setMessage(stateMessage)
      // Clear the navigation state so the toast doesn't reappear on refresh/back, and so this
      // effect doesn't re-fire for the same message on the next unrelated render.
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])

  return { message, clear: () => setMessage(null) }
}
