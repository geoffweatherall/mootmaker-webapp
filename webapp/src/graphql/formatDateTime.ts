// Backend times are ISO-8601 local date-times with no time-zone offset (e.g.
// "2026-07-01T14:30:00"). Rendered as-is via string slicing rather than parsed as a zoned Date
// (which would silently apply the browser's local time zone).

// Just the "HH:mm" portion, for compact display (e.g. calendar/timeline views) - and for a
// meeting's start/end once its date is already shown separately (see formatLocalDate below), so
// the date isn't repeated within each of two full date-times.
export function formatLocalTime(isoLocalDateTime: string): string {
  const [, time] = isoLocalDateTime.split('T')
  return time ? time.slice(0, 5) : isoLocalDateTime
}

// Just the "YYYY-MM-DD" portion - for showing a meeting's date once (e.g. MeetingDetailsPage's
// "Date" row) alongside separately formatted start/end times. A meeting's start and end are
// always on the same calendar day (the API rejects MeetingError.SpansMultipleDays), so either
// field gives the same date.
export function formatLocalDate(isoLocalDateTime: string): string {
  const [date] = isoLocalDateTime.split('T')
  return date
}
