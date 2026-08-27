// MSW request handlers for the mocked GraphQL API - see browser.ts for how these are wired up,
// and testing-strategy.md's "Integration tests against a mocked API" section for why MSW (network
// interception) was chosen over replacing Apollo Client's internals: the app's real HttpLink and
// JWT-attaching SetContextLink (see apolloClient.ts) both still run against these responses.
//
// There is exactly one route (Apollo posts every query/mutation to the same GraphQL endpoint) -
// operations are dispatched by `operationName`, matching the names the `gql` tags in
// graphql/queries.ts and graphql/mutations.ts declare (e.g. `query ListRooms { ... }`).
import { http, HttpResponse, type HttpHandler } from 'msw'
import type { CreateMeetingResult, Meeting, MeetingError, MeetingsFilter, Room } from '../../graphql/types'
import { createMeetingFixture, linkedPersonByEmail, meetings, people, rooms } from './fixtures'

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

function meetingMatchesFilter(meeting: Meeting, filter: MeetingsFilter | undefined): boolean {
  if (!filter) return true
  if (filter.fromStartTime && meeting.startTime < filter.fromStartTime) return false
  if (filter.toEndTime && meeting.startTime >= filter.toEndTime) return false
  if (filter.personId) {
    const isOrganiser = meeting.organiser.id === filter.personId
    const isAttendee = meeting.attendees.some((attendee) => attendee.id === filter.personId)
    if (!isOrganiser && !isAttendee) return false
  }
  return true
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
// tests instead (see mootmaker/testing-strategy.md's layering table).
function validateMeetingInput(input: MeetingInput): MeetingError[] {
  const errors: MeetingError[] = []

  if (!input.subject.trim()) errors.push('SubjectRequired')
  if (!input.roomId) errors.push('RoomRequired')
  else if (!rooms.some((room) => room.id === input.roomId)) errors.push('RoomNotFound')
  if (!input.organiserId) errors.push('OrganiserRequired')
  else if (!people.some((person) => person.id === input.organiserId)) errors.push('OrganiserNotFound')
  if (input.organiserId && input.attendeeIds.includes(input.organiserId)) errors.push('OrganiserIsAttendee')
  if (input.attendeeIds.some((id) => !people.some((person) => person.id === id))) errors.push('AttendeeNotFound')
  if (!isFifteenMinuteAligned(input.startTime)) errors.push('StartMissaligned')
  if (!isFifteenMinuteAligned(input.endTime)) errors.push('EndMissaligned')
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

export const handlers: HttpHandler[] = [
  http.post(GRAPHQL_ENDPOINT, async ({ request }) => {
    const body = (await request.json()) as GraphQLRequestBody
    const variables = body.variables ?? {}

    switch (body.operationName) {
      case 'ListRooms':
        return HttpResponse.json({ data: { rooms } })

      case 'ListPeople':
        return HttpResponse.json({ data: { people } })

      case 'MyPerson': {
        if (window.__mockControls?.myPersonGate) {
          await window.__mockControls.myPersonGate
        }
        const email = emailFromAuthHeader(request)
        const person = (email && linkedPersonByEmail[email]) ?? null
        return HttpResponse.json({ data: { myPerson: person } })
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
        return HttpResponse.json({ data: { suggestRoom: suggestions } })
      }

      case 'ListMeetings': {
        const filter = variables.filter as MeetingsFilter | undefined
        const matching = meetings.filter((meeting) => meetingMatchesFilter(meeting, filter))
        return HttpResponse.json({ data: { meetings: matching } })
      }

      case 'CreateMeeting': {
        const input = variables.meeting as MeetingInput
        const errors = validateMeetingInput(input)
        if (errors.length > 0) {
          const result: CreateMeetingResult = { meeting: null, errors }
          return HttpResponse.json({ data: { createMeeting: result } })
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
        const result: CreateMeetingResult = { meeting, errors: [] }
        return HttpResponse.json({ data: { createMeeting: result } })
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
