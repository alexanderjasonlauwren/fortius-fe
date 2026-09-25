export type SAStatus = "Aktif" | "Selesai" | "Draft" | "Limit";

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
  | "local_conflict";

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
}

export interface SIM3LONApplyReview {
  expectedPredecessorBatchId: string | null;
  acceptedPlans: Array<{ planId: string; expectedVersion: number }>;
}
