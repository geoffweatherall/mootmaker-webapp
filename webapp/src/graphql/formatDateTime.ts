// Backend times are ISO-8601 local date-times with no time-zone offset (e.g.
// "2026-07-01T14:30:00"). Rendered by pulling the wall-clock components straight out of the
// string rather than parsing to a Date (which would silently apply the browser's time zone to a
// value that was never meant to carry one). Every function here keeps that invariant: the digits
// that come out are the digits that went in, only rearranged.
//
// The API always speaks ISO-8601 regardless of anyone's preference - these formats are a display
// concern only, applied at the edge, on the way to and from a human.

/** Mirrors the GraphQL DateFormat enum. */
export type DateFormat = 'Usa' | 'British' | 'Iso'

/** Mirrors the GraphQL TimeFormat enum. */
export type TimeFormat = 'TwentyFourHour' | 'AmPm'

export const DEFAULT_DATE_FORMAT: DateFormat = 'Iso'
export const DEFAULT_TIME_FORMAT: TimeFormat = 'TwentyFourHour'

interface Parts {
  year: string
  month: string
  day: string
  hour: string
  minute: string
}

// Matched rather than split on '-', so a non-date like "not-a-date-time" is rejected outright
// instead of yielding four truthy pieces and being reassembled into plausible-looking nonsense.
const ISO_LOCAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function parts(isoLocalDateTime: string): Parts | null {
  const [date, time] = isoLocalDateTime.split('T')
  const matched = ISO_LOCAL_DATE.exec(date ?? '')
  if (!matched) {
    return null
  }
  const [, year, month, day] = matched
  const [hour, minute] = (time ?? '').split(':')
  return { year, month, day, hour: hour ?? '', minute: minute ?? '' }
}

/**
 * The date portion, in the viewer's own format. Zero-padded in all three, matching what MUI's
 * pickers already render, so an input and its later display agree digit for digit.
 */
export function formatLocalDate(isoLocalDateTime: string, dateFormat: DateFormat): string {
  const p = parts(isoLocalDateTime)
  if (!p) {
    return isoLocalDateTime
  }
  switch (dateFormat) {
    case 'Usa':
      return `${p.month}/${p.day}/${p.year}`
    case 'British':
      return `${p.day}/${p.month}/${p.year}`
    case 'Iso':
      return `${p.year}-${p.month}-${p.day}`
  }
}

/**
 * The time portion, in the viewer's own format - for compact display (e.g. calendar/timeline
 * views), and for a meeting's start/end once its date is already shown separately (see
 * formatLocalDate), so the date isn't repeated within each of two full date-times.
 */
export function formatLocalTime(isoLocalDateTime: string, timeFormat: TimeFormat): string {
  const [, time] = isoLocalDateTime.split('T')
  if (!time) {
    return isoLocalDateTime
  }
  const hhmm = time.slice(0, 5)
  if (timeFormat === 'TwentyFourHour') {
    return hhmm
  }
  const [hour, minute] = hhmm.split(':')
  const hour24 = Number(hour)
  if (!Number.isInteger(hour24)) {
    return hhmm
  }
  const meridiem = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${String(hour12).padStart(2, '0')}:${minute} ${meridiem}`
}

/**
 * The dayjs pattern MUI's DatePicker should use, so the field a user types into matches the way
 * dates are rendered back to them everywhere else.
 */
export function datePickerFormat(dateFormat: DateFormat): string {
  switch (dateFormat) {
    case 'Usa':
      return 'MM/DD/YYYY'
    case 'British':
      return 'DD/MM/YYYY'
    case 'Iso':
      return 'YYYY-MM-DD'
  }
}

/** MUI's TimePicker takes a boolean rather than a pattern: true means a 12-hour AM/PM field. */
export function timePickerUsesAmPm(timeFormat: TimeFormat): boolean {
  return timeFormat === 'AmPm'
}
