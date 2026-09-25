/**
 * The users data source, chosen at build time.
 *
 * Every feature that has a real endpoint gets a file like this. Features that do
 * not simply re-export their mock — an HTTP adapter that throws would be worse
 * than one that does not exist, because it looks like an outage rather than
 * unbuilt work.
 */
import { usesApi } from "@/lib/dataSource";

import * as httpApi from "./userApi.http";
import * as mockApi from "./userApi.mock";

export const getUsers = usesApi ? httpApi.getUsers : mockApi.getUsers;
export const getUsersWithAccess = usesApi
  ? httpApi.getUsersWithAccess
  : mockApi.getUsersWithAccess;
export const createOrUpdateUser = usesApi ? httpApi.createOrUpdateUser : mockApi.createOrUpdateUser;
export const removeUser = usesApi ? httpApi.removeUser : mockApi.removeUser;

// Mock-only for now: the backend has no export or audit-trail endpoint yet.
// Named here rather than hidden, so the gap is visible from the switch.
export const exportUsers = mockApi.exportUsers;
export const getAuditTrail = mockApi.getAuditTrail;
export const ROLE_SUMMARY = mockApi.ROLE_SUMMARY;
export const ROLE_LABEL = mockApi.ROLE_LABEL;
