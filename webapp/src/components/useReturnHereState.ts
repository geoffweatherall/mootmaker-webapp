import { useLocation } from 'react-router-dom'

/**
 * Link state that brings the meeting form back to the current page after Save - see
 * pageAfterSave (mootmaker-webapp#146).
 */
export function useReturnHereState(): { returnTo: string } {
  const location = useLocation()
  return { returnTo: `${location.pathname}${location.search}` }
}
