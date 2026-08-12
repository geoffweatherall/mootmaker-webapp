import { getContrastRatio } from '@mui/material/styles'
import { roomPaletteDark, roomPaletteLight } from './tokens'

// Deterministically assigns each room one of the 8 validated categorical hues (see tokens.ts),
// keyed by the room's position in an already-sorted room list rather than its id, so the same
// room gets the same colour on every visit for as long as the room list's sort order (name,
// alphabetical) doesn't change. Beyond 8 rooms this wraps back to slot 0 - a deliberate departure
// from the dataviz skill's "never cycle a categorical palette" rule, acceptable here because
// colour is a secondary scan aid, not the only way a room is identified: its name is always shown
// as text right next to (or on top of) its colour, in every place this is used.
export function roomColorAt(index: number, mode: 'light' | 'dark'): string {
  const palette = mode === 'dark' ? roomPaletteDark : roomPaletteLight
  return palette[index % palette.length]
}

// Several of the 8 hues (e.g. the light-mode yellow/magenta) are too light for white text, so
// unlike `primary.contrastText` this can't be a fixed choice per mode - it picks whichever of
// white or the theme's own ink colour has the better contrast against this specific swatch, via
// MUI's own getContrastRatio rather than a hand-rolled luminance check.
export function readableTextOn(swatchHex: string, inkHex: string): string {
  return getContrastRatio(swatchHex, '#ffffff') >= getContrastRatio(swatchHex, inkHex) ? '#ffffff' : inkHex
}
