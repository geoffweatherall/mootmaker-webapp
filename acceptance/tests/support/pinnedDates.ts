/**
 * Pinned clock instants derived from `now()`, rather than hardcoded calendar dates.
 *
 * **The problem this exists to solve.** Almost every acceptance test pins `page.clock.setFixedTime`
 * so it does not flake when the suite happens to run outside business hours. Pinning to a literal
 * date makes that deterministic and *also* gives the test an expiry date: the server's retention
 * boundary advances every Monday (`previousOrSame(MONDAY)` of `today - RETENTION_DAYS_MINIMUM`), and
 * once it passes a pinned date, every booking that test makes is rejected `OutsideBookableRange`.
 *
 * That is not hypothetical - it has already cost one debugging session. The failure never says
 * "wrong date": the booking fails, and the test reports whatever it did next, which is usually a
 * navigation assertion or a missing meeting. See mootmaker-webapp#58.
 *
 * **What the dates have to preserve**, and why this is not simply `new Date()`:
 *
 * - **A weekday.** PersonCalendarPage renders a Monday-Friday grid, so a weekend date has no cell to
 *   assert against.
 * - **Business hours.** RoomAvailabilityPage renders only 08:00-17:00, so a meeting created outside
 *   that window is created successfully and falls off the visible grid - which reads as a missing
 *   meeting rather than as a time problem.
 * - **Relationships between dates.** Some tests need consecutive days, or the same weekday across
 *   consecutive weeks. Those must move together, not be re-derived independently.
 *
 * Anchored on the Monday of the current ISO week, so every date is a few days from now: comfortably
 * inside the retention boundary (roughly four weeks back) and the 180-day booking horizon.
 */

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] as const

export type Weekday = (typeof WEEKDAYS)[number]

export interface PinnedWeekdayOptions {
  /** Whole weeks from the current one. Negative is the past. Kept well inside retention. */
  weeks?: number
  /** Hour of day, 24-hour. Defaults to 10:00, comfortably inside the 08:00-17:00 grid. */
  hour?: number
  minute?: number
}

/**
 * The Monday of the current ISO week, captured ONCE when this module is first imported.
 *
 * Once, deliberately: a full run takes around half an hour, so a suite that started on a Sunday
 * evening could otherwise compute a different anchor week for tests that run either side of
 * midnight. Playwright's single worker evaluates this module once, so every spec in a run shares
 * one anchor and the relationships between dates hold across files as well as within them.
 */
const anchorMonday = ((): Date => {
  const now = new Date()
  // getDay() is 0=Sunday..6=Saturday; ISO weeks start on Monday, so Sunday is 6 days into its week.
  const daysSinceMonday = (now.getDay() + 6) % 7
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday)
})()

/** A weekday in (or near) the current week, at a known hour. See this module's own docs. */
export function pinnedWeekday(weekday: Weekday, options: PinnedWeekdayOptions = {}): Date {
  const { weeks = 0, hour = 10, minute = 0 } = options
  const dayOffset = WEEKDAYS.indexOf(weekday) + weeks * 7
  return new Date(
    anchorMonday.getFullYear(),
    anchorMonday.getMonth(),
    anchorMonday.getDate() + dayOffset,
    hour,
    minute,
  )
}

/**
 * A weekday far enough ahead that no other test in a shared environment will have booked it.
 *
 * Sixteen weeks, which is inside the 180-day booking horizon (112 days) with room to spare. Used by
 * the room-suggestion tests, which rank every room in the environment that has no overlapping
 * meeting - so they need a date and time nothing else has ever touched.
 */
export function pinnedFutureWeekday(weekday: Weekday, options: PinnedWeekdayOptions = {}): Date {
  return pinnedWeekday(weekday, { ...options, weeks: (options.weeks ?? 0) + 16 })
}

/**
 * Local (not UTC) YYYY-MM-DD, for the `/rooms/:date/availability` path segment.
 *
 * Matches RoomAvailabilityPage's own DATE_PARAM_FORMAT and how `dayjs().format('YYYY-MM-DD')` reads
 * a pinned clock in the browser. Using `toISOString()` here instead would silently shift by a day
 * whenever the host's local timezone is not UTC - which is every developer machine in this project.
 */
export function formatDateParam(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const MONTH_ABBREV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * The label PersonCalendarPage prints inside a day cell - day of month, no leading zero, then the
 * short month: `2 Sep`. Local, for the same timezone reason `formatDateParam` documents.
 */
export function formatDayCell(date: Date): string {
  return `${date.getDate()} ${MONTH_ABBREV[date.getMonth()]}`
}
