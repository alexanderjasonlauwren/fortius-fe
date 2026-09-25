import type { AssignmentSuggestion, PlanRow, VehicleOption } from "../types";

/**
 * Orders stops the way the board and the printed route sheet read them: by
 * run, then by position within it.
 *
 * `tripNo`/`urutan` missing sorts last rather than first — an unassigned or
 * just-moved stop belongs at the end of the list it is displayed in, not
 * jumping ahead of stops that already have a real position.
 */
export function compareStops(a: PlanRow, b: PlanRow): number {
  const tripA = a.tripNo ?? Infinity;
  const tripB = b.tripNo ?? Infinity;
  if (tripA !== tripB) return tripA - tripB;

  const posA = a.urutan ?? Infinity;
  const posB = b.urutan ?? Infinity;
  if (posA !== posB) return posA - posB;

  return a.outlet.localeCompare(b.outlet);
}

/**
 * Applies a route suggestion onto the draft: which driver, which truck, and
 * where in the run each stop falls.
 *
 * This used to live inline in `PlanDetailPanel.suggest()` and copied only the
 * driver and trip number, silently dropping the optimizer's stop order and its
 * choice of truck. The saved board then numbered stops alphabetically instead
 * of by the route the planner just computed -- the suggestion was shown once
 * and thrown away the moment it was saved. Pulling this out into its own pure
 * function is what makes that property testable on its own, independent of
 * the component's state plumbing.
 */
export function applySuggestion(
  rows: PlanRow[],
  suggestion: AssignmentSuggestion,
  vehicles: VehicleOption[],
): PlanRow[] {
  const placement = new Map<
    string,
    {
      driverId: string;
      driver: string;
      tripNo: number;
      urutan: number;
      vehicleId?: string;
      vehicle?: string;
      eta?: string;
      berangkat?: string;
    }
  >();

  for (const trip of suggestion.trips) {
    const vehicle = trip.vehicleId ? vehicles.find((v) => v.id === trip.vehicleId) : undefined;
    for (const stop of trip.stops) {
      placement.set(stop.outletId, {
        driverId: trip.driverId,
        driver: trip.driver,
        tripNo: trip.tripNo,
        urutan: stop.urutan,
        vehicleId: trip.vehicleId,
        vehicle: vehicle?.label ?? trip.armada,
        eta: stop.eta,
        berangkat: trip.berangkat,
      });
    }
  }

  return rows.map((row) => {
    const at = placement.get(row.outletId);
    // A stop the planner could not place is cleared rather than left on
    // whichever trip it happened to be on: the unroutable list is then the
    // whole truth about what is not being carried.
    if (!at) {
      return {
        ...row,
        driverId: null, driver: "Belum ditetapkan", tripNo: null, urutan: null,
        berangkat: null,
      };
    }
    return {
      ...row,
      driverId: at.driverId,
      driver: at.driver,
      tripNo: at.tripNo,
      urutan: at.urutan,
      // Only overwritten when the suggestion names a truck. The mock
      // suggester has no coordinates and never proposes one -- see
      // `suggestAssignment.ts`'s own `DASAR_KAPASITAS` note -- so leaving an
      // already-chosen truck alone there is the correct behaviour, not a
      // fallback for a missing field.
      ...(at.vehicleId ? { vehicleId: at.vehicleId, vehicle: at.vehicle ?? row.vehicle } : {}),
      // Same reasoning for the estimate: the mock has no coordinates to
      // compute one from, so an absent eta/berangkat leaves the row's
      // existing value (typically the mock's own hour or "—") rather than
      // erasing it.
      ...(at.eta ? { jamPengiriman: at.eta } : {}),
      ...(at.berangkat ? { berangkat: at.berangkat } : {}),
    };
  });
}

/** The run a row belongs to: driver plus trip, trip defaulting to 1. */
function runKey(row: PlanRow): string {
  return `${row.driverId}#${row.tripNo ?? 1}`;
}

/**
 * Moves one stop up or down within its own run and renumbers that run 1..n.
 *
 * Rows on every other run are returned unchanged, and a move past either end
 * of the run is a no-op -- there is nothing to swap with, and silently
 * clamping would make the button seem to do nothing without saying why.
 */
export function moveStop(rows: PlanRow[], rowId: string, direction: -1 | 1): PlanRow[] {
  const row = rows.find((r) => r.id === rowId);
  if (!row || !row.driverId) return rows;

  const key = runKey(row);
  const ordered = rows.filter((r) => r.driverId && runKey(r) === key).sort(compareStops);
  const index = ordered.findIndex((r) => r.id === rowId);
  const swapWith = index + direction;
  if (index === -1 || swapWith < 0 || swapWith >= ordered.length) return rows;

  const reordered = [...ordered];
  [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];

  const positionById = new Map(reordered.map((r, i) => [r.id, i + 1]));
  return rows.map((r) => (positionById.has(r.id) ? { ...r, urutan: positionById.get(r.id)! } : r));
}
