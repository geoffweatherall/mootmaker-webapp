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
  AttendeeStatus,
  CancelMeetingResult,
  CreateMeetingResult,
  DateFormat,
  MeetingDetails,
  MeetingError,
  RespondToMeetingResult,
  Room,
  TimeFormat,
  UpdateMeetingResult,
  UpdateMyPreferencesResult,
} from '../../graphql/types'
import {
  cancelMeetingFixture,
  createMeetingFixture,
  linkedPersonByEmail,
  meetings,
  people,
  rooms,
  saveMeetings,
  updateMeetingFixture,
} from './fixtures'

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

// Generic, bound only to the id+name every caller actually has (rather than a fixed
// `Person | MyPerson` parameter), so the return type narrows to whichever shape was actually
// passed in - a fixed union parameter would make every call site's result the full union, which is
// what broke `UpdateMyPreferencesResult.person` below (typed as exactly `MyPerson`, not
// `Person | MyPerson`). The bound has to stay this loose because MeetingDetails' organiser/attendee
// person (asMeetingDetails below) selects only id+name, neither the full Person nor MyPerson shape.
function asPerson<T extends { id: string; name: string }>(person: T) {
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
    attendees: meeting.attendees.map((attendee) => ({
      __typename: 'Attendee' as const,
      person: asPerson(attendee.person),
      status: attendee.status,
    })),
  }
}

/** The narrow, ids-only shape every day-embedded meeting selects - see daysFor below. Status is
 * not an id lookup, so it's carried in full even here, matching the real API's MeetingResponse. */
