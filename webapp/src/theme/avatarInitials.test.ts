import { describe, expect, it } from 'vitest'
import { initialsFor } from './avatarInitials'

describe('initialsFor', () => {
  it('takes the first letter of the first and last word for a multi-word name', () => {
    expect(initialsFor('Priya Chaudhary')).toBe('PC')
  })

  it('drops a middle name, using only the first and last word', () => {
    expect(initialsFor('Priya Kumar Chaudhary')).toBe('PC')
  })

  it('falls back to a single letter for a one-word name, rather than crashing or showing undefined', () => {
    // Real, reachable data: Settings' Add Person form takes free text, so a person entered with
    // just one name is not hypothetical.
    expect(initialsFor('Madonna')).toBe('M')
  })

  it('uppercases regardless of input case', () => {
    expect(initialsFor('priya chaudhary')).toBe('PC')
  })

  it('ignores leading, trailing, and repeated whitespace', () => {
    expect(initialsFor('  priya   chaudhary  ')).toBe('PC')
  })

  it('returns an empty string for an empty or whitespace-only name, rather than throwing', () => {
    expect(initialsFor('')).toBe('')
    expect(initialsFor('   ')).toBe('')
  })
})
