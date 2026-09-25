import type { RoomColor } from '../graphql/types'
import { roomPaletteDark, roomPaletteLight } from './tokens'

// Deterministically assigns each room one of the 8 validated categorical hues (see tokens.ts),
// keyed by the room's position in an already-sorted room list rather than its id, so the same
// room gets the same colour on every visit for as long as the room list's sort order (name,
// alphabetical) doesn't change. Beyond 8 rooms this wraps back to slot 0 - a deliberate departure
// from the dataviz skill's "never cycle a categorical palette" rule, acceptable here because
// colour is a secondary scan aid, not the only way a room is identified: its name is always shown
// as text right next to its colour, in every place this is used.
export function roomColorAt(index: number, mode: 'light' | 'dark'): string {
  const palette = mode === 'dark' ? roomPaletteDark : roomPaletteLight
  return palette[index % palette.length]
}

/**
 * `RoomColor` enum values, in the exact order `roomPaletteLight`/`roomPaletteDark` (see tokens.ts)
 * and the Java `RoomColor` enum both use - so an admin's explicit choice resolves through the same
 * two mode-aware palettes {@link roomColorAt}'s auto-assignment already does, rather than needing
 * its own separate colour definitions.
 */
export const ROOM_COLOR_SLOTS: RoomColor[] = [
  'Blue',
  'Orange',
  'Aqua',
  'Yellow',
  'Magenta',
  'Green',
  'Violet',
  'Red',
]

/**
 * A room's actual rendered colour: its own explicit choice when it has one, falling back to the
 * same deterministic by-position assignment every room used before {@code Room.color} existed.
 */
export function roomColorFor(
  room: { color: RoomColor | null },
  index: number,
  mode: 'light' | 'dark',
): string {
  if (room.color) {
    return roomColorAt(ROOM_COLOR_SLOTS.indexOf(room.color), mode)
  }
  return roomColorAt(index, mode)
}
