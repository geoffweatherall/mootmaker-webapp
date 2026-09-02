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
  ListMeetingsQuery,
  ListPeopleQuery,
  ListRoomsQuery,
  MyPersonQuery,
  UpdateMyPreferencesMutation,
  UpdatePersonMutation,
  UpdateRoomMutation,
} from './generated/graphql'

export type Person = ListPeopleQuery['people'][number]

/** The signed-in viewer's own Person, as returned by the myPerson query and updateMyPreferences. */
export type MyPerson = NonNullable<MyPersonQuery['myPerson']>

export type Room = ListRoomsQuery['rooms'][number]

export type Meeting = ListMeetingsQuery['meetings'][number]

// Mutation payloads, derived from the operations that return them. Each is a { thing, errors }
// pair, so a component can branch on errors without knowing which mutation produced them.
export type CreateRoomResult = CreateRoomMutation['createRoom']
export type UpdateRoomResult = UpdateRoomMutation['updateRoom']
export type UpdatePersonResult = UpdatePersonMutation['updatePerson']
export type UpdateMyPreferencesResult = UpdateMyPreferencesMutation['updateMyPreferences']
export type CreateMeetingResult = CreateMeetingMutation['createMeeting']

// Input and error types come straight from the schema - they have no selection set, so there is no
// app-specific shape to derive.
export type {
  DateFormat,
  MeetingError,
  MeetingsFilter,
  PersonError,
  PreferencesError,
  RoomError,
  TimeFormat,
} from './generated/graphql'
