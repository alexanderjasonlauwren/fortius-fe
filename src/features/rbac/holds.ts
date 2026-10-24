import { useAuthStore } from "@/features/auth/store/authStore";

/**
 * Whether the signed-in user holds a permission, for code outside React --
 * an API adapter deciding whether a supporting lookup is worth making.
 *
 * Never an authorisation decision: the server decides that on every
 * request. This only spares a request the server would refuse, so a page
 * the user may open does not fire a 403 for a lookup it can do without.
 */
export function holds(permission: string): boolean {
  return useAuthStore.getState().hasPermission(permission);
}
