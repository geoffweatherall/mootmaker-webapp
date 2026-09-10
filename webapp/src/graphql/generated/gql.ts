/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  mutation CreateRoom($room: RoomInput!) {\n    createRoom(room: $room) {\n      rooms {\n        id\n        name\n        capacity\n      }\n      room {\n        id\n        name\n        capacity\n      }\n      errors\n    }\n  }\n": typeof types.CreateRoomDocument,
    "\n  mutation UpdateRoom($id: ID!, $room: RoomInput!) {\n    updateRoom(id: $id, room: $room) {\n      rooms {\n        id\n        name\n        capacity\n      }\n      room {\n        id\n        name\n        capacity\n      }\n      errors\n    }\n  }\n": typeof types.UpdateRoomDocument,
    "\n  mutation CreatePerson($person: PersonInput!) {\n    createPerson(person: $person) {\n      people {\n        id\n        name\n      }\n      person {\n        id\n        name\n      }\n      errors\n    }\n  }\n": typeof types.CreatePersonDocument,
    "\n  mutation UpdatePerson($id: ID!, $person: PersonInput!) {\n    updatePerson(id: $id, person: $person) {\n      people {\n        id\n        name\n      }\n      person {\n        id\n        name\n      }\n      errors\n    }\n  }\n": typeof types.UpdatePersonDocument,
    "\n  mutation UpdateMyPreferences($preferences: PreferencesInput!) {\n    updateMyPreferences(preferences: $preferences) {\n      person {\n        id\n        name\n        dateFormat\n        timeFormat\n      }\n      errors\n    }\n  }\n": typeof types.UpdateMyPreferencesDocument,
    "\n  mutation DeleteMyAccount {\n    deleteMyAccount\n  }\n": typeof types.DeleteMyAccountDocument,
    "\n  mutation CreateMeeting($meeting: MeetingInput!) {\n    createMeeting(meeting: $meeting) {\n      meeting {\n        id\n        subject\n        startTime\n        endTime\n        room {\n          id\n          name\n          capacity\n        }\n        organiser {\n          id\n          name\n        }\n        attendees {\n          id\n          name\n        }\n      }\n      day {\n        date\n        meetings {\n          id\n          subject\n          startTime\n          endTime\n          room {\n            id\n          }\n          organiser {\n            id\n          }\n          attendees {\n            id\n          }\n        }\n      }\n      errors\n    }\n  }\n": typeof types.CreateMeetingDocument,
    "\n  query PageLoad($dates: [String!]) {\n    workspace(dates: $dates) {\n      me {\n        id\n        name\n        dateFormat\n        timeFormat\n      }\n      people {\n        id\n        name\n      }\n      rooms {\n        id\n        name\n        capacity\n      }\n      boundaries {\n        earliestRetainedDate\n        latestBookableDate\n      }\n      days {\n        date\n        meetings {\n          id\n          subject\n          startTime\n          endTime\n          room {\n            id\n          }\n          organiser {\n            id\n          }\n          attendees {\n            id\n          }\n        }\n      }\n    }\n  }\n": typeof types.PageLoadDocument,
    "\n  query Days($dates: [String!]) {\n    workspace(dates: $dates) {\n      days {\n        date\n        meetings {\n          id\n          subject\n          startTime\n          endTime\n          room {\n            id\n          }\n          organiser {\n            id\n          }\n          attendees {\n            id\n          }\n        }\n      }\n    }\n  }\n": typeof types.DaysDocument,
    "\n  query ReferenceData {\n    workspace {\n      rooms {\n        id\n        name\n        capacity\n      }\n      people {\n        id\n        name\n      }\n    }\n  }\n": typeof types.ReferenceDataDocument,
    "\n  query MeetingById($id: ID!) {\n    meeting(id: $id) {\n      id\n      subject\n      startTime\n      endTime\n      room {\n        id\n        name\n        capacity\n      }\n      organiser {\n        id\n        name\n      }\n      attendees {\n        id\n        name\n      }\n    }\n  }\n": typeof types.MeetingByIdDocument,
    "\n  query Session {\n    workspace {\n      me {\n        id\n        name\n        dateFormat\n        timeFormat\n      }\n    }\n  }\n": typeof types.SessionDocument,
    "\n  query SuggestRoom($startTime: String!, $endTime: String!, $requiredCapacity: Int!) {\n    suggestRoom(startTime: $startTime, endTime: $endTime, requiredCapacity: $requiredCapacity) {\n      id\n      name\n      capacity\n    }\n  }\n": typeof types.SuggestRoomDocument,
};
const documents: Documents = {
    "\n  mutation CreateRoom($room: RoomInput!) {\n    createRoom(room: $room) {\n      rooms {\n        id\n        name\n        capacity\n      }\n      room {\n        id\n        name\n        capacity\n      }\n      errors\n    }\n  }\n": types.CreateRoomDocument,
    "\n  mutation UpdateRoom($id: ID!, $room: RoomInput!) {\n    updateRoom(id: $id, room: $room) {\n      rooms {\n        id\n        name\n        capacity\n      }\n      room {\n        id\n        name\n        capacity\n      }\n      errors\n    }\n  }\n": types.UpdateRoomDocument,
    "\n  mutation CreatePerson($person: PersonInput!) {\n    createPerson(person: $person) {\n      people {\n        id\n        name\n      }\n      person {\n        id\n        name\n      }\n      errors\n    }\n  }\n": types.CreatePersonDocument,
    "\n  mutation UpdatePerson($id: ID!, $person: PersonInput!) {\n    updatePerson(id: $id, person: $person) {\n      people {\n        id\n        name\n      }\n      person {\n        id\n        name\n      }\n      errors\n    }\n  }\n": types.UpdatePersonDocument,
    "\n  mutation UpdateMyPreferences($preferences: PreferencesInput!) {\n    updateMyPreferences(preferences: $preferences) {\n      person {\n        id\n        name\n        dateFormat\n        timeFormat\n      }\n      errors\n    }\n  }\n": types.UpdateMyPreferencesDocument,
    "\n  mutation DeleteMyAccount {\n    deleteMyAccount\n  }\n": types.DeleteMyAccountDocument,
    "\n  mutation CreateMeeting($meeting: MeetingInput!) {\n    createMeeting(meeting: $meeting) {\n      meeting {\n        id\n        subject\n        startTime\n        endTime\n        room {\n          id\n          name\n          capacity\n        }\n        organiser {\n          id\n          name\n        }\n        attendees {\n          id\n          name\n        }\n      }\n      day {\n        date\n        meetings {\n          id\n          subject\n          startTime\n          endTime\n          room {\n            id\n          }\n          organiser {\n            id\n          }\n          attendees {\n            id\n          }\n        }\n      }\n      errors\n    }\n  }\n": types.CreateMeetingDocument,
    "\n  query PageLoad($dates: [String!]) {\n    workspace(dates: $dates) {\n      me {\n        id\n        name\n        dateFormat\n        timeFormat\n      }\n      people {\n        id\n        name\n      }\n      rooms {\n        id\n        name\n        capacity\n      }\n      boundaries {\n        earliestRetainedDate\n        latestBookableDate\n      }\n      days {\n        date\n        meetings {\n          id\n          subject\n          startTime\n          endTime\n          room {\n            id\n          }\n          organiser {\n            id\n          }\n          attendees {\n            id\n          }\n        }\n      }\n    }\n  }\n": types.PageLoadDocument,
    "\n  query Days($dates: [String!]) {\n    workspace(dates: $dates) {\n      days {\n        date\n        meetings {\n          id\n          subject\n          startTime\n          endTime\n          room {\n            id\n          }\n          organiser {\n            id\n          }\n          attendees {\n            id\n          }\n        }\n      }\n    }\n  }\n": types.DaysDocument,
    "\n  query ReferenceData {\n    workspace {\n      rooms {\n        id\n        name\n        capacity\n      }\n      people {\n        id\n        name\n      }\n    }\n  }\n": types.ReferenceDataDocument,
    "\n  query MeetingById($id: ID!) {\n    meeting(id: $id) {\n      id\n      subject\n      startTime\n      endTime\n      room {\n        id\n        name\n        capacity\n      }\n      organiser {\n        id\n        name\n      }\n      attendees {\n        id\n        name\n      }\n    }\n  }\n": types.MeetingByIdDocument,
    "\n  query Session {\n    workspace {\n      me {\n        id\n        name\n        dateFormat\n        timeFormat\n      }\n    }\n  }\n": types.SessionDocument,
    "\n  query SuggestRoom($startTime: String!, $endTime: String!, $requiredCapacity: Int!) {\n    suggestRoom(startTime: $startTime, endTime: $endTime, requiredCapacity: $requiredCapacity) {\n      id\n      name\n      capacity\n    }\n  }\n": types.SuggestRoomDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateRoom($room: RoomInput!) {\n    createRoom(room: $room) {\n      rooms {\n        id\n        name\n        capacity\n      }\n      room {\n        id\n        name\n        capacity\n      }\n      errors\n    }\n  }\n"): (typeof documents)["\n  mutation CreateRoom($room: RoomInput!) {\n    createRoom(room: $room) {\n      rooms {\n        id\n        name\n        capacity\n      }\n      room {\n        id\n        name\n        capacity\n      }\n      errors\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateRoom($id: ID!, $room: RoomInput!) {\n    updateRoom(id: $id, room: $room) {\n      rooms {\n        id\n        name\n        capacity\n      }\n      room {\n        id\n        name\n        capacity\n      }\n      errors\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateRoom($id: ID!, $room: RoomInput!) {\n    updateRoom(id: $id, room: $room) {\n      rooms {\n        id\n        name\n        capacity\n      }\n      room {\n        id\n        name\n        capacity\n      }\n      errors\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreatePerson($person: PersonInput!) {\n    createPerson(person: $person) {\n      people {\n        id\n        name\n      }\n      person {\n        id\n        name\n      }\n      errors\n    }\n  }\n"): (typeof documents)["\n  mutation CreatePerson($person: PersonInput!) {\n    createPerson(person: $person) {\n      people {\n        id\n        name\n      }\n      person {\n        id\n        name\n      }\n      errors\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdatePerson($id: ID!, $person: PersonInput!) {\n    updatePerson(id: $id, person: $person) {\n      people {\n        id\n        name\n      }\n      person {\n        id\n        name\n      }\n      errors\n    }\n  }\n"): (typeof documents)["\n  mutation UpdatePerson($id: ID!, $person: PersonInput!) {\n    updatePerson(id: $id, person: $person) {\n      people {\n        id\n        name\n      }\n      person {\n        id\n        name\n      }\n      errors\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateMyPreferences($preferences: PreferencesInput!) {\n    updateMyPreferences(preferences: $preferences) {\n      person {\n        id\n        name\n        dateFormat\n        timeFormat\n      }\n      errors\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateMyPreferences($preferences: PreferencesInput!) {\n    updateMyPreferences(preferences: $preferences) {\n      person {\n        id\n        name\n        dateFormat\n        timeFormat\n      }\n      errors\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteMyAccount {\n    deleteMyAccount\n  }\n"): (typeof documents)["\n  mutation DeleteMyAccount {\n    deleteMyAccount\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateMeeting($meeting: MeetingInput!) {\n    createMeeting(meeting: $meeting) {\n      meeting {\n        id\n        subject\n        startTime\n        endTime\n        room {\n          id\n          name\n          capacity\n        }\n        organiser {\n          id\n          name\n        }\n        attendees {\n          id\n          name\n        }\n      }\n      day {\n        date\n        meetings {\n          id\n          subject\n          startTime\n          endTime\n          room {\n            id\n          }\n          organiser {\n            id\n          }\n          attendees {\n            id\n          }\n        }\n      }\n      errors\n    }\n  }\n"): (typeof documents)["\n  mutation CreateMeeting($meeting: MeetingInput!) {\n    createMeeting(meeting: $meeting) {\n      meeting {\n        id\n        subject\n        startTime\n        endTime\n        room {\n          id\n          name\n          capacity\n        }\n        organiser {\n          id\n          name\n        }\n        attendees {\n          id\n          name\n        }\n      }\n      day {\n        date\n        meetings {\n          id\n          subject\n          startTime\n          endTime\n          room {\n            id\n          }\n          organiser {\n            id\n          }\n          attendees {\n            id\n          }\n        }\n      }\n      errors\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PageLoad($dates: [String!]) {\n    workspace(dates: $dates) {\n      me {\n        id\n        name\n        dateFormat\n        timeFormat\n      }\n      people {\n        id\n        name\n      }\n      rooms {\n        id\n        name\n        capacity\n      }\n      boundaries {\n        earliestRetainedDate\n        latestBookableDate\n      }\n      days {\n        date\n        meetings {\n          id\n          subject\n          startTime\n          endTime\n          room {\n            id\n          }\n          organiser {\n            id\n          }\n          attendees {\n            id\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query PageLoad($dates: [String!]) {\n    workspace(dates: $dates) {\n      me {\n        id\n        name\n        dateFormat\n        timeFormat\n      }\n      people {\n        id\n        name\n      }\n      rooms {\n        id\n        name\n        capacity\n      }\n      boundaries {\n        earliestRetainedDate\n        latestBookableDate\n      }\n      days {\n        date\n        meetings {\n          id\n          subject\n          startTime\n          endTime\n          room {\n            id\n          }\n          organiser {\n            id\n          }\n          attendees {\n            id\n          }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Days($dates: [String!]) {\n    workspace(dates: $dates) {\n      days {\n        date\n        meetings {\n          id\n          subject\n          startTime\n          endTime\n          room {\n            id\n          }\n          organiser {\n            id\n          }\n          attendees {\n            id\n          }\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  query Days($dates: [String!]) {\n    workspace(dates: $dates) {\n      days {\n        date\n        meetings {\n          id\n          subject\n          startTime\n          endTime\n          room {\n            id\n          }\n          organiser {\n            id\n          }\n          attendees {\n            id\n          }\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query ReferenceData {\n    workspace {\n      rooms {\n        id\n        name\n        capacity\n      }\n      people {\n        id\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query ReferenceData {\n    workspace {\n      rooms {\n        id\n        name\n        capacity\n      }\n      people {\n        id\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MeetingById($id: ID!) {\n    meeting(id: $id) {\n      id\n      subject\n      startTime\n      endTime\n      room {\n        id\n        name\n        capacity\n      }\n      organiser {\n        id\n        name\n      }\n      attendees {\n        id\n        name\n      }\n    }\n  }\n"): (typeof documents)["\n  query MeetingById($id: ID!) {\n    meeting(id: $id) {\n      id\n      subject\n      startTime\n      endTime\n      room {\n        id\n        name\n        capacity\n      }\n      organiser {\n        id\n        name\n      }\n      attendees {\n        id\n        name\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Session {\n    workspace {\n      me {\n        id\n        name\n        dateFormat\n        timeFormat\n      }\n    }\n  }\n"): (typeof documents)["\n  query Session {\n    workspace {\n      me {\n        id\n        name\n        dateFormat\n        timeFormat\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SuggestRoom($startTime: String!, $endTime: String!, $requiredCapacity: Int!) {\n    suggestRoom(startTime: $startTime, endTime: $endTime, requiredCapacity: $requiredCapacity) {\n      id\n      name\n      capacity\n    }\n  }\n"): (typeof documents)["\n  query SuggestRoom($startTime: String!, $endTime: String!, $requiredCapacity: Int!) {\n    suggestRoom(startTime: $startTime, endTime: $endTime, requiredCapacity: $requiredCapacity) {\n      id\n      name\n      capacity\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;