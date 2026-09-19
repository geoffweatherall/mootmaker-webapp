// MSW request handlers for the mocked GraphQL API - see browser.ts for how these are wired up,
// and testing-strategy.md's "Integration tests against a mocked API" section for why MSW (network
// interception) was chosen over replacing Apollo Client's internals: the app's real HttpLink and
// JWT-attaching SetContextLink (see apolloClient.ts) both still run against these responses.
//
// There is exactly one route (Apollo posts every query/mutation to the same GraphQL endpoint) -
// operations are dispatched by `operationName`, matching the names the `gql` tags in
// graphql/queries.ts and graphql/mutations.ts declare (e.g. `query ListRooms { ... }`).
import { http, HttpResponse, type HttpHandler } from 'msw'
import type {
  CreateMeetingResult,
  DateFormat,
  MeetingDetails,
  MeetingError,
  MyPerson,
  Person,
  Room,
  TimeFormat,
  UpdateMyPreferencesResult,
} from '../../graphql/types'
import { createMeetingFixture, linkedPersonByEmail, meetings, people, rooms } from './fixtures'

/**
 * Apollo's `InMemoryCache` normalises an entity only when its response carries `__typename` -
 * which every real resolver does, since Apollo Client adds `__typename` to every outgoing
 * selection set automatically and the server just resolves what was asked for. A hand-written
 * fixture has to add it back deliberately, or the mocked suite silently stops exercising
 * normalisation at all (see mootmaker-webapp#66) while still looking green - the app would ask
 * for `days`/`rooms`/`people` and get an answer, just never through the same cache-identity path
 * a real response takes.
 */
function asRoom(room: Room) {
  return { __typename: 'Room' as const, ...room }
}

// Generic (rather than a fixed `Person | MyPerson` parameter) so the return type narrows to
// whichever one was actually passed in - a fixed union parameter would make every call site's
// result the full union, which is what broke `UpdateMyPreferencesResult.person` below (typed as
// exactly `MyPerson`, not `Person | MyPerson`).
function asPerson<T extends Person | MyPerson>(person: T) {
  return { __typename: 'Person' as const, ...person }
}

/** The full shape `meeting(id:)` selects - names resolved, not just ids. */
function asMeetingDetails(meeting: MeetingDetails) {
  return {
    __typename: 'Meeting' as const,
    id: meeting.id,
    subject: meeting.subject,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    room: asRoom(meeting.room),
    organiser: asPerson(meeting.organiser),
    attendees: meeting.attendees.map(asPerson),
  }
}

/** The narrow, ids-only shape every day-embedded meeting selects - see daysFor below. */
function asMeetingSummary(meeting: MeetingDetails) {
  return {
    __typename: 'Meeting' as const,
    id: meeting.id,
    subject: meeting.subject,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    room: { __typename: 'Room' as const, id: meeting.room.id },
    organiser: { __typename: 'Person' as const, id: meeting.organiser.id },
    attendees: meeting.attendees.map((attendee) => ({ __typename: 'Person' as const, id: attendee.id })),
  }
}

const GRAPHQL_ENDPOINT = '/graphql'

interface GraphQLRequestBody {
  operationName?: string
  query?: string
  variables?: Record<string, unknown>
}

// calendar-menu.spec.ts needs to observe the UI while the `myPerson` query is still resolving -
// deterministically, not by racing the real (near-instant, mocked) network. It arms this gate via
// `page.addInitScript` before navigating (so it's in place before AuthProvider's first render
// fires the query) and releases it via `page.evaluate` once it's done asserting the "still
// loading" state - see that spec file for the full mechanism. Every other test leaves this
// undefined, in which case the MyPerson handler below resolves immediately.
declare global {
  interface Window {
    __mockControls?: {
      myPersonGate?: Promise<void>
      // Held open by layout-stability.spec.ts to observe the window where Rooms has not yet
      // arrived but People has - see AdminSections in SettingsPage.tsx.
      listRoomsGate?: Promise<void>
    }
  }
}

function emailFromAuthHeader(request: Request): string | null {
  const header = request.headers.get('Authorization')
  const prefix = 'mock-id-token.'
  return header?.startsWith(prefix) ? header.slice(prefix.length) : null
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd
}


function isFifteenMinuteAligned(isoLocalDateTime: string): boolean {
  const minute = Number(isoLocalDateTime.slice(14, 16))
  return minute % 15 === 0
}

