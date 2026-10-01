import { describe, expect, it } from 'vitest'
import { keepDaysWhileRefreshing } from './keepDaysWhileRefreshing'

const page = (...dates: string[]) => ({ workspace: { days: dates.map((date) => ({ date, meetings: [date] })) } })

describe('keepDaysWhileRefreshing', () => {
  it('keeps a requested day that vanished while it is being refetched', () => {
    const result = keepDaysWhileRefreshing(page('d1', 'd3'), page('d1', 'd2', 'd3'), true, ['d1', 'd2', 'd3'])
    expect(result?.workspace.days.map((day) => day.date).sort()).toEqual(['d1', 'd2', 'd3'])
  })

  it('returns the data as is once loading has settled', () => {
    const data = page('d1', 'd3')
    expect(keepDaysWhileRefreshing(data, page('d1', 'd2', 'd3'), false, ['d1', 'd2', 'd3'])).toBe(data)
  })

  it('never brings back a day that was not asked for, such as last week after navigating', () => {
    const result = keepDaysWhileRefreshing(page('n1'), page('o1', 'o2'), true, ['n1', 'n2'])
    expect(result?.workspace.days.map((day) => day.date)).toEqual(['n1'])
  })

  it('prefers the fresh copy of a day present in both', () => {
    const fresh = { workspace: { days: [{ date: 'd1', meetings: ['new'] }] } }
    const stale = { workspace: { days: [{ date: 'd1', meetings: ['old'] }] } }
    expect(keepDaysWhileRefreshing(fresh, stale, true, ['d1'])).toBe(fresh)
  })
})
