import { describe, expect, it } from 'vitest'
import { roomColorAt } from './roomColor'
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
