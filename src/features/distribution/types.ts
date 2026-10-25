export type PlanStatus = "Draf" | "Terkonfirmasi" | "Selesai" | "Batal";

export interface DistributionPlan {
  branchId?: string;
  id: string;
  kode: string;
  /** ISO date. */
  tanggal: string;
  totalUnit: number;
  jumlahOutlet: number;
  jumlahDriver: number;
  status: PlanStatus;
  saId: string;
  nomorSA: string;
  /** Quota left on the backing agreement, so the planner can see the ceiling. */
  sisaKuotaSA: number;
  catatan?: string;
  dibuatOleh: string;
  dikonfirmasiOleh?: string;
  dikonfirmasiPada?: string;
  /**
   * The optimistic-locking counter the caller must echo back to save, assign,
   * confirm or cancel.
   *
   * Without it there is nothing to detect a concurrent edit against, and the
   * service refuses a write built on a stale value with 409 rather than
   * overwriting whatever the other planner committed. The mock build has one
   * writer and carries a constant.
   */
  version: number;
}

export interface PlanRow {
  id: string;
  outletId: string;
  outlet: string;
  alamat: string;
  /** What this stop is carrying, per product. */
  lines: { productId: string; jumlah: number }[];
  /** Derived from `lines`. */
  jumlahUnit: number;
  driverId: string | null;
  driver: string;
  /**
   * The truck for this stop's run. Null until one is chosen.
   *
   * Capacity lives here rather than on the driver: a driver has no capacity of
   * their own, and which truck they take is a fact about today. The service
   * requires it — `dispatch_trips.vehicle_id` is NOT NULL — so a board without
   * it cannot be applied.
   */
  vehicleId: string | null;
  vehicle: string;
  jamPengiriman: string;
  /**
   * "Kredit" is its own state, not a flavour of "Lunas" -- an on-account
   * stop has not been paid, it has been APPROVED to go out unpaid, and
   * collapsing the two hid that distinction from suggestAssignment's
   * at-risk load calculation (a stop excluded from risk because it happened
   * to read "Lunas" was excluded for the wrong reason). See
   * fortius-backend's payment_state = 'credit'.
   */
  statusBayar: "Lunas" | "Belum Lunas" | "Kredit";
  /** Cylinders this outlet may still take this month. */
  sisaKuotaOutlet: number;
  /** Outstanding receivable, so credit risk is visible while planning. */
  piutang: number;
  piutangJatuhTempo: number;
  /** The depot cycle this stop belongs to. Null until it is assigned. */
  tripNo: number | null;
  /**
   * Position within its run, 1-based. Null when the stop has not been placed
   * (unassigned, or just moved to another run) — such a stop goes last.
   */
  urutan?: number | null;
  /** Set when this stop would be refused on confirmation. */
  alasanBlokir?: string;
  /**
   * The run this stop's trip actually posts against once assigned — an
   * opaque id, not a display value. On the API build this is the real
   * `dispatch_trips.id` a saved board carries; the mock has no trips table
   * at all, so it synthesises the same `driverId#tripNo` key the planner
   * already groups rows by. Null until a driver and trip number are both
   * set, since neither build can name a run before then.
   */
  tripId?: string | null;
  /**
   * The trip's own status, when known (`"planned"`, `"dispatched"`, …).
   * Absent on the mock build, which does not persist per-trip dispatch
   * state — see `dispatchTrip`'s own header comment.
   */
  tripStatus?: string;
  /**
   * When this stop's run leaves the pool, "HH:MM" -- one value per trip,
   * carried on every row of it the same way `vehicle` is. An estimate the
   * service computes from distance and a fixed speed (see fortius-backend's
   * `Timing`), not a promise; null until a departure has been set or
   * suggested.
   */
  berangkat?: string | null;
}

/**
 * One outlet's SIM3LON-planned allocation for a single date -- what a new
 * plan's stops are pre-filled from, instead of a manually-added, wrongly-
 * defaulted row. Absent entirely for an SA typed by hand, or a date its
 * import never covered.
 */
export interface SAOutletPlanRow {
  outletId: string;
  outlet: string;
  productId: string;
  productName: string;
  jumlah: number;
}

export interface PlanOption {
  id: string;
  label: string;
  sublabel?: string;
  disabled?: boolean;
}

/** A truck the dispatcher can put a run on. */
export interface VehicleOption extends PlanOption {
  /** Units one load holds. The ceiling a trip is judged against. */
  kapasitas: number;
}