interface MeetingInput {
  subject: string
  roomId: string
  organiserId: string
  attendeeIds: string[]
  startTime: string
  endTime: string
}

// Mirrors the subset of mootmaker-api's createMeeting validation rules (see the API README's
// "Rules" section) that webapp/tests/*.spec.ts actually exercises - not a full reimplementation
// of the server's own acceptance-tested rule set, which stays covered by mootmaker-api's own
// tests instead (see mootmaker/docs/reference/testing-strategy.md's layering table).
function validateMeetingInput(input: MeetingInput): MeetingError[] {
  const errors: MeetingError[] = []

  if (!input.subject.trim()) errors.push('SubjectRequired')
  if (!input.roomId) errors.push('RoomRequired')
  else if (!rooms.some((room) => room.id === input.roomId)) errors.push('RoomNotFound')
  if (!input.organiserId) errors.push('OrganiserRequired')
  else if (!people.some((person) => person.id === input.organiserId)) errors.push('OrganiserNotFound')
  if (input.organiserId && input.attendeeIds.includes(input.organiserId)) errors.push('OrganiserIsAttendee')
  if (input.attendeeIds.some((id) => !people.some((person) => person.id === id))) errors.push('AttendeeNotFound')
  if (!isFifteenMinuteAligned(input.startTime)) errors.push('StartMisaligned')
  if (!isFifteenMinuteAligned(input.endTime)) errors.push('EndMisaligned')
  if (input.startTime.slice(0, 10) !== input.endTime.slice(0, 10)) errors.push('SpansMultipleDays')
  else if (input.endTime <= input.startTime) errors.push('EndBeforeStart')

  const room = rooms.find((candidate) => candidate.id === input.roomId)
  if (room) {
    if (room.capacity < input.attendeeIds.length + 1) errors.push('InsufficientCapacity')
    const clashes = meetings.some(
      (existing) =>
        existing.room.id === input.roomId &&
        overlaps(input.startTime, input.endTime, existing.startTime, existing.endTime),
    )
    if (clashes) errors.push('TimeRangeUnavailable')
  }

  return errors
}


/**
 * The bookable window the real API publishes. Wide enough that no fixture date falls outside it -
 * only tests about the window itself should have to think about it.
 */
const BOUNDARIES = {
  __typename: 'Boundaries' as const,
  earliestRetainedDate: '2000-01-01',
  latestBookableDate: '2099-12-31',
}

/** The signed-in viewer, resolved the way the real API does: from the caller, not from an argument. */
function viewerOf(request: Request) {
  const email = emailFromAuthHeader(request)
  return (email && linkedPersonByEmail[email]) ?? null
}

/**
 * Days for exactly the dates asked for, in that order, including dates holding nothing.
 *
 * Never sparse, matching the real resolver - an empty day means empty, not unfetched, and the
 * client's cache depends on being able to tell those apart. Meetings carry ids only for room,
 * organiser and attendees, again matching the server: names are resolved by the page from the
 * rooms and people it already holds.
 */
function daysFor(dates: string[]) {
  return dates.map((date) => ({
    __typename: 'Day' as const,
    date,
    meetings: meetings.filter((meeting) => meeting.startTime.startsWith(date)).map(asMeetingSummary),
  }))
}

