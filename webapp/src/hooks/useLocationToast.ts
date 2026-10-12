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
    const state = location.state as (ToastState & Record<string, unknown>) | null
    const stateMessage = state?.toast ?? null
    if (state && stateMessage) {
      setMessage(stateMessage)
      // Clear the TOAST from the navigation state so it doesn't reappear on refresh/back, and so
      // this effect doesn't re-fire for the same message on the next unrelated render.
      //
      // Only the toast, never `state: null`: this hook lives in Layout, which stays mounted across
      // route changes, so it runs almost immediately after any navigation carrying a toast.
      // Clearing the whole state would wipe anything else travelling alongside the toast before
      // the destination page could read it.
      const { toast: _toast, ...rest } = state
      const remaining = Object.keys(rest).length > 0 ? rest : null
      navigate(location.pathname, { replace: true, state: remaining })
    }
  }, [location, navigate])

  return { message, clear: () => setMessage(null) }
}