function asMeetingSummary(meeting: MeetingDetails) {
  return {
    __typename: 'Meeting' as const,
    id: meeting.id,
    subject: meeting.subject,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    room: { __typename: 'Room' as const, id: meeting.room.id },
    organiser: { __typename: 'Person' as const, id: meeting.organiser.id },
    attendees: meeting.attendees.map((attendee) => ({
      __typename: 'Attendee' as const,
      person: { __typename: 'Person' as const, id: attendee.person.id },
      status: attendee.status,
    })),
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
      // Held open by a test wanting to observe RoomsPage/PersonsPage's own loading state before
      // their single REFERENCE_DATA query resolves.
      listRoomsGate?: Promise<void>
      // When true, the next SetPersonAdmin response (only) reports cognitoSyncFailed: true despite
      // a successful write, then clears itself - so a test can drive the retry/cancel prompt
      // deterministically without a real Cognito failure. See persons-page.spec.ts.
      cognitoSyncFailsOnce?: boolean
      // Checked in src/auth/cognito.mock.ts's currentUserClaims, not here - this call never goes
      // through MSW, so it isn't one of this file's own handlers. Declared here anyway so there is
      // one place naming every gate this test suite has. Held open by layout-stability.spec.ts to
      // observe the window where whether there's even a session at all hasn't resolved yet -
      // mootmaker-webapp#111.
      sessionGate?: Promise<void>
      // Wired up in browser.ts, not checked by any handler here - lets a test seed a meeting on an
      // arbitrary date directly via page.evaluate (see tests/support/mockControls.ts's
      // seedMeeting), for a "Search further ahead" test that needs a meeting several days beyond
      // what driving the real Add Meeting form would conveniently reach.
      seedMeeting?: typeof createMeetingFixture
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

interface RoomInput {
  name: string
  capacity: number
}

function nextId(prefix: string, existing: { id: string }[]): string {
  const maxSuffix = existing.reduce((max, item) => {
    const match = /-(\d+)$/.exec(item.id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `${prefix}-${maxSuffix + 1}`
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
// excludingMeetingId is only ever passed from UpdateMeeting - it excludes that one meeting's own
// prior slot from the clash check below, mirroring mootmaker-api's RoomAvailability.isFreeIgnoring
// (see MeetingValidator), so editing a meeting's time within its own room - even to a range that
// overlaps its own prior slot - doesn't spuriously reject as a self-conflict. undefined for
// CreateMeeting, where there is no self to exclude.
function validateMeetingInput(input: MeetingInput, excludingMeetingId?: string): MeetingError[] {
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
        existing.id !== excludingMeetingId &&
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
        const { startTime, endTime, requiredCapacity, excludingMeetingId } = variables as {
          startTime: string
          endTime: string
          requiredCapacity: number
          excludingMeetingId?: string
        }
        // Ranked smallest surplus capacity first (equivalent to smallest capacity first, since
        // every candidate already meets requiredCapacity), ties broken by name - see README.md's
        // "Room" bullet under Add Meeting. excludingMeetingId (only ever sent while editing)
        // excludes that one meeting's own prior slot, mirroring validateMeetingInput's own
        // exclusion above and the real API's SuggestRoomHandler.
        const suggestions: Room[] = rooms
          .filter((room) => room.capacity >= requiredCapacity)
          .filter(
            (room) =>
              !meetings.some(
                (meeting) =>
                  meeting.id !== excludingMeetingId &&
                  meeting.room.id === room.id &&
                  overlaps(startTime, endTime, meeting.startTime, meeting.endTime),
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
        // Every attendee starts NoResponse, same as the real API's createMeeting default - the
        // webapp never sends MeetingInput.attendeeStatuses (that override exists only for
        // mootmaker-demo-data, see mootmaker-api's own doc comment on it), so the mock doesn't
        // need to honour one either.
        const attendees = people
          .filter((person) => input.attendeeIds.includes(person.id))
          .map((person) => ({ person, status: 'NoResponse' as AttendeeStatus }))
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

      case 'UpdateMeeting': {
        const id = variables.id as string
        const input = variables.meeting as MeetingInput
        const existing = meetings.find((candidate) => candidate.id === id)
        if (!existing) {
          const result: UpdateMeetingResult = { meeting: null, day: null, errors: ['MeetingNotFound'] }
          return HttpResponse.json({ data: { updateMeeting: { __typename: 'UpdateMeetingResult', ...result } } })
        }
        const errors = validateMeetingInput(input, id)
        if (errors.length > 0) {
          const result: UpdateMeetingResult = { meeting: null, day: null, errors }
          return HttpResponse.json({ data: { updateMeeting: { __typename: 'UpdateMeetingResult', ...result } } })
        }
        const room = rooms.find((candidate) => candidate.id === input.roomId)!
        const organiser = people.find((person) => person.id === input.organiserId)!
        // A continuing attendee keeps their existing response; only a newly added one starts at
        // NoResponse - mirrors mootmaker-api's own preservedAttendeeStatuses fix in
        // UpdateMeetingHandler (see designs/edit-and-cancel-meetings.md), since the webapp never
        // sends MeetingInput.attendeeStatuses here either.
        const previousStatusByPersonId = new Map(
          existing.attendees.map((attendee) => [attendee.person.id, attendee.status]),
        )
        const attendees = people
          .filter((person) => input.attendeeIds.includes(person.id))
          .map((person) => ({
            person,
            status: previousStatusByPersonId.get(person.id) ?? ('NoResponse' as AttendeeStatus),
          }))
        const updated = updateMeetingFixture(id, {
          subject: input.subject,
          room,
          organiser,
          attendees,
          startTime: input.startTime,
          endTime: input.endTime,
        })!
        // Selects the day for the NEW startTime - a same-day edit and a cross-day move both just
        // work here, since daysFor derives a date's meetings from the current (already-updated)
        // fixture array rather than any separate pointer concept the real API needs.
        const result: UpdateMeetingResult = {
          meeting: asMeetingDetails(updated),
          day: daysFor([updated.startTime.slice(0, 10)])[0],
          errors: [],
        }
        return HttpResponse.json({ data: { updateMeeting: { __typename: 'UpdateMeetingResult', ...result } } })
      }

      case 'CancelMeeting': {
        const id = variables.id as string
        const existing = meetings.find((candidate) => candidate.id === id)
        if (!existing) {
          const result: CancelMeetingResult = { day: null, errors: ['MeetingNotFound'] }
          return HttpResponse.json({ data: { cancelMeeting: { __typename: 'CancelMeetingResult', ...result } } })
        }
        const date = existing.startTime.slice(0, 10)
        cancelMeetingFixture(id)
        // A hard delete, matching the real API - daysFor recomputes from the fixture array, which
        // no longer includes this meeting, so the returned day is simply the day without it.
        const result: CancelMeetingResult = { day: daysFor([date])[0], errors: [] }
        return HttpResponse.json({ data: { cancelMeeting: { __typename: 'CancelMeetingResult', ...result } } })
      }

      case 'RespondToMeeting': {
        const { meetingId, status } = variables as { meetingId: string; status: AttendeeStatus }
        const email = emailFromAuthHeader(request)
        const caller = (email && linkedPersonByEmail[email]) ?? null
        if (!caller) {
          const result: RespondToMeetingResult = { meeting: null, errors: ['NoLinkedPerson'] }
          return HttpResponse.json({ data: { respondToMeeting: { __typename: 'RespondToMeetingResult', ...result } } })
        }
        const meeting = meetings.find((candidate) => candidate.id === meetingId)
        if (!meeting) {
          const result: RespondToMeetingResult = { meeting: null, errors: ['MeetingNotFound'] }
          return HttpResponse.json({ data: { respondToMeeting: { __typename: 'RespondToMeetingResult', ...result } } })
        }
        const attendee = meeting.attendees.find((candidate) => candidate.person.id === caller.id)
        if (!attendee) {
          const result: RespondToMeetingResult = { meeting: null, errors: ['NotAnAttendee'] }
          return HttpResponse.json({ data: { respondToMeeting: { __typename: 'RespondToMeetingResult', ...result } } })
        }
        // Mutates the fixture in place, same as UpdateMyPreferences below, so a later read (a
        // fresh Days/PageLoad fetch, or this same meeting reopened) reflects it.
        attendee.status = status
        saveMeetings(meetings)
        const result: RespondToMeetingResult = { meeting: asMeetingDetails(meeting), errors: [] }
        return HttpResponse.json({ data: { respondToMeeting: { __typename: 'RespondToMeetingResult', ...result } } })
      }

      case 'CreateRoom': {
        const input = variables.room as RoomInput
        if (!input.name.trim()) {
          return HttpResponse.json({
            data: { createRoom: { __typename: 'CreateRoomResult', room: null, rooms: rooms.map(asRoom), errors: ['NameRequired'] } },
          })
        }
        const room = { id: nextId('room', rooms), name: input.name, capacity: input.capacity }
        rooms.push(room)
        return HttpResponse.json({
          data: { createRoom: { __typename: 'CreateRoomResult', room: asRoom(room), rooms: rooms.map(asRoom), errors: [] } },
        })
      }

      case 'UpdateRoom': {
        const id = variables.id as string
        const input = variables.room as RoomInput
        const room = rooms.find((candidate) => candidate.id === id)
        if (!room) {
          return HttpResponse.json({
            data: { updateRoom: { __typename: 'UpdateRoomResult', room: null, rooms: rooms.map(asRoom), errors: ['RoomNotFound'] } },
          })
        }
        if (!input.name.trim()) {
          return HttpResponse.json({
            data: { updateRoom: { __typename: 'UpdateRoomResult', room: null, rooms: rooms.map(asRoom), errors: ['NameRequired'] } },
          })
        }
        room.name = input.name
        room.capacity = input.capacity
        return HttpResponse.json({
          data: { updateRoom: { __typename: 'UpdateRoomResult', room: asRoom(room), rooms: rooms.map(asRoom), errors: [] } },
        })
      }

      case 'DeleteRoom': {
        const id = variables.id as string
        const index = rooms.findIndex((candidate) => candidate.id === id)
        if (index === -1) {
          return HttpResponse.json({
            data: { deleteRoom: { __typename: 'DeleteRoomResult', rooms: rooms.map(asRoom), errors: ['RoomNotFound'] } },
          })
        }
        rooms.splice(index, 1)
        return HttpResponse.json({
          data: { deleteRoom: { __typename: 'DeleteRoomResult', rooms: rooms.map(asRoom), errors: [] } },
        })
      }

      case 'CreatePerson': {
        const name = variables.name as string
        if (!name.trim()) {
          return HttpResponse.json({
            data: {
              createPerson: { __typename: 'CreatePersonResult', person: null, people: people.map(asPerson), errors: ['NameRequired'] },
            },
          })
        }
        const person = { id: nextId('person', people), name, isAdmin: false, linkedEmails: [] as string[] }
        people.push(person)
        return HttpResponse.json({
          data: {
            createPerson: { __typename: 'CreatePersonResult', person: asPerson(person), people: people.map(asPerson), errors: [] },
          },
        })
      }

      case 'UpdateMyName': {
        const name = variables.name as string
        const email = emailFromAuthHeader(request)
        const viewerPerson = (email && linkedPersonByEmail[email]) ?? null
        if (!viewerPerson) {
          return HttpResponse.json({
            data: { updateMyName: { __typename: 'UpdateMyNameResult', person: null, errors: ['NoLinkedPerson'] } },
          })
        }
        viewerPerson.name = name
        const fixturePerson = people.find((candidate) => candidate.id === viewerPerson.id)
        if (fixturePerson) fixturePerson.name = name
        return HttpResponse.json({
          data: { updateMyName: { __typename: 'UpdateMyNameResult', person: asPerson(viewerPerson), errors: [] } },
        })
      }

      // Combined document, matching EDIT_PERSON's own doc comment (mutations.ts): renamePerson
      // runs first, setPersonAdmin second - its people/person snapshot is what the test-facing
      // response returns, the same order the real API executes root mutation fields in.
      case 'EditPerson': {
        const id = variables.id as string
        const name = variables.name as string
        const isAdmin = variables.isAdmin as boolean
        const person = people.find((candidate) => candidate.id === id)
        if (!person) {
          return HttpResponse.json({
            data: {
              renamePerson: { __typename: 'RenamePersonResult', errors: ['PersonNotFound'] },
              setPersonAdmin: {
                __typename: 'SetPersonAdminResult',
                people: people.map(asPerson),
                person: null,
                cognitoSyncFailed: false,
                errors: ['PersonNotFound'],
              },
            },
          })
        }
        if (!name.trim()) {
          return HttpResponse.json({
            data: {
              renamePerson: { __typename: 'RenamePersonResult', errors: ['NameRequired'] },
              setPersonAdmin: {
                __typename: 'SetPersonAdminResult',
                people: people.map(asPerson),
                person: asPerson(person),
                cognitoSyncFailed: false,
                errors: [],
              },
            },
          })
        }
        const viewerEmail = emailFromAuthHeader(request)
        const viewer = viewerEmail ? linkedPersonByEmail[viewerEmail] : null
        if (!isAdmin && viewer?.id === id) {
          return HttpResponse.json({
            data: {
              renamePerson: { __typename: 'RenamePersonResult', errors: [] },
              setPersonAdmin: {
                __typename: 'SetPersonAdminResult',
                people: people.map(asPerson),
                person: null,
                cognitoSyncFailed: false,
                errors: ['CannotRevokeOwnAdminAccess'],
              },
            },
          })
        }
        if (isAdmin && person.linkedEmails.length === 0) {
          return HttpResponse.json({
            data: {
              renamePerson: { __typename: 'RenamePersonResult', errors: [] },
              setPersonAdmin: {
                __typename: 'SetPersonAdminResult',
                people: people.map(asPerson),
                person: null,
                cognitoSyncFailed: false,
                errors: ['NoLinkedAccount'],
              },
            },
          })
        }
        person.name = name
        person.isAdmin = isAdmin
        const cognitoSyncFailed = Boolean(window.__mockControls?.cognitoSyncFailsOnce)
        if (window.__mockControls) window.__mockControls.cognitoSyncFailsOnce = false
        return HttpResponse.json({
          data: {
            renamePerson: { __typename: 'RenamePersonResult', errors: [] },
            setPersonAdmin: {
              __typename: 'SetPersonAdminResult',
              people: people.map(asPerson),
              person: asPerson(person),
              cognitoSyncFailed,
              errors: [],
            },
          },
        })
      }

      // Standalone - only ever called by CognitoSyncFailedDialog's Retry (see PersonsPage.tsx),
      // re-sending the same id/isAdmin EditPerson already saved.
      case 'SetPersonAdmin': {
        const id = variables.id as string
        const isAdmin = variables.isAdmin as boolean
        const person = people.find((candidate) => candidate.id === id)
        if (!person) {
          return HttpResponse.json({
            data: {
              setPersonAdmin: {
                __typename: 'SetPersonAdminResult',
                people: people.map(asPerson),
                person: null,
                cognitoSyncFailed: false,
                errors: ['PersonNotFound'],
              },
            },
          })
        }
        person.isAdmin = isAdmin
        const cognitoSyncFailed = Boolean(window.__mockControls?.cognitoSyncFailsOnce)
        if (window.__mockControls) window.__mockControls.cognitoSyncFailsOnce = false
        return HttpResponse.json({
          data: {
            setPersonAdmin: {
              __typename: 'SetPersonAdminResult',
              people: people.map(asPerson),
              person: asPerson(person),
              cognitoSyncFailed,
              errors: [],
            },
          },
        })
      }

      case 'DeletePerson': {
        const id = variables.id as string
        const index = people.findIndex((candidate) => candidate.id === id)
        if (index === -1) {
          return HttpResponse.json({
            data: { deletePerson: { __typename: 'DeletePersonResult', people: people.map(asPerson), errors: ['PersonNotFound'] } },
          })
        }
        const viewerEmail = emailFromAuthHeader(request)
        const viewer = viewerEmail ? linkedPersonByEmail[viewerEmail] : null
        if (viewer?.id === id) {
          return HttpResponse.json({
            data: { deletePerson: { __typename: 'DeletePersonResult', people: people.map(asPerson), errors: ['CannotDeleteSelf'] } },
          })
        }
        people.splice(index, 1)
        return HttpResponse.json({
          data: { deletePerson: { __typename: 'DeletePersonResult', people: people.map(asPerson), errors: [] } },
        })
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
        // Extend this file rather than letting a future test hang here.
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
