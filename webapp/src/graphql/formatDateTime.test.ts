import { describe, expect, it } from 'vitest'
import {
  datePickerFormat,
  formatLocalDate,
  formatLocalTime,
  timePickerUsesAmPm,
  type DateFormat,
  type TimeFormat,
} from './formatDateTime'

describe('formatLocalTime', () => {
  it('returns just the HH:mm portion of an ISO-8601 local date-time', () => {
    expect(formatLocalTime('2026-07-01T14:30:00', 'TwentyFourHour')).toBe('14:30')
  })

  it('truncates seconds and any finer precision', () => {
    expect(formatLocalTime('2026-07-01T09:05:42', 'TwentyFourHour')).toBe('09:05')
  })

  it('falls back to the raw input when there is no "T" separator', () => {
    expect(formatLocalTime('not-a-date-time', 'TwentyFourHour')).toBe('not-a-date-time')
  })

  it('renders an afternoon time as PM, zero-padded like the picker does', () => {
    expect(formatLocalTime('2026-07-01T14:30:00', 'AmPm')).toBe('02:30 PM')
  })

  it('renders a morning time as AM', () => {
    expect(formatLocalTime('2026-07-01T10:15:00', 'AmPm')).toBe('10:15 AM')
  })

  // The two hours that a naive `hour % 12` gets wrong, both rendering as "00:xx".
  it('renders midnight as 12 AM and noon as 12 PM', () => {
    expect(formatLocalTime('2026-07-01T00:30:00', 'AmPm')).toBe('12:30 AM')
    expect(formatLocalTime('2026-07-01T12:30:00', 'AmPm')).toBe('12:30 PM')
  })
})

describe('formatLocalDate', () => {
  it('returns the YYYY-MM-DD portion for the ISO format', () => {
    expect(formatLocalDate('2026-07-01T14:30:00', 'Iso')).toBe('2026-07-01')
  })

  it('reorders to DD/MM/YYYY for the British format', () => {
    expect(formatLocalDate('2026-07-01T14:30:00', 'British')).toBe('01/07/2026')
  })

  it('reorders to MM/DD/YYYY for the USA format', () => {
    expect(formatLocalDate('2026-07-01T14:30:00', 'Usa')).toBe('07/01/2026')
  })

  it('keeps zero padding, so a display matches what the picker rendered', () => {
    expect(formatLocalDate('2026-01-05T09:00:00', 'Usa')).toBe('01/05/2026')
    expect(formatLocalDate('2026-01-05T09:00:00', 'British')).toBe('05/01/2026')
  })

  it('gives the same date for a start and end time on the same day', () => {
    const start = '2026-12-25T09:00:00'
    const end = '2026-12-25T17:15:00'
    expect(formatLocalDate(start, 'Iso')).toBe(formatLocalDate(end, 'Iso'))
  })

  it('falls back to the raw input when it is not a date at all', () => {
    expect(formatLocalDate('not-a-date-time', 'Iso')).toBe('not-a-date-time')
  })
})

// The whole point of the naive string handling: a value with no offset must never be shifted by
// the browser's time zone. These would break if anything here started going through Date.
describe('time-zone independence', () => {
  it('never shifts the wall-clock digits it was given', () => {
    const lateEvening = '2026-07-01T23:45:00'
    expect(formatLocalTime(lateEvening, 'TwentyFourHour')).toBe('23:45')
    expect(formatLocalDate(lateEvening, 'Iso')).toBe('2026-07-01')
  })

  it('keeps a just-after-midnight time on its own calendar date', () => {
    const justAfterMidnight = '2026-07-01T00:15:00'
    expect(formatLocalTime(justAfterMidnight, 'TwentyFourHour')).toBe('00:15')
    expect(formatLocalDate(justAfterMidnight, 'Iso')).toBe('2026-07-01')
  })
})

describe('picker formats', () => {
  it.each([
    ['Iso', 'YYYY-MM-DD'],
    ['British', 'DD/MM/YYYY'],
    ['Usa', 'MM/DD/YYYY'],
  ] as [DateFormat, string][])('gives the DatePicker %s as %s', (dateFormat, expected) => {
    expect(datePickerFormat(dateFormat)).toBe(expected)
  })

  it.each([
    ['TwentyFourHour', false],
    ['AmPm', true],
  ] as [TimeFormat, boolean][])('tells the TimePicker %s means ampm=%s', (timeFormat, expected) => {
    expect(timePickerUsesAmPm(timeFormat)).toBe(expected)
  })

  // The formats a picker writes and the strings formatLocalDate renders must agree, or a user
  // sees their own meeting's date written differently from the field they typed it into.
  it('matches what formatLocalDate produces for the same setting', () => {
    expect(formatLocalDate('2026-01-05T09:00:00', 'Usa')).toBe('01/05/2026')
    expect(datePickerFormat('Usa')).toBe('MM/DD/YYYY')
  })
})
