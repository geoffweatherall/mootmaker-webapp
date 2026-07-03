// Backend times are ISO-8601 local date-times with no time-zone offset (e.g.
// "2026-07-01T14:30:00"). Render them as-is, just swapping the separator and
// dropping seconds, rather than parsing as a zoned Date (which would silently
// apply the browser's local time zone).
export function formatLocalDateTime(isoLocalDateTime: string): string {
  const [date, time] = isoLocalDateTime.split('T')
  if (!time) return isoLocalDateTime
  return `${date} ${time.slice(0, 5)}`
}
