import type { DispatchLane, StopStage } from "../types";

/**
 * Most urgent first: a truck with a failed stop needs someone now, one on
 * the road may, one waiting soon will, and a finished one needs nobody.
 * Beranda's board is read for "which truck needs me", so that is its order.
 */
export const LANE_PRIORITY: readonly StopStage[] = ["Tertunda", "Proses", "Antrian", "Selesai"];

/** The board's legend words for each stage, lower-cased for a count. */
export const STAGE_WORD: Record<StopStage, string> = {
  Tertunda: "tertunda",
  Proses: "berjalan",
  Antrian: "antrian",
  Selesai: "selesai",
};

/** A truck's state is its most urgent stop's. */
export function laneStage(lane: DispatchLane): StopStage {
  return LANE_PRIORITY.find((stage) => lane.stops.some((s) => s.stage === stage)) ?? "Antrian";
}

/** Lanes by urgency; trucks of equal urgency keep the server's order. */
export function orderLanes(lanes: DispatchLane[]): DispatchLane[] {
  return lanes
    .map((lane, index) => ({ lane, index, rank: LANE_PRIORITY.indexOf(laneStage(lane)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.lane);
}

/** A normal day's fleet: up to this many trucks show without folding. */
export const VISIBLE_LANES = 6;

export interface RailSplit {
  shown: DispatchLane[];
  /** The trucks folded into the summary row; empty when expanded. */
  hidden: DispatchLane[];
  /** Whether the board has more trucks than it shows folded at all. */
  folds: boolean;
  /** How many of the hidden trucks are in each stage, most urgent first. */
  hiddenByStage: { stage: StopStage; count: number }[];
}

/**
 * Splits the ordered board into what is drawn and what is summarised. One
 * truck over the cap is drawn rather than folded: a summary row would take
 * the same space to say less.
 */
export function splitLanes(lanes: DispatchLane[], expanded: boolean): RailSplit {
  const ordered = orderLanes(lanes);
  const folds = ordered.length > VISIBLE_LANES + 1;
  const shown = folds && !expanded ? ordered.slice(0, VISIBLE_LANES) : ordered;
  const hidden = folds && !expanded ? ordered.slice(VISIBLE_LANES) : [];
  const hiddenByStage = LANE_PRIORITY
    .map((stage) => ({ stage, count: hidden.filter((lane) => laneStage(lane) === stage).length }))
    .filter((entry) => entry.count > 0);
  return { shown, hidden, folds, hiddenByStage };
}
