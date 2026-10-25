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
  totalKuota: number;
  notes?: string;
  namaDokumen?: string;
}

/* ── Base SA daily targets, imported from a file ───────────────────────── */

/**
 * What one imported date would do to the record.
 *
 * `tetap` is reported rather than dropped: "28 of 31 unchanged" is what makes
 * the three that move stand out, and a diff listing only changes cannot say how
 * much of the month the file covered.
 */
export type SAImportChangeKind = "baru" | "berubah" | "tetap";

export interface SAImportChange {
  /** ISO date. */
  tanggal: string;
  jenis: SAImportChangeKind;
  /** The quantity on record. Absent when the agreement did not cover this date. */
  dari?: number;
  menjadi: number;
}

/**
 * A line the parser could not use.
 *
 * Collected rather than fatal: a sheet with one bad cell should still show the
 * other thirty dates and say which one needs attention.
 */
export interface SAImportIssue {
  /** 1-based line in the source file. */
  baris: number;
  nilai?: string;
  alasan: string;
}

export interface SAImportDiff {
  perubahan: SAImportChange[];
  masalah: SAImportIssue[];
  baru: number;
  berubah: number;
  tetap: number;
  dilewati: number;
}

/**
 * A parsed import that has written nothing.
 *
 * Applying it is a separate act, because counts alone are not enough to decide
 * with — the number that matters is whether the sheet moves the 24th from 350
 * to 300, which is what a penalty is argued from.
 */
export interface SAImportBatch {
  id: string;
  saId: string;
  namaBerkas: string;
  /** SHA-256 of the bytes read, so the file applied is the file reviewed. */
  checksum: string;
  diff: SAImportDiff;
}

export interface SAImportApplied {
  id: string;
  barisDitulis: number;
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
 * records per date; dates after today carry nothing yet.
 */
export interface QuotaSummary {
  periodMonth: string;
  /** `null` unless the month is the current one. */
  today: string | null;
  todayQty: number | null;
  days: Array<{ date: string; qty: number }>;
  allocationQty: number;
  deliveredQty: number;
  /** Negative when more was distributed than allocated. */
  remainingQty: number;
  outletCount: number;
  kinds: QuotaSummaryKind[];
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
