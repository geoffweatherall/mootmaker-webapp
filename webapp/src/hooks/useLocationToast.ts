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
    if (stateMessage) {
      setMessage(stateMessage)
      // Clear the TOAST from the navigation state so it doesn't reappear on refresh/back, and so
      // this effect doesn't re-fire for the same message on the next unrelated render.
      //
      // Only the toast. This used to pass `state: null`, which destroyed every other key a page
      // had put there - and since this hook lives in Layout, which stays mounted across route
      // changes, it ran almost immediately after any navigation carrying a toast. Anything else
      // travelling alongside the toast was silently wiped before the destination page could read
      // it. Nothing depended on that until RoomAvailabilityPage started receiving a just-created
      // meeting this way; it would have been a very confusing first bug to meet.
      const { toast: _toast, ...rest } = state
      const remaining = Object.keys(rest).length > 0 ? rest : null
      navigate(location.pathname, { replace: true, state: remaining })
    }
  }, [location, navigate])

  return { message, clear: () => setMessage(null) }
}
