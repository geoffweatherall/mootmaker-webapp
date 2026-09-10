/**
 * The shapes this app actually works with, derived from the generated schema types.
 *
 * This file used to be a hand-maintained mirror of `mootmaker-api/api/mootmaker.graphql`, kept in
 * sync by whoever remembered to edit both — with nothing enforcing that they agreed. It is now
 * derived: every type below resolves through `./generated`, which is generated from the schema
 * itself (see `codegen.ts`). Adding a field to the schema and forgetting this file is no longer
 * possible, because there is nothing here to forget.
 *
 * These are deliberately *selection* types rather than the schema's own object types: `Person` is
 * what `ListPeople` selects, not every field a Person has. That is what the components consume,
 * and it means removing a field from a query is a compile error at the component that used it
 * rather than a runtime `undefined`.
 */
import type {
  CreateMeetingMutation,
  CreateRoomMutation,
  DaysQuery,
  MeetingByIdQuery,
  PageLoadQuery,
  UpdateMyPreferencesMutation,
  UpdatePersonMutation,
  UpdateRoomMutation,
} from './generated/graphql'

/**
 * Every shape now derives from one query, because there is one entry point. `PageLoad` selects the
 * widest version of each, so the narrower queries' results are assignable to these.
 */
export type Person = PageLoadQuery['workspace']['people'][number]

/** The signed-in viewer's own Person, as returned inside workspace and by updateMyPreferences. */
export type MyPerson = NonNullable<PageLoadQuery['workspace']['me']>

export type Room = PageLoadQuery['workspace']['rooms'][number]

/** The window meetings may be viewed and booked in. The server owns both ends; the client only reads them. */
export type Boundaries = PageLoadQuery['workspace']['boundaries']

/**
 * A day and its meetings — the unit every meetings screen is now expressed in. Taken from the Days
 * query rather than PageLoad because they select identically and Days is the one used on navigation.
 */
export type Day = DaysQuery['workspace']['days'][number]

/**
 * A meeting as it appears inside a day: room, organiser and attendees are ids only, because names
 * are resolved from the cached rooms and people rather than fetched per meeting.
 */
export type Meeting = Day['meetings'][number]

/**
 * A meeting on its own, with names resolved. Distinct from {@link Meeting} on purpose: a details
 * page reached cold has no cached rooms or people to resolve ids against, so it asks for the names.
 */
export type MeetingDetails = NonNullable<MeetingByIdQuery['meeting']>

// Mutation payloads, derived from the operations that return them. Each is a { thing, errors }
// pair, so a component can branch on errors without knowing which mutation produced them.
export type CreateRoomResult = CreateRoomMutation['createRoom']
export type UpdateRoomResult = UpdateRoomMutation['updateRoom']
export type UpdatePersonResult = UpdatePersonMutation['updatePerson']
export type UpdateMyPreferencesResult = UpdateMyPreferencesMutation['updateMyPreferences']
export type CreateMeetingResult = CreateMeetingMutation['createMeeting']
export type CreatePersonResult = import('./generated/graphql').CreatePersonMutation['createPerson']

// Input and error types come straight from the schema - they have no selection set, so there is no
// app-specific shape to derive.
export type {
  DateFormat,
  MeetingError,
  PersonError,
  PreferencesError,
  RoomError,
  TimeFormat,
} from './generated/graphql'
