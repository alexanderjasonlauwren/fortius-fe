/**
 * Schedule agreements, against the real API.
 *
 * This is also where the language boundary sits. The backend speaks English and
 * matches its own schema; the UI domain model is Indonesian (`nomorSA`,
 * `periodeMulai`, `sisaKuota`). Mapping here rather than renaming either side
 * keeps the backend consistent with its published contract and leaves every
 * component untouched — the direction technical-gaps 2.4 chose.
 */
import { getList, getOne, send, upload } from "@/lib/api";
import type { FilterSpec } from "@/lib/listQuery";
import { scopeKey } from "@/mocks/scope";
import type {
  SAImportApplied,
  SAImportBatch,
  SAImportChangeKind,
  SAImportDiff,
  SAImportSummary,
  SIM3LONApplied,
  SIM3LONApplyReview,
  SIM3LONPreview,
  SIM3LONReconciliationPreview,
  ScheduleAgreement,
  SAFilterParams,
  SAStatus,
  UploadSAPayload,
} from "../types";
import type { ScheduleAgreementApi } from "./contract";

/** Mirrors the backend's AgreementResponse exactly. */
interface AgreementResponse {
  id: string;
  sa_number: string;
  agreement_type: string;
  is_time_limited: boolean;
  supplier_name?: string;
  supplier_reference?: string;
  period_start: string;
  period_end: string;
  sa_status: string;
  offered_at?: string;
  redeem_by?: string;
  redeemed_at?: string;
  is_lapsed: boolean;
  source: string;
  total_quota_qty: number;
  allocated_quota_qty: number;
  used_quota_qty: number;
  products: AgreementProductQuota[];
  notes?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface AgreementProductQuota {
  product_id: string;
  product_name: string;
  total_quota_qty: number;
  allocated_quota_qty: number;
  used_quota_qty: number;
}

/** Mirrors the SIM3LON usecase's ImportSummaryResponse. */
interface ImportSummaryResponse {
  file_name?: string;
  supplier_name?: string;
  checksum_sha256?: string;
  imported_at?: string;
  outlets: Array<{
    registration_code: string;
    name: string;
    allocation_qty: number;
    normal_qty: number;
    fakultatif_qty: number;
    remaining_qty: number;
  }>;
}

/**
 * The backend's lifecycle mapped onto the console's four words.
 *
 * `amended` shows as Selesai because a superseded agreement is finished from
 * the agent's point of view — the replacement is the live one. `cancelled` is
 * deliberately absent: the list filters deleted rows out already, and a word
 * for a state nobody can reach is a word to explain.
 */
const STATUS_TO_DOMAIN: Record<string, SAStatus> = {
  draft: "Draft",
  active: "Aktif",
  completed: "Selesai",
  amended: "Selesai",
  cancelled: "Selesai",
};

/**
 * "Limit" is derived, not a backend state.
 *
 * The console shows an agreement as Limit when its quota is spoken for. The
 * backend has no such status because it is arithmetic, not a lifecycle step —
 * and storing it would need something to flip it the moment an allocation
 * changed.
 */
function statusOf(row: AgreementResponse): SAStatus {
  const mapped = STATUS_TO_DOMAIN[row.sa_status] ?? "Draft";
  if (mapped === "Aktif" && row.total_quota_qty > 0 && row.allocated_quota_qty >= row.total_quota_qty) {
    return "Limit";
  }
  return mapped;
}

/** Whole days until the period closes; negative once it has passed. */
function daysUntil(iso: string): number {
  const end = new Date(iso + "T00:00:00Z").getTime();
  const today = new Date();
  const midnight = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((end - midnight) / 86_400_000);
}

function toDomain(row: AgreementResponse): ScheduleAgreement {
  return {
    id: row.id,
    nomorSA: row.sa_number,
    supplier: row.supplier_name ?? "—",
    periodeMulai: row.period_start,
    periodeBerakhir: row.period_end,
    totalKuota: row.total_quota_qty,
    sudahDidistribusikan: row.used_quota_qty,
    sisaKuota: Math.max(0, row.total_quota_qty - row.used_quota_qty),
    status: statusOf(row),
    sisaHari: daysUntil(row.period_end),
    catatan: row.notes,
    // The uploaded document's name is not on the agreement: it belongs to the
    // import that carried it, and an agreement can have several. Left absent
    // rather than guessed at until the console reads import batches.
    namaDokumen: undefined,
    // The backend records WHO through created_by and does not publish it. What
    // it does publish is HOW, which is the more useful of the two here: a
    // figure the supplier stated and one the system derived are different
    // things, and only one of them settles an argument.
    diunggahOleh: row.source === "manual" ? "Entri manual" : row.source,
    diunggahPada: row.created_at,
    // Plans drawing on this agreement. Not exposed yet; 0 rather than a
    // fabricated count.
    jumlahRencana: 0,
    products: (row.products ?? []).map((p) => ({
      productId: p.product_id,
      productName: p.product_name,
      totalKuota: p.total_quota_qty,
      dialokasikan: p.allocated_quota_qty,
      terpakai: p.used_quota_qty,
      sisaKuota: Math.max(0, p.total_quota_qty - p.allocated_quota_qty),
    })),
  };
}

function toImportSummary(row: ImportSummaryResponse | null): SAImportSummary | null {
  if (!row) return null;
  return {
    namaBerkas: row.file_name,
    supplier: row.supplier_name,
    checksum: row.checksum_sha256,
    diimporPada: row.imported_at,
    outlets: (row.outlets ?? []).map((o) => ({
      registrationCode: o.registration_code,
      nama: o.name,
      alokasi: o.allocation_qty,
      normal: o.normal_qty,
      fakultatif: o.fakultatif_qty,
      sisa: o.remaining_qty,
    })),
  };
}

/** The console's status words, back to the backend's. */
const STATUS_TO_WIRE: Partial<Record<SAStatus, string>> = {
  Draft: "draft",
  Aktif: "active",
  Selesai: "completed",
};

/**
 * The branch an agreement is recorded against.
 *
 * The upload form does not ask, and for the client it does not need to: each PT
 * is a tenant with one branch — the pool the trucks load from — and
 * `core.branches.is_default` marks it. A tenant that grows a second site will
 * need the form to ask, and that is the moment to add the field rather than
 * now, when every answer would be the same one.
 */
async function defaultBranchID(): Promise<string> {
  const page = await getList<{ id: string; is_default: boolean }>("/branches", {
    pageSize: 100,
  });
  const preferred = page.items.find((b) => b.is_default) ?? page.items[0];
  if (!preferred) {
    throw new Error(
      "Tenant ini belum punya cabang, sehingga SA tidak bisa dicatat. Buat cabang lebih dulu.",
    );
  }
  return preferred.id;
}

/* ── Base SA imports ───────────────────────────────────────────────────── */

/** Mirrors the service's ParseResponse. */
interface ParseResponse {
  id: string;
  status: string;
  schedule_agreement_id: string;
  file_name: string;
  checksum_sha256: string;
  diff: DiffResponse;
}

interface DiffResponse {
  changes: {
    date: string;
    change: string;
    from?: number;
    to: number;
  }[];
  issues: { line: number; value?: string; reason: string }[];
  new: number;
  updated: number;
  unchanged: number;
  skipped: number;
}

interface ApplyResponse {
  id: string;
  status: string;
  rows_written: number;
}

interface SIM3LONPreviewResponse {
  id: string;
  status: string;
  duplicate: boolean;
  can_apply: boolean;
  period_month: string;
  file_name: string;
  checksum_sha256: string;
  outlet_count: number;
  matched_count: number;
  missing_outlets: Array<{ registration_code: string; name: string; reason: string }>;
  issues: Array<{ line: number; column?: string; value?: string; reason: string }>;
  totals: {
    allocation_qty: number;
    normal_qty: number;
    fakultatif_qty: number;
    remaining_qty: number;
    grand_total_qty: number;
  };
  changes: {
    allocation_changed: number;
    daily_changed: number;
    new_outlets: number;
    removed_outlets: number;
  };
}

interface SIM3LONApplyResponse {
  id: string;
  base_schedule_agreement_id: string;
  fakultatif_schedule_agreement_id?: string;
  outlet_targets_written: number;
  daily_targets_written: number;
}

interface SIM3LONReconciliationResponse {
  candidate_batch_id: string;
  expected_predecessor_batch_id: string | null;
  source_created_at: string;
  review_ready: boolean;
  expected_plan_versions: Array<{ plan_id: string; version: number; status: string }>;
  changes: Array<{
    plan_id?: string;
    outlet_id: string;
    product_id: string;
    operational_date: string;
    baseline_qty: number;
    current_qty: number | null;
    proposed_qty: number;
    classification: SIM3LONReconciliationPreview["changes"][number]["classification"];
    non_draft_discrepancy: boolean;
    crew_assignment_affected: boolean;
  }>;
  blockers: Array<{
    code: string;
    message: string;
    plan_id?: string;
    registration_code?: string;
  }>;
}

function toSIM3LONPreview(row: SIM3LONPreviewResponse): SIM3LONPreview {
  return {
    id: row.id,
    status: row.status,
    duplicate: row.duplicate,
    canApply: row.can_apply,
    month: row.period_month,
    fileName: row.file_name,
    checksum: row.checksum_sha256,
    outletCount: row.outlet_count,
    matchedCount: row.matched_count,
    missingOutlets: (row.missing_outlets ?? []).map((outlet) => ({
      registrationCode: outlet.registration_code,
      name: outlet.name,
      reason: outlet.reason,
    })),
    issues: row.issues ?? [],
    totals: {
      allocationQty: row.totals.allocation_qty,
      normalQty: row.totals.normal_qty,
      fakultatifQty: row.totals.fakultatif_qty,
      remainingQty: row.totals.remaining_qty,
      grandTotalQty: row.totals.grand_total_qty,
    },
    changes: {
      allocationChanged: row.changes.allocation_changed,
      dailyChanged: row.changes.daily_changed,
      newOutlets: row.changes.new_outlets,
      removedOutlets: row.changes.removed_outlets,
    },
  };
}

function toSIM3LONReconciliation(row: SIM3LONReconciliationResponse): SIM3LONReconciliationPreview {
  return {
    candidateBatchId: row.candidate_batch_id,
    expectedPredecessorBatchId: row.expected_predecessor_batch_id ?? null,
    sourceCreatedAt: row.source_created_at,
    reviewReady: row.review_ready,
    expectedPlanVersions: (row.expected_plan_versions ?? []).map((plan) => ({
      planId: plan.plan_id,
      version: plan.version,
      status: plan.status,
    })),
    changes: (row.changes ?? []).map((change) => ({
      planId: change.plan_id,
      outletId: change.outlet_id,
      productId: change.product_id,
      operationalDate: change.operational_date,
      baselineQty: change.baseline_qty,
      currentQty: change.current_qty ?? null,
      proposedQty: change.proposed_qty,
      classification: change.classification,
      nonDraftDiscrepancy: change.non_draft_discrepancy,
      crewAssignmentAffected: change.crew_assignment_affected,
    })),
    blockers: (row.blockers ?? []).map((blocker) => ({
      code: blocker.code,
      message: blocker.message,
      planId: blocker.plan_id,
      registrationCode: blocker.registration_code,
    })),
  };
}

function assertScope(originScope: readonly [string, string]): void {
  if (scopeKey().join("|") !== originScope.join("|")) {
    throw new Error("Tenant berubah. Muat ulang impor pada tenant yang sesuai.");
  }
}

/**
 * The service's three change words, in the console's.
 *
 * An unrecognised kind reads as `berubah` rather than being dropped: a row the
 * console cannot classify still moved a number, and hiding it would understate
 * what the import does.
 */
const CHANGE_TO_DOMAIN: Record<string, SAImportChangeKind> = {
  new: "baru",
  updated: "berubah",
  unchanged: "tetap",
};

function toDiff(wire: DiffResponse): SAImportDiff {
  return {
    perubahan: (wire.changes ?? []).map((c) => ({
      tanggal: c.date,
      jenis: CHANGE_TO_DOMAIN[c.change] ?? "berubah",
      dari: c.from,
      menjadi: c.to,
    })),
    // The reason text is the server's, passed through rather than translated.
    // A lookup keyed on English prose would silently fall back to the raw
    // string the first time the parser rephrased a message, which is worse than
    // showing the server's words consistently: the parser there is the
    // authority in this build, and what it says is what happened to the file.
    masalah: (wire.issues ?? []).map((i) => ({
      baris: i.line,
      nilai: i.value,
      alasan: i.reason,
    })),
    baru: wire.new,
    berubah: wire.updated,
    tetap: wire.unchanged,
    dilewati: wire.skipped,
  };
}

export const saApiHttp: ScheduleAgreementApi = {
  async getSAList(filters?: SAFilterParams): Promise<ScheduleAgreement[]> {
    const specs: FilterSpec[] = [];
    if (filters?.status && filters.status !== "Semua") {
      // Limit has no wire equivalent — it is derived from quota — so filtering
      // by it narrows to active and lets the mapper decide.
      const wire = STATUS_TO_WIRE[filters.status as SAStatus] ?? "active";
      specs.push({ field: "sa_status", operator: "eq", value: wire });
    }

    const page = await getList<AgreementResponse>("/schedule-agreements", {
      pageSize: 100,
      search: filters?.search,
      filters: specs,
    });

    let rows = page.items.map(toDomain);

    // Month and year are filtered here rather than on the wire: the backend
    // filters on sa_status and number, and adding a period filter for one
    // screen would put a query parameter in the contract that nothing else
    // wants. A hundred agreements is a page, not a scan.
    if (filters?.bulan || filters?.tahun) {
      rows = rows.filter((sa) => {
        const start = new Date(sa.periodeMulai + "T00:00:00Z");
        const monthOk = !filters.bulan || start.getUTCMonth() + 1 === filters.bulan;
        const yearOk = !filters.tahun || start.getUTCFullYear() === filters.tahun;
        return monthOk && yearOk;
      });
    }
    // Limit is derived after mapping, so it can only be filtered here.
    if (filters?.status === "Limit") {
      rows = rows.filter((sa) => sa.status === "Limit");
    }
    return rows;
  },

  async getSADetail(id: string): Promise<ScheduleAgreement> {
    return toDomain(await getOne<AgreementResponse>(`/schedule-agreements/${id}`));
  },

  async getImportSummary(id: string): Promise<SAImportSummary | null> {
    return toImportSummary(
      await getOne<ImportSummaryResponse | null>(`/schedule-agreements/${id}/import-summary`),
    );
  },

  async uploadSA(payload: UploadSAPayload): Promise<ScheduleAgreement> {
    // agreement_type is 'base' because that is what this form records — the
    // Base SA. Doping arrives with a deadline and needs the fields for one, so
    // it gets its own path rather than a checkbox here.
    const created = await send<AgreementResponse>("post", "/schedule-agreements", {
      sa_number: payload.nomorSA,
      agreement_type: "base",
      branch_id: await defaultBranchID(),
      supplier_name: payload.supplier,
      period_start: payload.periodeMulai,
      period_end: payload.periodeBerakhir,
      notes: payload.notes,
    });
    return toDomain(created);
  },

  async activateSA(id: string): Promise<ScheduleAgreement> {
    // The version is read first: activation is guarded by it, and sending a
    // stale one is how two people both think they activated an agreement.
    const current = await getOne<AgreementResponse>(`/schedule-agreements/${id}`);
    const updated = await send<AgreementResponse>(
      "post", `/schedule-agreements/${id}/activate`, { version: current.version });
    return toDomain(updated);
  },

  async deleteSA(id: string): Promise<void> {
    await send<null>("delete", `/schedule-agreements/${id}`);
  },

  async parseImport(saId: string, file: File): Promise<SAImportBatch> {
    const parsed = await upload<ParseResponse>(
      `/schedule-agreements/${saId}/imports`,
      file,
    );
    return {
      id: parsed.id,
      // Echoed by the service so the console can show what is about to change
      // without a second request.
      saId: parsed.schedule_agreement_id,
      namaBerkas: parsed.file_name,
      checksum: parsed.checksum_sha256,
      diff: toDiff(parsed.diff),
    };
  },

  async applyImport(batchId: string): Promise<SAImportApplied> {
    const applied = await send<ApplyResponse>("post", `/imports/${batchId}/apply`);
    return { id: applied.id, barisDitulis: applied.rows_written };
  },

  async previewSIM3LON(file: File, supplierName: string, productId: string): Promise<SIM3LONPreview> {
    const originScope = scopeKey();
    const branchId = await defaultBranchID();
    assertScope(originScope);
    const preview = await upload<SIM3LONPreviewResponse>(
      "/sim3lon-imports/preview",
      file,
      "file",
      60_000,
      { branch_id: branchId, product_id: productId, supplier_name: supplierName },
    );
    assertScope(originScope);
    return toSIM3LONPreview(preview);
  },

  async getSIM3LONReconciliation(batchId: string): Promise<SIM3LONReconciliationPreview> {
    const originScope = scopeKey();
    const preview = await getOne<SIM3LONReconciliationResponse>(
      `/sim3lon-imports/${batchId}/reconciliation-preview`,
    );
    assertScope(originScope);
    return toSIM3LONReconciliation(preview);
  },

  async applySIM3LON(batchId: string, review?: SIM3LONApplyReview): Promise<SIM3LONApplied> {
    const originScope = scopeKey();
    const body = review
      ? {
          expected_predecessor_batch_id: review.expectedPredecessorBatchId,
          accepted_plans: review.acceptedPlans.map((plan) => ({
            plan_id: plan.planId,
            expected_version: plan.expectedVersion,
          })),
        }
      : undefined;
    const applied = await send<SIM3LONApplyResponse>(
      "post",
      `/sim3lon-imports/${batchId}/apply`,
      body,
    );
    assertScope(originScope);
    return {
      id: applied.id,
      baseAgreementId: applied.base_schedule_agreement_id,
      fakultatifAgreementId: applied.fakultatif_schedule_agreement_id,
      outletTargetsWritten: applied.outlet_targets_written,
      dailyTargetsWritten: applied.daily_targets_written,
    };
  },

  async getSupplierOptions(): Promise<string[]> {
    const page = await getList<AgreementResponse>("/schedule-agreements", { pageSize: 100 });
    const seen = new Set<string>();
    for (const row of page.items) {
      if (row.supplier_name) seen.add(row.supplier_name);
    }
    return [...seen].sort();
  },
};
