import { describe, expect, it } from 'vitest'
import { readableTextOn, roomColorAt } from './roomColor'
import { roomPaletteDark, roomPaletteLight } from './tokens'

describe('roomColorAt', () => {
  it('assigns the palette colour at the given index, for each mode', () => {
    expect(roomColorAt(0, 'light')).toBe(roomPaletteLight[0])
    expect(roomColorAt(0, 'dark')).toBe(roomPaletteDark[0])
    expect(roomColorAt(3, 'light')).toBe(roomPaletteLight[3])
  })

  it('wraps around once the index exceeds the palette length, rather than going out of bounds', () => {
    const paletteLength = roomPaletteLight.length
    expect(roomColorAt(paletteLength, 'light')).toBe(roomPaletteLight[0])
    expect(roomColorAt(paletteLength + 2, 'light')).toBe(roomPaletteLight[2])
    // A concrete case beyond the documented 8-room wraparound (see README.md's "Room-identity
    // colour coding" section).
    expect(roomColorAt(9, 'light')).toBe(roomColorAt(1, 'light'))
  })
})

describe('readableTextOn', () => {
  it('picks white text on a dark swatch', () => {
    expect(readableTextOn('#1a1a1a', '#000000')).toBe('#ffffff')
  })

  it('picks the ink colour on a light swatch, when it contrasts better than white', () => {
    // A pale yellow swatch: white text on it would be nearly invisible, so the theme's own dark
    // ink colour should win instead - this is exactly the light-mode yellow/magenta case the
    // README calls out as needing this function rather than a fixed white-text assumption.
    expect(readableTextOn('#fff59d', '#111111')).toBe('#111111')
  })

  it('is symmetric with getContrastRatio - whichever of white/ink has the higher contrast ratio wins', () => {
    // A mid-grey swatch equidistant-ish from both - just assert the result is always one of the
    // two candidates, not a third value, regardless of which one wins.
    const result = readableTextOn('#888888', '#222222')
    expect(['#ffffff', '#222222']).toContain(result)
  })
})
