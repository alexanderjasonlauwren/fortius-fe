export type SAStatus = "Aktif" | "Selesai" | "Draf" | "Limit";

/**
 * One product's ceiling within the agreement.
 *
 * An agreement typed by hand, or not yet imported/applied, has none of these —
 * that is not missing data, it is an agreement with no product quota yet.
 */
export interface SAProductQuota {
  productId: string;
  productName: string;
  totalKuota: number;
  dialokasikan: number;
  terpakai: number;
  sisaKuota: number;
}

export interface ScheduleAgreement {
  id: string;
  nomorSA: string;
  supplier: string;
  /** ISO date — formatted at the point of display. */
  periodeMulai: string;
  periodeBerakhir: string;
  totalKuota: number;
  sudahDidistribusikan: number;
  sisaKuota: number;
  status: SAStatus;
  /** Days until the period closes; negative once it has passed. */
  sisaHari: number;
  catatan?: string;
  namaDokumen?: string;
  diunggahOleh: string;
  diunggahPada: string;
  /** Confirmed plans drawing on this agreement. */
  jumlahRencana: number;
  /** Per-product breakdown behind the totals above. See SAProductQuota. */
  products: SAProductQuota[];
}

/** One outlet's allocation as an import recorded it, for the detail screen. */
export interface SAImportedOutlet {
  registrationCode: string;
  nama: string;
  alokasi: number;
  normal: number;
  fakultatif: number;
  sisa: number;
  /**
   * Delivered before the branch's planning start date, per SIM3LON. Already
   * counted in the Base quota's allocated and used totals.
   */
  saldoAwal: number;
}

/**
 * What an agreement's import looked like, for checking it against the
 * document it came from. `null` when the agreement was typed by hand.
 */
export interface SAImportSummary {
  namaBerkas?: string;
  supplier?: string;
  checksum?: string;
  diimporPada?: string;
  outlets: SAImportedOutlet[];
}

export interface SAFilterParams {
  bulan?: number;
  tahun?: number;
  status?: SAStatus | "Semua";
  search?: string;
}

export interface UploadSAPayload {
  nomorSA: string;
  supplier: string;
  periodeMulai: string;
  periodeBerakhir: string;
  produkId: string;
  totalKuota: number;
  notes?: string;
  namaDokumen?: string;
}

export interface SIM3LONTotals {
  allocationQty: number;
  normalQty: number;
  fakultatifQty: number;
  remainingQty: number;
  grandTotalQty: number;
}

export interface SIM3LONMissingOutlet {
  registrationCode: string;
  name: string;
  reason: string;
}

export interface SIM3LONPreview {
  id: string;
  status: string;
  duplicate: boolean;
  canApply: boolean;
  month: string;
  fileName: string;
  checksum: string;
  outletCount: number;
  matchedCount: number;
  missingOutlets: SIM3LONMissingOutlet[];
  issues: Array<{ line: number; column?: string; value?: string; reason: string }>;
  totals: SIM3LONTotals;
  changes: {
    allocationChanged: number;
    dailyChanged: number;
    newOutlets: number;
    removedOutlets: number;
  };
}

export interface SIM3LONApplied {
  id: string;
  baseAgreementId: string;
  fakultatifAgreementId?: string;
  outletTargetsWritten: number;
  dailyTargetsWritten: number;
}

export type SIM3LONChangeClassification =
  | "increase"
  | "decrease"
  | "zero"
  | "removed"
  | "unchanged"
  | "local_conflict"
  /** Before the planning start date: moves the opening balance, never a plan. */
  | "pre_cutover";

export interface SIM3LONReconciliationPlanVersion {
  planId: string;
  version: number;
  status: string;
}

export interface SIM3LONReconciliationChange {
  planId?: string;
  outletId: string;
  productId: string;
  operationalDate: string;
  baselineQty: number;
  currentQty: number | null;
  proposedQty: number;
  classification: SIM3LONChangeClassification;
  nonDraftDiscrepancy: boolean;
  crewAssignmentAffected: boolean;
}

export interface SIM3LONReconciliationBlocker {
  code: string;
  message: string;
  planId?: string;
  registrationCode?: string;
}

export interface SIM3LONReconciliationPreview {
  candidateBatchId: string;
  expectedPredecessorBatchId: string | null;
  sourceCreatedAt: string;
  reviewReady: boolean;
  expectedPlanVersions: SIM3LONReconciliationPlanVersion[];
  changes: SIM3LONReconciliationChange[];
  blockers: SIM3LONReconciliationBlocker[];
  /** Set when the branch's planning start date falls in or after this month. */
  planningStartDate: string | null;
  /** How far applying moves the Base quota's opening balance. */
  openingBalanceDelta: number;
  /** Delivered or dispatched dates the new source disagrees with. */
  varianceCount: number;
}

