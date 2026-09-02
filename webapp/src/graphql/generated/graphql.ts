/* eslint-disable */
/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
/** How a client renders and parses dates. Display only - this API always speaks ISO-8601. */
export type DateFormat =
  /** DD/MM/YYYY */
  | 'British'
  /** YYYY-MM-DD */
  | 'Iso'
  /** MM/DD/YYYY */
  | 'Usa';

export type MeetingError =
  | 'AttendeeNotFound'
  /** endTime is not strictly after startTime (earlier than, or equal to, startTime), on the same calendar date. */
  | 'EndBeforeStart'
  | 'EndMissaligned'
  | 'InsufficientCapacity'
  /** organiserId also appears in attendeeIds - the organiser is already counted as one of the meeting's people and cannot additionally be listed as an attendee. */
  | 'OrganiserIsAttendee'
  | 'OrganiserNotFound'
  | 'OrganiserRequired'
  | 'RoomNotFound'
  | 'RoomRequired'
  /** startTime and endTime fall on different calendar dates - a meeting cannot span midnight. */
  | 'SpansMultipleDays'
  | 'StartMissaligned'
  | 'SubjectRequired'
  | 'TimeRangeUnavailable';

export type MeetingInput = {
  attendeeIds: Array<string>;
  /** ISO-8601 local date-time with no time-zone offset, must fall on a 15 minute boundary, e.g. "2026-07-01T15:00:00". Must be on the same calendar date as startTime - a meeting cannot span midnight. */
  endTime: string;
  organiserId: string;
  roomId: string;
  /** ISO-8601 local date-time with no time-zone offset, must fall on a 15 minute boundary, e.g. "2026-07-01T14:30:00". Must be on the same calendar date as endTime - a meeting cannot span midnight. */
  startTime: string;
  /** Must not be null or blank. */
  subject: string;
};

/** Filters for Query.meetings. All fields are optional and combine with AND; omitting the input (or all fields) returns every meeting, unchanged from the default behaviour. */
export type MeetingsFilter = {
  /** Restricts to meetings whose time range overlaps [fromStartTime, toEndTime) - i.e. startTime < toEndTime and endTime > fromStartTime, the same overlap rule createMeeting already enforces. Both are ISO-8601 local date-times (java.time.LocalDateTime semantics, no time-zone offset) and must be supplied together. */
  fromStartTime?: string | null | undefined;
  /** Restricts to meetings where this person is the organiser or one of the attendees. */
  personId?: string | null | undefined;
  toEndTime?: string | null | undefined;
};

export type PersonError =
  | 'NameRequired'
  /** id did not match any existing person. */
  | 'PersonNotFound';

export type PersonInput = {
  name: string;
};

export type PreferencesError =
  /** The caller has no linked Person, so there is nothing to store a preference against. */
  | 'NoLinkedPerson';

/** Both formats are required - updateMyPreferences replaces the caller's whole preference pair, it does not patch one of them. */
export type PreferencesInput = {
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
};

export type RoomError =
  | 'CapacityTooLow'
  | 'NameRequired'
  /** updateRoom only: id did not match any existing room. */
  | 'RoomNotFound';

export type RoomInput = {
  /** Must be 2 or more. */
  capacity: number;
  name: string;
};

/** How a client renders and parses times. Display only - this API always speaks ISO-8601. */
export type TimeFormat =
  /** hh:mm A */
  | 'AmPm'
  /** HH:mm */
  | 'TwentyFourHour';

export type CreateRoomMutationVariables = Exact<{
  room: RoomInput;
}>;


export type CreateRoomMutation = { createRoom: { errors: Array<RoomError>, room: { id: string, name: string, capacity: number } | null } };

export type UpdateRoomMutationVariables = Exact<{
  id: string;
  room: RoomInput;
}>;


export type UpdateRoomMutation = { updateRoom: { errors: Array<RoomError>, room: { id: string, name: string, capacity: number } | null } };

export type CreatePersonMutationVariables = Exact<{
  person: PersonInput;
}>;


export type CreatePersonMutation = { createPerson: { id: string, name: string } };

export type UpdatePersonMutationVariables = Exact<{
  id: string;
  person: PersonInput;
}>;


export type UpdatePersonMutation = { updatePerson: { errors: Array<PersonError>, person: { id: string, name: string } | null } };

export type UpdateMyPreferencesMutationVariables = Exact<{
  preferences: PreferencesInput;
}>;


export type UpdateMyPreferencesMutation = { updateMyPreferences: { errors: Array<PreferencesError>, person: { id: string, name: string, dateFormat: DateFormat, timeFormat: TimeFormat } | null } };

export type DeleteMyAccountMutationVariables = Exact<{ [key: string]: never; }>;


export type DeleteMyAccountMutation = { deleteMyAccount: boolean };

export type CreateMeetingMutationVariables = Exact<{
  meeting: MeetingInput;
}>;


export type CreateMeetingMutation = { createMeeting: { errors: Array<MeetingError>, meeting: { id: string, subject: string, startTime: string, endTime: string, room: { id: string, name: string, capacity: number }, organiser: { id: string, name: string }, attendees: Array<{ id: string, name: string }> } | null } };

export type ListPeopleQueryVariables = Exact<{ [key: string]: never; }>;


export type ListPeopleQuery = { people: Array<{ id: string, name: string }> };

