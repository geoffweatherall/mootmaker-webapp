import { describe, expect, it } from 'vitest'
import { formatLocalDate, formatLocalTime } from './formatDateTime'

describe('formatLocalTime', () => {
  it('returns just the HH:mm portion of an ISO-8601 local date-time', () => {
    expect(formatLocalTime('2026-07-01T14:30:00')).toBe('14:30')
  })

  it('truncates seconds and any finer precision', () => {
    expect(formatLocalTime('2026-07-01T09:05:42')).toBe('09:05')
  })

  it('falls back to the raw input when there is no "T" separator', () => {
    expect(formatLocalTime('not-a-date-time')).toBe('not-a-date-time')
  })
})

describe('formatLocalDate', () => {
  it('returns just the YYYY-MM-DD portion of an ISO-8601 local date-time', () => {
    expect(formatLocalDate('2026-07-01T14:30:00')).toBe('2026-07-01')
  })

  it('gives the same date for a start and end time on the same day', () => {
    const start = '2026-12-25T09:00:00'
    const end = '2026-12-25T17:15:00'
    expect(formatLocalDate(start)).toBe(formatLocalDate(end))
  })
})