/** One outlet's opening balance before and after a planning cutover. */
export interface PlanningCutoverOutlet {
  outletId: string;
  openingBefore: number;
  openingAfter: number;
}

/** One product-month whose Base quota a cutover moves. */
export interface PlanningCutoverScope {
  batchId: string;
  productId: string;
  periodMonth: string;
  quotaTotal: number;
  allocatedBefore: number;
  allocatedAfter: number;
  usedBefore: number;
  usedAfter: number;
  openingBefore: number;
  openingAfter: number;
  /** Pre-go-live revenue in the ledger for this month, PPN included. */
  revenueBefore: number;
  revenueAfter: number;
  outlets: PlanningCutoverOutlet[];
}

/**
 * The dry-run report of setting a branch's planning start date, or the result
 * once applied.
 */
export interface PlanningCutoverReport {
  branchId: string;
  currentPlanningStartDate: string | null;
  planningStartDate: string;
  dryRun: boolean;
  applied: boolean;
  scopes: PlanningCutoverScope[];
  blockers: SIM3LONReconciliationBlocker[];
  /** Do not stop the cutover, but will stop the next re-upload. */
  warnings: SIM3LONReconciliationBlocker[];
}

export type SIM3LONVarianceKind = "over" | "under" | "unplanned" | "extra";

/** One outlet-date where the latest SIM3LON disagrees with committed plans. */
export interface SIM3LONVarianceRow {
  outletId: string;
  outletCode: string;
  outletName: string;
  date: string;
  sim3lonQty: number;
  committedQty: number;
  deliveredQty: number;
  /** SIM3LON minus committed: negative means more was sent than SIM3LON states. */
  variance: number;
  kind: SIM3LONVarianceKind;
}

/** One agreement kind's share of a branch's monthly quota. */
export interface QuotaSummaryKind {
  code: string;
  name: string;
  totalQty: number;
}

/**
 * A branch's quota for one month. Daily quantities are what SIM3LON Penyaluran
 * records per date. A date after today can already carry a quantity: SIM3LON
 * holds the schedule ahead, so that figure is scheduled, not yet distributed,
 * and `deliveredQty` stops at today.
 */
export interface QuotaSummary {
  periodMonth: string;
  /** `null` unless the month is the current one. */
  today: string | null;
  todayQty: number | null;
  /** `referenceQty` is the Acuan Base SA's figure for the date; `null` with no PDF. */
  days: Array<{ date: string; qty: number; referenceQty: number | null }>;
  allocationQty: number;
  deliveredQty: number;
  /** Negative when more was distributed than allocated. */
  remainingQty: number;
  outletCount: number;
  kinds: QuotaSummaryKind[];
  /**
   * The month's Acuan Base SA total: the SPBE's baseline, read beside the
   * SIM3LON allocation and never instead of it. `null` when nobody uploaded
   * the month's PDF.
   */
  referenceQty: number | null;
  /** `referenceQty` less `deliveredQty`; negative once delivery passes it. */
  referenceRemainingQty: number | null;
  todayReferenceQty: number | null;
}

/** One SPBE row of an Acuan Base SA. `days[0]` is the 1st of the month. */
export interface BaseReferenceRow {
  supplierName: string;
  days: number[];
  totalQty: number;
}

/**
 * The SPBE's monthly Acuan Base SA PDF, as read: an upload waiting to be saved
 * (`parsed`) or the month's baseline in force (`applied`).
 */
export interface BaseReference {
  id: string;
  status: string;
  periodMonth: string;
  fileName: string;
  rows: BaseReferenceRow[];
  totalQty: number;
  appliedAt: string | null;
  appliedBy: string | null;
  /** On a preview, the total of the baseline saving it would replace. */
  currentTotalQty: number | null;
}

export interface SIM3LONVarianceReport {
  batchId: string | null;
  planningStartDate: string | null;
  rows: SIM3LONVarianceRow[];
  totalVariance: number;
}

export interface SIM3LONApplyReview {
  expectedPredecessorBatchId: string | null;
  acceptedPlans: Array<{ planId: string; expectedVersion: number }>;
}

export interface SIM3LONLiveCandidate {
  id: string;
  period: string;
  fetchedAt: string;
  status: string;
  duplicate: boolean;
  checksum: string;
  outletCount: number;
  appliedToSA: boolean;
  reviewReason?: string;
}
