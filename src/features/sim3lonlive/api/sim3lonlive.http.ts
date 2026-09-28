/**
 * The live SIM3LON view, against the real API.
 *
 * Thin: the backend already returns the snapshot in the shape the page wants
 * (our contract mirrors the bridge), so there is nothing to map. The backend
 * gates SPBE-only and caches per tenant/period; this adapter just names the
 * endpoints.
 */
import { getOne, send } from "@/lib/api";
import type { Sim3lonLiveApi, Sim3lonSnapshot } from "./contract";

const periodQuery = (period?: string) =>
  period ? `?period=${encodeURIComponent(period)}` : "";

// A sync drives the headless bridge through a login and several page loads on a
// WAF-fronted site, so it can take up to a minute. The snapshot read, by
// contrast, is a fast peek at the last synced result and keeps the default.
const SYNC_TIMEOUT_MS = 120_000;

export const sim3lonLiveHttp: Sim3lonLiveApi = {
  getSnapshot: (period) =>
    getOne<Sim3lonSnapshot>(`/integrations/sim3lon/snapshot${periodQuery(period)}`),
  sync: (period) =>
    send<Sim3lonSnapshot>(
      "post",
      `/integrations/sim3lon/sync${periodQuery(period)}`,
      undefined,
      { timeout: SYNC_TIMEOUT_MS },
    ),
};
