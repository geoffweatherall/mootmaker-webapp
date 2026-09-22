import type { Dayjs } from 'dayjs'
import type { Meeting, Person, Room } from '../graphql/types'

const DATE_KEY_FORMAT = 'YYYY-MM-DD'

/** The initial agenda/needs-response window (today + the next two days), matching PAGE_LOAD's own
 * fixed `dates` argument. "Search further ahead" extends past this in fixed-size steps. */
export const INITIAL_WINDOW_DAYS = 3
export const SEARCH_STEP_DAYS = 3

/**
 * The offset (in days from today) of the last day covered once `level` "Search further ahead"
 * clicks have been made - level 0 is just the initial window. Matches the prototype's own
 * `2 + level * 3` (https://claude.ai/artifact/9PWBGRbGKZBU1CTAcZLP54's Main.dc.html).
 */
export function windowEndOffset(level: number): number {
  return INITIAL_WINDOW_DAYS - 1 + level * SEARCH_STEP_DAYS
}

/**
 * The dates a click from `level` to `level + 1` newly covers - never a date already covered at
 * `level`, since those were fetched by an earlier click (or the initial PAGE_LOAD) already.
 */
export function nextSearchDates(level: number, today: Dayjs): string[] {
  const fromOffset = windowEndOffset(level) + 1
  const toOffset = windowEndOffset(level + 1)
  const dates: string[] = []
  for (let offset = fromOffset; offset <= toOffset; offset++) {
    dates.push(today.add(offset, 'day').format(DATE_KEY_FORMAT))
  }
  return dates
}

/** "Tue 22 Sep – Thu 24 Sep" for the window `level` searches have reached - always names both
 * ends, so the empty-state copy never repeats the "caught up" claim without saying for when. */
export function formatRangeLabel(today: Dayjs, level: number): string {
  const end = today.add(windowEndOffset(level), 'day')
  return `${today.format('ddd D MMM')} – ${end.format('ddd D MMM')}`
}

export type NeedsResponseSource = 'initial' | 'extra'

export interface NeedsResponseEntry {
  meeting: Meeting
  organiserName: string
  roomName: string
  /** Drives the card's border colour (amber vs. indigo) - purely so a widened search's finds are
   * visually legible as such, not a behavioural difference. */
  source: NeedsResponseSource
}

interface DayLike {
  date: string
  meetings: Meeting[]
}

/**
 * Every meeting in `day` where `personId` is an attendee (never the organiser, who is implicitly
 * Going) and hasn't responded yet - the same rule HomePage has always applied, extracted so both
 * the initial PAGE_LOAD window and each "Search further ahead" DAYS fetch can share it.
 */
export function needsResponseEntriesForDay(
  day: DayLike,
  personId: string,
  peopleById: Map<string, Person>,
  roomsById: Map<string, Room>,
  source: NeedsResponseSource,
): NeedsResponseEntry[] {
  const entries: NeedsResponseEntry[] = []
  for (const meeting of day.meetings) {
    if (meeting.organiser.id === personId) continue
    const mine = meeting.attendees.find((attendee) => attendee.person.id === personId)
    if (mine?.status !== 'NoResponse') continue
    entries.push({
      meeting,
      organiserName: peopleById.get(meeting.organiser.id)?.name ?? '',
      roomName: roomsById.get(meeting.room.id)?.name ?? '',
      source,
    })
  }
  return entries
}

/**
 * Merges one newly-fetched batch into the accumulated list: no duplicates (by meeting id - a
 * meeting can only appear once, whichever batch found it first), re-sorted soonest-first. A batch
 * that finds nothing new is a no-op beyond the sort. Works whether `existing` started empty or
 * not - there is no separate code path for "the list was previously empty".
 */
export function mergeNeedsResponseEntries(
  existing: NeedsResponseEntry[],
  found: NeedsResponseEntry[],
): NeedsResponseEntry[] {
  const existingIds = new Set(existing.map((entry) => entry.meeting.id))
  const merged = [...existing, ...found.filter((entry) => !existingIds.has(entry.meeting.id))]
  return merged.sort((a, b) => a.meeting.startTime.localeCompare(b.meeting.startTime))
}