export type MyPersonQueryVariables = Exact<{ [key: string]: never; }>;


export type MyPersonQuery = { myPerson: { id: string, name: string, dateFormat: DateFormat, timeFormat: TimeFormat } | null };

export type ListRoomsQueryVariables = Exact<{ [key: string]: never; }>;


export type ListRoomsQuery = { rooms: Array<{ id: string, name: string, capacity: number }> };

export type SuggestRoomQueryVariables = Exact<{
  startTime: string;
  endTime: string;
  requiredCapacity: number;
}>;


export type SuggestRoomQuery = { suggestRoom: Array<{ id: string, name: string, capacity: number }> };

export type ListMeetingsQueryVariables = Exact<{
  filter?: MeetingsFilter | null | undefined;
}>;


export type ListMeetingsQuery = { meetings: Array<{ id: string, subject: string, startTime: string, endTime: string, room: { id: string, name: string, capacity: number }, organiser: { id: string, name: string }, attendees: Array<{ id: string, name: string }> }> };


export const CreateRoomDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateRoom"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"room"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RoomInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createRoom"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"room"},"value":{"kind":"Variable","name":{"kind":"Name","value":"room"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"room"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"errors"}}]}}]}}]} as unknown as DocumentNode<CreateRoomMutation, CreateRoomMutationVariables>;
export const UpdateRoomDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateRoom"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"room"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RoomInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateRoom"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"room"},"value":{"kind":"Variable","name":{"kind":"Name","value":"room"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"room"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"errors"}}]}}]}}]} as unknown as DocumentNode<UpdateRoomMutation, UpdateRoomMutationVariables>;
export const CreatePersonDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreatePerson"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"person"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"PersonInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createPerson"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"person"},"value":{"kind":"Variable","name":{"kind":"Name","value":"person"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<CreatePersonMutation, CreatePersonMutationVariables>;
export const UpdatePersonDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdatePerson"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"person"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"PersonInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updatePerson"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"person"},"value":{"kind":"Variable","name":{"kind":"Name","value":"person"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"person"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"errors"}}]}}]}}]} as unknown as DocumentNode<UpdatePersonMutation, UpdatePersonMutationVariables>;
export const UpdateMyPreferencesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateMyPreferences"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"preferences"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"PreferencesInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateMyPreferences"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"preferences"},"value":{"kind":"Variable","name":{"kind":"Name","value":"preferences"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"person"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dateFormat"}},{"kind":"Field","name":{"kind":"Name","value":"timeFormat"}}]}},{"kind":"Field","name":{"kind":"Name","value":"errors"}}]}}]}}]} as unknown as DocumentNode<UpdateMyPreferencesMutation, UpdateMyPreferencesMutationVariables>;
export const DeleteMyAccountDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteMyAccount"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteMyAccount"}}]}}]} as unknown as DocumentNode<DeleteMyAccountMutation, DeleteMyAccountMutationVariables>;
export const CreateMeetingDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateMeeting"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"meeting"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"MeetingInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createMeeting"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"meeting"},"value":{"kind":"Variable","name":{"kind":"Name","value":"meeting"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"meeting"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"startTime"}},{"kind":"Field","name":{"kind":"Name","value":"endTime"}},{"kind":"Field","name":{"kind":"Name","value":"room"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"organiser"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"attendees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"errors"}}]}}]}}]} as unknown as DocumentNode<CreateMeetingMutation, CreateMeetingMutationVariables>;
export const ListPeopleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ListPeople"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"people"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<ListPeopleQuery, ListPeopleQueryVariables>;
export const MyPersonDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyPerson"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myPerson"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"dateFormat"}},{"kind":"Field","name":{"kind":"Name","value":"timeFormat"}}]}}]}}]} as unknown as DocumentNode<MyPersonQuery, MyPersonQueryVariables>;
export const ListRoomsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ListRooms"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"rooms"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}}]}}]}}]} as unknown as DocumentNode<ListRoomsQuery, ListRoomsQueryVariables>;
export const SuggestRoomDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"SuggestRoom"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"startTime"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"endTime"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"requiredCapacity"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"suggestRoom"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"startTime"},"value":{"kind":"Variable","name":{"kind":"Name","value":"startTime"}}},{"kind":"Argument","name":{"kind":"Name","value":"endTime"},"value":{"kind":"Variable","name":{"kind":"Name","value":"endTime"}}},{"kind":"Argument","name":{"kind":"Name","value":"requiredCapacity"},"value":{"kind":"Variable","name":{"kind":"Name","value":"requiredCapacity"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}}]}}]}}]} as unknown as DocumentNode<SuggestRoomQuery, SuggestRoomQueryVariables>;
export const ListMeetingsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"ListMeetings"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filter"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"MeetingsFilter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"meetings"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filter"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filter"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"subject"}},{"kind":"Field","name":{"kind":"Name","value":"startTime"}},{"kind":"Field","name":{"kind":"Name","value":"endTime"}},{"kind":"Field","name":{"kind":"Name","value":"room"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"capacity"}}]}},{"kind":"Field","name":{"kind":"Name","value":"organiser"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}},{"kind":"Field","name":{"kind":"Name","value":"attendees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]}}]} as unknown as DocumentNode<ListMeetingsQuery, ListMeetingsQueryVariables>;