import { describe, expect, it } from "vitest";
import { syncStatus } from "./syncStatus";
import type { SIM3LONLiveCandidate } from "../types";

const at = (iso: string, status: string, appliedToSA = false, reviewReason?: string): SIM3LONLiveCandidate => ({
  id: iso, period: "2026-11", fetchedAt: iso, status, duplicate: false, checksum: "x", outletCount: 25, appliedToSA, reviewReason,
});

describe("SIM3LON sync status", () => {
  const now = new Date("2026-11-21T03:00:00Z").getTime();

  it("names the data in use and the first fetch waiting since, as production's 20 Nov stall would have read", () => {
    const status = syncStatus([
      at("2026-11-21T02:00:00Z", "parsed", false, "Ada rencana yang dibatalkan"),
      at("2026-11-20T12:04:00Z", "parsed", false, "Ada rencana yang dibatalkan"),
      at("2026-11-20T11:00:00Z", "applied", true),
    ], now);
    expect(status).toEqual({
      appliedFetchedAt: "2026-11-20T11:00:00Z",
      waitingSince: "2026-11-20T12:04:00Z",
      waitingReason: "Ada rencana yang dibatalkan",
      stuck: true,
    });
  });

  it("is not stuck before two hours, and nothing waits once the newest is applied", () => {
    expect(syncStatus([at("2026-11-21T02:30:00Z", "parsed"), at("2026-11-21T01:00:00Z", "applied", true)], now).stuck).toBe(false);
    expect(syncStatus([at("2026-11-21T02:30:00Z", "applied", true), at("2026-11-21T01:00:00Z", "parsed")], now))
      .toEqual({ appliedFetchedAt: "2026-11-21T02:30:00Z", waitingSince: undefined, waitingReason: undefined, stuck: false });
  });

  it("a discarded fetch is not waiting", () => {
    expect(syncStatus([at("2026-11-20T00:00:00Z", "discarded")], now).waitingSince).toBeUndefined();
  });
});
