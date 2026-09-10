import { expect, test } from '@playwright/test'
import { pinnedFutureWeekday, pinnedWeekday } from './support/pinnedDates'

// The helper every other spec in this directory pins its clock with. No browser, no environment -
// these are assertions about the dates themselves, which is what the rest of the suite depends on
// and what nothing else would state. See support/pinnedDates.ts and mootmaker-webapp#58 for why
// hardcoded dates were removed in the first place.

// Kept in step with mootmaker-api's Limits: retention floors bookings at previousOrSame(MONDAY) of
// today - 30, and the horizon caps them at today + 180.
const RETENTION_DAYS_MINIMUM = 30
const BOOKING_HORIZON_DAYS = 180

function daysFromToday(date: Date): number {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000)
}

test('every pinned date is a weekday, because the calendar grid only has Monday-Friday cells', () => {
  for (const weeks of [-2, -1, 0, 1, 8, 16]) {
    for (const weekday of ['Monday', 'Wednesday', 'Friday'] as const) {
      const pinned = pinnedWeekday(weekday, { weeks })
      expect(pinned.getDay(), `${weekday} ${weeks} weeks out fell on a weekend`).toBeGreaterThan(0)
      expect(pinned.getDay()).toBeLessThan(6)
    }
  }
})

test('the named weekday is the weekday you get', () => {
  // getDay() is 0=Sunday, so Monday is 1. The bug this catches is an off-by-one in the anchor,
  // which would otherwise surface as a whole suite of unrelated-looking failures.
  expect(pinnedWeekday('Monday').getDay()).toBe(1)
  expect(pinnedWeekday('Wednesday').getDay()).toBe(3)
  expect(pinnedWeekday('Friday').getDay()).toBe(5)
  expect(pinnedWeekday('Wednesday', { weeks: -2 }).getDay()).toBe(3)
})

test('pinned dates default to inside the 08:00-17:00 availability grid', () => {
  // A meeting booked outside business hours is created successfully and then simply does not appear
  // on RoomAvailabilityPage, which reads as a missing meeting rather than as a time problem.
  const pinned = pinnedWeekday('Wednesday')
  expect(pinned.getHours()).toBeGreaterThanOrEqual(8)
  expect(pinned.getHours()).toBeLessThan(17)
})

test('every pinned date the suite uses is bookable: inside retention and inside the horizon', () => {
  // The whole point of #58. A hardcoded date passes this today and fails it silently in a fortnight.
  // Every offset the suite actually uses, including the 8-week isolation G.63 needs.
  for (const weeks of [-2, -1, 0, 1, 8]) {
    const offset = daysFromToday(pinnedWeekday('Wednesday', { weeks }))
    expect(offset, 'behind the retention boundary').toBeGreaterThan(-RETENTION_DAYS_MINIMUM)
    expect(offset, 'beyond the booking horizon').toBeLessThan(BOOKING_HORIZON_DAYS)
  }
  const future = daysFromToday(pinnedFutureWeekday('Wednesday'))
  expect(future, 'far-future date must still be bookable').toBeLessThan(BOOKING_HORIZON_DAYS)
  expect(future, 'far-future date must actually be far').toBeGreaterThan(90)
})

test('relationships between dates survive: consecutive days, and one weekday across weeks', () => {
  // Tests that need "three consecutive days" or "the same weekday four weeks running" must move
  // together. Re-deriving each date independently is what would quietly break them.
  const tue = pinnedFutureWeekday('Tuesday')
  const wed = pinnedFutureWeekday('Wednesday')
  const thu = pinnedFutureWeekday('Thursday')
  expect(daysFromToday(wed) - daysFromToday(tue)).toBe(1)
  expect(daysFromToday(thu) - daysFromToday(wed)).toBe(1)

  const weekly = [-2, -1, 0, 1].map((weeks) => daysFromToday(pinnedWeekday('Wednesday', { weeks })))
  expect(weekly[1] - weekly[0]).toBe(7)
  expect(weekly[2] - weekly[1]).toBe(7)
  expect(weekly[3] - weekly[2]).toBe(7)
})
