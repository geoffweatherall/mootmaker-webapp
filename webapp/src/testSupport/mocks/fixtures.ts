// Seed data for the MSW-mocked GraphQL API (see handlers.ts) - a small, fixed data set that
// covers every scenario webapp/tests/*.spec.ts needs (room-suggestion ranking/wraparound,
// organiser/attendee exclusivity, a linked-vs-unlinked Person, capacity overflow), rather than
// trying to mirror the sample-data-generator's larger, more realistic data set used against a
// real deployed API.
import { DEMO_USER } from '../../auth/cognito.mock'
import type { Meeting, Person, Room } from '../../graphql/types'

export const rooms: Room[] = [
  { id: 'room-boardroom', name: 'Boardroom', capacity: 4 },
  { id: 'room-focus-pod', name: 'Focus Pod', capacity: 2 },
  { id: 'room-garden-room', name: 'Garden Room', capacity: 5 },
]

export const people: Person[] = [
  { id: 'person-alice', name: 'Alice Anderson' },
  { id: 'person-bob', name: 'Bob Brown' },
  { id: 'person-carol', name: 'Carol Chen' },
  { id: 'person-dana', name: 'Dana Diaz' },
  { id: 'person-demo', name: 'Demo User' },
]

// The only account with a linked Person - see cognito.mock.ts's MOCK_USERS doc comment.
// E2E_USER deliberately has no entry here, matching the real e2e test user's account.
export const linkedPersonByEmail: Record<string, Person> = {
  [DEMO_USER.email]: people[4],
}

// Created meetings, persisted to sessionStorage (not just an in-memory variable) so they survive
// a real browser navigation - e.g. meeting-details.spec.ts creates a meeting, then does a full
// `page.goto` to a Person Calendar page, which reloads every JS module (including this one) from
// scratch. sessionStorage is scoped to one browser context/tab, matching Playwright's per-test
// isolation - each test starts with an empty mock "database" without any explicit reset needed.
const MEETINGS_STORAGE_KEY = 'mootmaker-mock-meetings'

function loadMeetings(): Meeting[] {
  try {
    const raw = sessionStorage.getItem(MEETINGS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Meeting[]) : []
  } catch {
    return []
  }
}

function saveMeetings(value: Meeting[]): void {
  sessionStorage.setItem(MEETINGS_STORAGE_KEY, JSON.stringify(value))
}

// Read once at module load (i.e. once per page load) - every mutation below re-assigns this and
// persists it, so later reads within the same page load (a live binding, per ES module semantics)
// stay in sync without re-reading storage each time.
export let meetings: Meeting[] = loadMeetings()

/** Clears all created meetings. Not called automatically - each test already gets a fresh
 * sessionStorage via Playwright's per-test browser context isolation - but available for a test
 * that deliberately wants to clear mid-test. */
export function resetFixtures(): void {
  meetings = []
  saveMeetings(meetings)
}

function nextMeetingId(): string {
  const maxId = meetings.reduce((max, meeting) => {
    const match = /^meeting-(\d+)$/.exec(meeting.id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `meeting-${maxId + 1}`
}

export function createMeetingFixture(input: Omit<Meeting, 'id'>): Meeting {
  const meeting: Meeting = { id: nextMeetingId(), ...input }
  meetings = [...meetings, meeting]
  saveMeetings(meetings)
  return meeting
}
