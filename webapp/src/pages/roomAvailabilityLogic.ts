import type { Dayjs } from 'dayjs'
import { formatLocalTime, type TimeFormat } from '../graphql/formatDateTime'

export function minutesSinceMidnight(isoLocalDateTime: string): number {
  const [, time] = isoLocalDateTime.split('T')
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** A short meeting still needs to read as a visible mark, not vanish at its true proportional
 * width - matches the prototype's own minimum. */
const MIN_SEGMENT_WIDTH_PERCENT = 1.5

/** The timeline bar's visible window. Originally the bar spanned the full 00:00-24:00 day - see
 * mootmaker-webapp#114 for why that was reversed: at the new demo-data generator's density, the
 * 00:00-08:00 and 18:00-24:00 stretches were empty dead space diluting the part of the bar that
 * carries information, and out-of-hours meetings are rare and low-contention enough that clipping
 * them is an acceptable trade (Geoff, 2026-09-22). A meeting that straddles an edge is clipped to
 * it rather than dropped; one entirely outside the window is dropped (see segmentsForRoom below). */
const WINDOW_START_MINUTES = 8 * 60
const WINDOW_END_MINUTES = 18 * 60
const WINDOW_MINUTES = WINDOW_END_MINUTES - WINDOW_START_MINUTES

export interface TimelineSegment {
  /** Percent from the left edge of the visible window. */
  left: number
  /** Percent width. */
  width: number
}

/**
 * One entry per meeting for the room's busy/free timeline bar, each positioned and sized as a
 * percentage of the visible 08:00-18:00 window. A meeting that starts before the window or ends
 * after it is clipped to the visible edge rather than misrepresented at its true proportional
 * position; a meeting entirely outside the window has no visible segment and its entry is `null` -
 * callers must keep this aligned by index with `meetings`, not filter it, so a meeting's position
 * in the returned array still matches its position in the input.
 */
export function segmentsForRoom(meetings: StatusMeeting[]): Array<TimelineSegment | null> {
  return meetings.map((meeting) => {
    const start = minutesSinceMidnight(meeting.startTime)
    const end = minutesSinceMidnight(meeting.endTime)
    if (end <= WINDOW_START_MINUTES || start >= WINDOW_END_MINUTES) {
      return null
    }
    const clippedStart = Math.max(start, WINDOW_START_MINUTES)
    const clippedEnd = Math.min(end, WINDOW_END_MINUTES)
    return {
      left: ((clippedStart - WINDOW_START_MINUTES) / WINDOW_MINUTES) * 100,
      width: Math.max(((clippedEnd - clippedStart) / WINDOW_MINUTES) * 100, MIN_SEGMENT_WIDTH_PERCENT),
    }
  })
}

export interface RoomStatus {
  label: string
  free: boolean
  subLabel: string
}

/** The minimum a meeting needs to carry to compute a room's status - narrower than the full
 * generated Meeting type so tests can build fixtures without every GraphQL field. */
export interface StatusMeeting {
  subject: string
  startTime: string
  endTime: string
}

/**
 * A room card's headline status and caption. Only "today" has a "now" to be busy/free relative
 * to - a future day gets a plain summary instead of a live pill, since "busy until 14:00" makes
 * no sense for a day that hasn't started yet. `meetings` must already be sorted by startTime.
 */
export function statusForRoom(
  meetings: StatusMeeting[],
  isToday: boolean,
  now: Dayjs,
  timeFormat: TimeFormat,
): RoomStatus {
  if (isToday) {
    const nowMinutes = now.hour() * 60 + now.minute()
    const busy = meetings.find((meeting) => {
      const start = minutesSinceMidnight(meeting.startTime)
      const end = minutesSinceMidnight(meeting.endTime)
      return start <= nowMinutes && nowMinutes < end
    })
    if (busy) {
      return { label: `Busy until ${formatLocalTime(busy.endTime, timeFormat)}`, free: false, subLabel: busy.subject }
    }
    const next = meetings.find((meeting) => minutesSinceMidnight(meeting.startTime) > nowMinutes)
    return {
      label: 'Free now',
      free: true,
      subLabel: next
        ? `Next: ${next.subject} at ${formatLocalTime(next.startTime, timeFormat)}`
        : 'No more meetings today',
    }
  }
  if (meetings.length === 0) {
    return { label: 'Free all day', free: true, subLabel: 'No meetings booked yet.' }
  }
  return {
    label: `${meetings.length} ${meetings.length === 1 ? 'meeting' : 'meetings'}`,
    free: false,
    subLabel: `First: ${meetings[0].subject} at ${formatLocalTime(meetings[0].startTime, timeFormat)}`,
  }
}
