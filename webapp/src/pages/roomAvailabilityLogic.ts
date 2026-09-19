import type { Dayjs } from 'dayjs'
import { formatLocalTime, type TimeFormat } from '../graphql/formatDateTime'

export function minutesSinceMidnight(isoLocalDateTime: string): number {
  const [, time] = isoLocalDateTime.split('T')
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
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
