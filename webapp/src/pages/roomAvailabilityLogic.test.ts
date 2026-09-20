import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { minutesSinceMidnight, segmentsForRoom, statusForRoom, type StatusMeeting } from './roomAvailabilityLogic'

describe('minutesSinceMidnight', () => {
  it('reads the wall-clock hour and minute out of an ISO-8601 local date-time', () => {
    expect(minutesSinceMidnight('2026-09-21T09:30:00')).toBe(9 * 60 + 30)
    expect(minutesSinceMidnight('2026-09-21T00:00:00')).toBe(0)
  })
})

describe('statusForRoom', () => {
  const now = dayjs('2026-09-21T10:00:00')

  it('is "Free now" for today with no meetings at all', () => {
    const status = statusForRoom([], true, now, 'TwentyFourHour')
    expect(status).toEqual({ label: 'Free now', free: true, subLabel: 'No more meetings today' })
  })

  it('is "Busy until <end>" when now falls inside a meeting - the [start, end) half-open interval', () => {
    const meetings: StatusMeeting[] = [{ subject: 'Standup', startTime: '2026-09-21T09:30:00', endTime: '2026-09-21T10:30:00' }]
    const status = statusForRoom(meetings, true, now, 'TwentyFourHour')
    expect(status).toEqual({ label: 'Busy until 10:30', free: false, subLabel: 'Standup' })
  })

  it('is free again exactly at a meeting\'s own end minute, not busy for one extra minute', () => {
    const meetings: StatusMeeting[] = [{ subject: 'Standup', startTime: '2026-09-21T09:00:00', endTime: '2026-09-21T10:00:00' }]
    const status = statusForRoom(meetings, true, now, 'TwentyFourHour')
    expect(status.free).toBe(true)
  })

  it('is "Free now" with the next meeting named, when today has one later but none happening now', () => {
    const meetings: StatusMeeting[] = [{ subject: 'Design Review', startTime: '2026-09-21T14:00:00', endTime: '2026-09-21T15:00:00' }]
    const status = statusForRoom(meetings, true, now, 'TwentyFourHour')
    expect(status).toEqual({
      label: 'Free now',
      free: true,
      subLabel: 'Next: Design Review at 14:00',
    })
  })

  it('ignores a meeting that already finished today, rather than offering it as "next"', () => {
    const meetings: StatusMeeting[] = [{ subject: 'Early Sync', startTime: '2026-09-21T08:00:00', endTime: '2026-09-21T08:30:00' }]
    const status = statusForRoom(meetings, true, now, 'TwentyFourHour')
    expect(status).toEqual({ label: 'Free now', free: true, subLabel: 'No more meetings today' })
  })

  it('is "Free all day" for a future day with no meetings booked', () => {
    const status = statusForRoom([], false, now, 'TwentyFourHour')
    expect(status).toEqual({ label: 'Free all day', free: true, subLabel: 'No meetings booked yet.' })
  })

  it('summarises a future day\'s meeting count and first meeting, never a live busy/free pill', () => {
    const meetings: StatusMeeting[] = [
      { subject: 'All-Hands', startTime: '2026-09-25T09:00:00', endTime: '2026-09-25T10:00:00' },
      { subject: 'Retro', startTime: '2026-09-25T14:00:00', endTime: '2026-09-25T15:00:00' },
    ]
    const status = statusForRoom(meetings, false, now, 'TwentyFourHour')
    expect(status).toEqual({
      label: '2 meetings',
      free: false,
      subLabel: 'First: All-Hands at 09:00',
    })
  })

  it('uses singular "1 meeting" for a future day with exactly one', () => {
    const meetings: StatusMeeting[] = [{ subject: 'Retro', startTime: '2026-09-25T14:00:00', endTime: '2026-09-25T15:00:00' }]
    const status = statusForRoom(meetings, false, now, 'TwentyFourHour')
    expect(status.label).toBe('1 meeting')
  })
})

describe('segmentsForRoom', () => {
  it('positions and sizes a segment as a percentage of the full 00:00-24:00 day', () => {
    const meetings: StatusMeeting[] = [{ subject: 'Standup', startTime: '2026-09-21T06:00:00', endTime: '2026-09-21T12:00:00' }]
    expect(segmentsForRoom(meetings)).toEqual([{ left: 25, width: 25 }])
  })

  it('returns one segment per meeting, in the same order', () => {
    const meetings: StatusMeeting[] = [
      { subject: 'Standup', startTime: '2026-09-21T09:00:00', endTime: '2026-09-21T09:30:00' },
      { subject: 'Retro', startTime: '2026-09-21T14:00:00', endTime: '2026-09-21T15:00:00' },
    ]
    expect(segmentsForRoom(meetings)).toHaveLength(2)
  })

  it('gives a very short meeting a minimum visible width rather than letting it vanish', () => {
    const meetings: StatusMeeting[] = [{ subject: 'Quick check-in', startTime: '2026-09-21T09:00:00', endTime: '2026-09-21T09:05:00' }]
    expect(segmentsForRoom(meetings)[0].width).toBe(1.5)
  })

  it('does not clip or clamp a meeting outside a business-hours window - this app has none', () => {
    const meetings: StatusMeeting[] = [{ subject: 'Late call', startTime: '2026-09-21T22:00:00', endTime: '2026-09-21T23:00:00' }]
    const [segment] = segmentsForRoom(meetings)
    // 22:00 = 1320 of 1440 minutes = 91.666...%
    expect(segment.left).toBeCloseTo((22 * 60 / (24 * 60)) * 100)
    expect(segment.width).toBeCloseTo((60 / (24 * 60)) * 100)
  })

  it('returns an empty array for a room with no meetings', () => {
    expect(segmentsForRoom([])).toEqual([])
  })
})
