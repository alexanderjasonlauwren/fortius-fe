import type { SIM3LONLiveCandidate, SIM3LONSyncHealth } from "../types";

/**
 * Fetched SIM3LON data may wait this long unapplied before the panel calls it
 * stuck. The server alerts the manager at the same mark (stuckSyncAfter in
 * the backend's sim3lon_notices.go), so the screen and the inbox agree.
 */
export const STUCK_AFTER_MS = 2 * 60 * 60 * 1000;

export interface SyncStatus {
  /** When the data the SA uses now was fetched from SIM3LON. */
  appliedFetchedAt?: string;
  /** The first fetch waiting since the last apply, and why it waits. */
  waitingSince?: string;
  waitingReason?: string;
  stuck: boolean;
}

/**
 * One line answering "is the SA on today's SIM3LON?": what is in use, and
 * since when newer data has been waiting. Production's sync stopped on
 * 20 Nov 19:04 and nobody could tell from the page.
 */
export function syncStatus(candidates: SIM3LONLiveCandidate[], now: number): SyncStatus {
  const newestFirst = [...candidates].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  const applied = newestFirst.find((candidate) => candidate.appliedToSA);
  let waiting: SIM3LONLiveCandidate | undefined;
  for (const candidate of newestFirst) {
    if (candidate === applied || candidate.status === "applied") break;
    if (candidate.status === "parsed") waiting = candidate;
  }
  return {
    appliedFetchedAt: applied?.fetchedAt,
    waitingSince: waiting?.fetchedAt,
    waitingReason: waiting?.reviewReason,
    stuck: !!waiting && now - new Date(waiting.fetchedAt).getTime() >= STUCK_AFTER_MS,
  };
}

export interface Reachability {
  /** SIM3LON is not answering usefully right now. */
  failing: boolean;
  /** Failing for two hours or more: the server has paged the office. */
  unreachable: boolean;
  failingSince?: string;
  lastSuccessAt?: string;
  /** What SIM3LON did, in the office's words. */
  what: string;
}

/**
 * Whether SIM3LON itself is answering, as opposed to whether its data was
 * applied (syncStatus). A pull that finds nothing new leaves no candidate,
 * so only the server's health record can tell "unchanged" from "down".
 * Uses the same two hours as the server's alert (unreachableAfter).
 */
export function reachability(health: SIM3LONSyncHealth, now: number): Reachability {
  const failing = !!health.failingSince;
  return {
    failing,
    unreachable: failing && now - new Date(health.failingSince!).getTime() >= STUCK_AFTER_MS,
    failingSince: health.failingSince,
    lastSuccessAt: health.lastSuccessAt,
    what: health.lastErrorCode === "SIM3LON_BAD_RESPONSE" ? "mengirim data yang tidak terbaca" : "tidak bisa dihubungi",
  };
}
