import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/authContext'
import { weekStartAdapterLocale } from './weekStartLocale'

/**
 * Must sit inside `AuthProvider`, not outside it, specifically so it can read the signed-in
 * viewer's own `weekStart` preference and pass the matching custom dayjs locale (see
 * weekStartLocale.ts) as `adapterLocale` - a signed-out visitor, or one whose preference hasn't
 * loaded yet, gets the default (Monday), the same defaulting every other preference already uses.
 */
export function LocalizedPickersProvider({ children }: { children: ReactNode }) {
  const { weekStart } = useAuth()
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={weekStartAdapterLocale(weekStart)}>
      {children}
    </LocalizationProvider>
  )
}
