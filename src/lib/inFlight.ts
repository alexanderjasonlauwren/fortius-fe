import { scopeKey } from "@/lib/scope";

const pending = new Map<string, Promise<unknown>>();

/**
 * Joins a request already on its way instead of sending the same one again.
 *
 * Beranda's widgets mount together and each loaded today's deliveries, the
 * outlet list and the settings for itself: one cold load sent today's
 * deliveries four times and the outlet list eight (Round 1 G15). Calls made
 * while an identical one is in flight share its answer; once it settles the
 * next call goes to the server again, so nothing here outlives a response
 * and a write is never hidden behind a stale copy.
 *
 * The key is scoped to the acting tenant and branch, so two scopes never
 * share an answer.
 */
export function shareInFlight<T>(key: string, load: () => Promise<T>): Promise<T> {
  const scoped = `${scopeKey().join("/")}|${key}`;
  const existing = pending.get(scoped);
  if (existing) return existing as Promise<T>;
  const request = load().finally(() => pending.delete(scoped));
  pending.set(scoped, request);
  return request;
}
