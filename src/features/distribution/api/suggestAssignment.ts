/**
 * Proposes which stops share a truck, for the demo build.
 *
 * A pure function over the rows already on screen: no database, no clock, no
 * network. That is deliberate -- the panel calls it while the planner is still
 * editing an unsaved draft, so anything requiring a round trip would only be
 * able to suggest against yesterday's saved state.
 *
 * **What this deliberately does not do is route.** The mock has no outlet
 * coordinates, so there is no distance to minimise and no honest way to order
 * the stops within a trip; it packs by capacity and orders by delivery hour,
 * which is the order the planner already typed. The service's planner does the
 * real thing -- Clarke-Wright savings over real coordinates -- and when the
 * distribution HTTP adapter lands it replaces this, not the panel around it.
 *
 * Saying so in `dasar` rather than presenting both as "the suggestion" is the
 * whole point: a proposal that claims a quality it does not have is worse than
 * no proposal, because the dispatcher stops checking it.
 */
import type {
  AssignmentSuggestion,
  DriverOption,
  PlanRow,
  SuggestedStop,
  SuggestedTrip,
} from "../types";

export const DASAR_KAPASITAS =
  "Disusun dari kapasitas armada dan jam kirim yang Anda isi. Belum memperhitungkan jarak antar titik.";

/** No driver has room for this stop on any remaining trip. */
export const ALASAN_KAPASITAS = "Tidak ada armada dengan sisa muatan yang cukup";
/** The stop is bigger than the biggest truck, so no packing can place it. */
export const ALASAN_TERLALU_BESAR = "Muatan melebihi kapasitas armada terbesar";
/** There is no fleet to place it on at all. */
export const ALASAN_TANPA_ARMADA = "Belum ada sopir yang tersedia";

/**
 * How many depot cycles one driver may do in a day.
 *
 * Not 1: the client's drivers load at the pool, run a set of outlets and come
 * back for more, and a planner that assumes one truckload per day refuses work
 * the fleet can actually carry.
 */
const MAX_TRIP_PER_DRIVER = 3;

interface Bin {
  driver: DriverOption;
  tripNo: number;
  sisa: number;
  stops: SuggestedStop[];
  muatan: number;
  muatanBerisiko: number;
}

export function suggestAssignment(
  rows: PlanRow[],
  drivers: DriverOption[],
): AssignmentSuggestion {
  const available = drivers
    .filter((d) => !d.disabled && d.kapasitas > 0)
    // Largest truck first: a big stop placed early has somewhere to go, and the
    // small ones fill in around it. The reverse strands every large stop.
    //
    // Stable, with the id as the final tie-break, because two trucks of equal
    // capacity must not swap places between two runs of the same input -- a
    // dispatcher re-pressing the button and getting a reshuffled board stops
    // trusting the board.
    .slice()
    .sort((a, b) => b.kapasitas - a.kapasitas || a.id.localeCompare(b.id));

  const largest = available.reduce((m, d) => Math.max(m, d.kapasitas), 0);

  // Bins are created lazily, one trip at a time, so a fleet of five trucks
  // running one stop each does not report five half-empty trips.
  const bins: Bin[] = [];
  const unroutable: AssignmentSuggestion["unroutable"] = [];

  // Heaviest stop first, then by the hour the planner typed, then by outlet id.
  // The last term is what makes the result identical for reordered input.
  const queue = rows
    .slice()
    .sort(
      (a, b) =>
        b.jumlahUnit - a.jumlahUnit ||
        a.jamPengiriman.localeCompare(b.jamPengiriman) ||
        a.outletId.localeCompare(b.outletId),
    );

  for (const row of queue) {
    if (available.length === 0) {
      unroutable.push(reject(row, ALASAN_TANPA_ARMADA));
      continue;
    }
    if (row.jumlahUnit > largest) {
      unroutable.push(reject(row, ALASAN_TERLALU_BESAR));
      continue;
    }

    const bin = fittingBin(bins, row.jumlahUnit) ?? openBin(bins, available, row.jumlahUnit);
    if (!bin) {
      unroutable.push(reject(row, ALASAN_KAPASITAS));
      continue;
    }

    bin.stops.push({
      outletId: row.outletId,
      outlet: row.outlet,
      jumlahUnit: row.jumlahUnit,
      urutan: bin.stops.length + 1,
      lunas: row.statusBayar === "Lunas",
    });
    bin.muatan += row.jumlahUnit;
    bin.sisa -= row.jumlahUnit;
    // Unpaid stops are carried and flagged, per the client's instruction: the
    // dispatcher needs to see what the day looks like if payment lands and what
    // to drop if it does not. A credit stop is not this kind of risk -- it was
    // approved to go out unpaid, not left unpaid -- so only "Belum Lunas"
    // counts here, not "Kredit" alongside it.
    if (row.statusBayar === "Belum Lunas") bin.muatanBerisiko += row.jumlahUnit;
  }

  const trips: SuggestedTrip[] = bins
    .filter((b) => b.stops.length > 0)
    .map((b) => ({
      tripNo: b.tripNo,
      driverId: b.driver.id,
      driver: b.driver.label,
      armada: b.driver.sublabel ?? "",
      kapasitas: b.driver.kapasitas,
      muatan: b.muatan,
      muatanBerisiko: b.muatanBerisiko,
      stops: b.stops,
    }));

  return { trips, unroutable, dasar: DASAR_KAPASITAS };
}

function reject(row: PlanRow, alasan: string) {
  return {
    outletId: row.outletId,
    outlet: row.outlet,
    jumlahUnit: row.jumlahUnit,
    alasan,
  };
}

/** First bin with room, in the order they were opened. */
function fittingBin(bins: Bin[], qty: number): Bin | undefined {
  return bins.find((b) => b.sisa >= qty);
}

/**
 * Opens the next trip, preferring a driver's first cycle over a second one.
 *
 * A driver already out on trip 1 can take trip 2, but only once every driver
 * has a trip -- otherwise one driver does three runs while three trucks sit at
 * the pool.
 */
function openBin(bins: Bin[], drivers: DriverOption[], qty: number): Bin | undefined {
  for (let cycle = 1; cycle <= MAX_TRIP_PER_DRIVER; cycle += 1) {
    for (const driver of drivers) {
      const used = bins.filter((b) => b.driver.id === driver.id).length;
      if (used !== cycle - 1) continue;
      if (driver.kapasitas < qty) continue;
      const bin: Bin = {
        driver,
        tripNo: cycle,
        sisa: driver.kapasitas,
        stops: [],
        muatan: 0,
        muatanBerisiko: 0,
      };
      bins.push(bin);
      return bin;
    }
  }
  return undefined;
}
