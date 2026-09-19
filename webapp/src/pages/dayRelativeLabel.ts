import type { Dayjs } from 'dayjs'

/**
 * "today"/"tomorrow" for the two near days, or null for anything else - in which case the caller
 * falls back to the plain weekday name (date.format('dddd')). Shared between Room Availability's
 * cards and Person Calendar's agenda so both use exactly the same day-relative framing - see
 * designs/room-availability-and-person-calendar-redesign.md's "Day-relative framing" decision.
 */
export function dayRelativeLabel(date: Dayjs, now: Dayjs): 'today' | 'tomorrow' | null {
  if (date.isSame(now, 'day')) return 'today'
  if (date.isSame(now.add(1, 'day'), 'day')) return 'tomorrow'
  return null
}