export interface DriverOption extends PlanOption {
  kapasitas: number;
  /** Cylinders already loaded onto this truck in the open plan. */
  muatan: number;
  status: string;
}

/**
 * A trip is one depot cycle: load at the pool, visit several outlets, return.
 *
 * It is the unit capacity applies to, which is why the panel groups by it
 * rather than by driver -- a driver who reloads at midday does two trips, and
 * summing both against one truckload reports an overload that is not real.
 *
 * Null on a row that has not been assigned yet. `driverId` without `tripNo` is
 * the shape the console had before trips existed, and it still loads: such a
 * row is shown as trip 1 for that driver.
 */
export type TripNo = number;

export interface SuggestedStop {
  outletId: string;
  outlet: string;
  jumlahUnit: number;
  /** Position within the trip, 1-based. */
  urutan: number;
  /** False when no payment has arrived for this stop. Flagged, never hidden. */
  lunas: boolean;
  /**
   * Estimated arrival, "HH:MM". Absent from the mock, which has no
   * coordinates to estimate travel time from -- see suggestAssignment.ts's
   * own DASAR_KAPASITAS note.
   */
  eta?: string;
}

export interface SuggestedTrip {
  tripNo: TripNo;
  driverId: string;
  driver: string;
  /** The truck the proposal put this run on, where the source knows one. */
  vehicleId?: string;
  /** Plate and vehicle, as the driver options carry them. */
  armada: string;
  kapasitas: number;
  muatan: number;
  /** Cylinders on this trip with no payment behind them yet. */
  muatanBerisiko: number;
  stops: SuggestedStop[];
  /** Estimated departure, "HH:MM". Absent from the mock; see SuggestedStop.eta. */
  berangkat?: string;
}

/** A stop the planner could not place, and why. Never a silent drop. */
export interface UnroutableStop {
  outletId: string;
  outlet: string;
  jumlahUnit: number;
  alasan: string;
}

export interface AssignmentSuggestion {
  trips: SuggestedTrip[];
  unroutable: UnroutableStop[];
  /**
   * What the proposal is based on, in the planner's own words.
   *
   * The mock has no outlet coordinates, so it can propose which stops share a
   * truck and never what order to drive them in. The service can do both. The
   * panel prints this rather than asserting a quality neither adapter promised.
   */
  dasar: string;
}

/** Workbook-shaped monthly allocation view: pangkalan down, dates across. */
export interface DistributionMonthGrid {
  month: string;
  dates: string[];
  rows: {
    outletId: string;
    outletCode: string;
    outletName: string;
    cells: Record<string, number>;
    targetQty: number;
    total: number;
    remainingQty: number;
  }[];
  footer: {
    date: string;
    planned: number;
    required: number;
    hasTarget: boolean;
    shortfall: number;
  }[];
  totals: { planned: number; required: number; shortfall: number; outlets: number };
}

export interface DistributionPaymentBoard {
  date: string;
  cutoff: string;
  timezone: string;
  rows: {
    outletId: string;
    outletCode: string;
    outletName: string;
    plannedQty: number;
    fundedQty: number;
    unpaidQty: number;
    creditQty: number;
    deliveredQty: number;
    /** Rupiah pair mirroring plannedQty/fundedQty. hasUnpricedLine flags why
     *  they can under-report: a line with no unit_price contributes 0 to
     *  either sum instead of failing the whole board. */
    plannedAmount: number;
    fundedAmount: number;
    hasUnpricedLine: boolean;
    /** Which plan Alokasikan/Lepas would act on. planCount > 1 is the anomaly the
     *  console must refuse to guess through -- disable both actions and say
     *  why rather than picking one plan silently. */
    distributionOrderId: string;
    planCount: number;
    /** The receipt currently funding this stop, if any -- what Lepas acts
     *  on. Set even before the receipt is verified (see fundedAmount, which
     *  only counts a verified one). */
    fundingPaymentId?: string;
    fundingPaymentNumber?: string;
    state: "paid" | "partial" | "unpaid" | "credit";
    lastPaymentAt?: string;
    late?: boolean;
    hasUnverifiedPayment: boolean;
  }[];
  summary: {
    required: number;
    hasTarget: boolean;
    planned: number;
    funded: number;
    unpaid: number;
    delivered: number;
    shortfall: number;
    outlets: number;
    paidOutlets: number;
    lateOutlets: number;
  };
}
