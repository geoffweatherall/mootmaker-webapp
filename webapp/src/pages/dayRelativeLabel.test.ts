import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { dayRelativeLabel } from './dayRelativeLabel'

describe('dayRelativeLabel', () => {
  const now = dayjs('2026-09-21T10:00:00') // a Monday, mid-morning

  it('returns "today" for the same calendar day as now, regardless of time of day', () => {
    expect(dayRelativeLabel(dayjs('2026-09-21T23:59:00'), now)).toBe('today')
    expect(dayRelativeLabel(dayjs('2026-09-21T00:00:01'), now)).toBe('today')
  })

  it('returns "tomorrow" for the next calendar day', () => {
    expect(dayRelativeLabel(dayjs('2026-09-22T00:00:01'), now)).toBe('tomorrow')
  })

  it('returns null for a day further out, leaving the weekday name to the caller', () => {
    expect(dayRelativeLabel(dayjs('2026-09-25T10:00:00'), now)).toBeNull()
  })

  it('returns null for a day in the past', () => {
    expect(dayRelativeLabel(dayjs('2026-09-20T10:00:00'), now)).toBeNull()
  })
})