export const handlers: HttpHandler[] = [
  http.post(GRAPHQL_ENDPOINT, async ({ request }) => {
    const body = (await request.json()) as GraphQLRequestBody
    const variables = body.variables ?? {}

    switch (body.operationName) {
      // One entry point now serves what four operations used to. The mock answers only what each
      // query selected, the way the real resolver does - a query that omits `dates` gets no days.
      case 'Session': {
        if (window.__mockControls?.myPersonGate) {
          await window.__mockControls.myPersonGate
        }
        const viewer = viewerOf(request)
        return HttpResponse.json({
          data: { workspace: { __typename: 'Workspace', me: viewer && asPerson(viewer) } },
        })
      }

      case 'ReferenceData':
        if (window.__mockControls?.listRoomsGate) {
          await window.__mockControls.listRoomsGate
        }
        return HttpResponse.json({
          data: { workspace: { __typename: 'Workspace', rooms: rooms.map(asRoom), people: people.map(asPerson) } },
        })

      case 'PageLoad': {
        if (window.__mockControls?.listRoomsGate) {
          await window.__mockControls.listRoomsGate
        }
        if (window.__mockControls?.myPersonGate) {
          await window.__mockControls.myPersonGate
        }
        const viewer = viewerOf(request)
        return HttpResponse.json({
          data: {
            workspace: {
              __typename: 'Workspace',
              me: viewer && asPerson(viewer),
              rooms: rooms.map(asRoom),
              people: people.map(asPerson),
              boundaries: BOUNDARIES,
              days: daysFor((variables.dates as string[] | undefined) ?? []),
            },
          },
        })
      }

      case 'Days':
        return HttpResponse.json({
          data: {
            workspace: { __typename: 'Workspace', days: daysFor((variables.dates as string[] | undefined) ?? []) },
          },
        })

      case 'MeetingById': {
        const found = meetings.find((candidate) => candidate.id === variables.id) ?? null
        return HttpResponse.json({ data: { meeting: found && asMeetingDetails(found) } })
      }

      case 'SuggestRoom': {
        const { startTime, endTime, requiredCapacity } = variables as {
          startTime: string
          endTime: string
          requiredCapacity: number
        }
        // Ranked smallest surplus capacity first (equivalent to smallest capacity first, since
        // every candidate already meets requiredCapacity), ties broken by name - see README.md's
        // "Room" bullet under Add Meeting.
        const suggestions: Room[] = rooms
          .filter((room) => room.capacity >= requiredCapacity)
          .filter(
            (room) =>
              !meetings.some(
                (meeting) => meeting.room.id === room.id && overlaps(startTime, endTime, meeting.startTime, meeting.endTime),
              ),
          )
          .sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name))
        return HttpResponse.json({ data: { suggestRoom: suggestions.map(asRoom) } })
      }

      case 'CreateMeeting': {
        const input = variables.meeting as MeetingInput
        const errors = validateMeetingInput(input)
        if (errors.length > 0) {
          const result: CreateMeetingResult = { meeting: null, day: null, errors }
          return HttpResponse.json({ data: { createMeeting: { __typename: 'CreateMeetingResult', ...result } } })
        }
        const room = rooms.find((candidate) => candidate.id === input.roomId)!
        const organiser = people.find((person) => person.id === input.organiserId)!
        const attendees = people.filter((person) => input.attendeeIds.includes(person.id))
        const meeting = createMeetingFixture({
          subject: input.subject,
          room,
          organiser,
          attendees,
          startTime: input.startTime,
          endTime: input.endTime,
        })
        // Returns the whole affected day as well, which is what removes the client's cache-update
        // code: Day is keyed by date, so writing it replaces that day's meetings outright.
        const result: CreateMeetingResult = {
          meeting: asMeetingDetails(meeting),
          day: daysFor([meeting.startTime.slice(0, 10)])[0],
          errors: [],
        }
        return HttpResponse.json({ data: { createMeeting: { __typename: 'CreateMeetingResult', ...result } } })
      }

      case 'UpdateMyPreferences': {
        const { preferences } = variables as {
          preferences: { dateFormat: DateFormat; timeFormat: TimeFormat }
        }
        const email = emailFromAuthHeader(request)
        const person = (email && linkedPersonByEmail[email]) ?? null
        if (!person) {
          const result: UpdateMyPreferencesResult = { person: null, errors: ['NoLinkedPerson'] }
          return HttpResponse.json({ data: { updateMyPreferences: { __typename: 'UpdateMyPreferencesResult', ...result } } })
        }
        // Mutates the fixture in place so a later MyPerson query reflects it, the way the real
        // API's stored record would - the Settings section reads its saved value back via
        // refreshPerson() immediately after saving.
        person.dateFormat = preferences.dateFormat
        person.timeFormat = preferences.timeFormat
        const result: UpdateMyPreferencesResult = { person: asPerson(person), errors: [] }
        return HttpResponse.json({ data: { updateMyPreferences: { __typename: 'UpdateMyPreferencesResult', ...result } } })
      }

      default:
        // Settings-page mutations (createRoom/updateRoom/createPerson/updatePerson) aren't
        // handled above - no test in webapp/tests/ exercises SettingsPage yet (see README.md's
        // Tests section). Extend this file rather than letting a future settings test hang here.
        return HttpResponse.json(
          {
            errors: [
              {
                message: `mootmaker-webapp's MSW mock (src/testSupport/mocks/handlers.ts) has no handler for GraphQL operation "${body.operationName}"`,
              },
            ],
          },
          { status: 200 },
        )
    }
  }),
]
