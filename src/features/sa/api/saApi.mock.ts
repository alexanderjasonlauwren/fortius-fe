/**
 * Schedule agreements, against the mock database.
 *
 * Unchanged behaviour: this is the file the demo has always run on, moved
 * behind a contract so an HTTP adapter can sit beside it.
 */
import { getActiveScope, scopeKey, scopedDb } from "@/mocks/scope";
import { ApiError, latency, mutate, nextId, recordAudit } from "@/mocks/db";
import {
  activateScheduleAgreement,
  applySaImport,
  createScheduleAgreement,
  deleteScheduleAgreement,
  recordSaImport,
} from "@/mocks/rules";
import { buildTargetDiff, parseTargetCsv, PESAN_TANPA_BARIS } from "./targetImport";
import { startOfToday } from "@/mocks/seed";
import type {
  Database,
  PlanEntity,
  PlanRowEntity,
  SAEntity,
  SIM3LONSourceSnapshotEntity,
} from "@/mocks/types";
import type {
  SAImportApplied,
  SAImportBatch,
  SAImportSummary,
  SIM3LONApplied,
  SIM3LONApplyReview,
  SIM3LONPreview,
  SIM3LONReconciliationBlocker,
  SIM3LONReconciliationChange,
  SIM3LONReconciliationPreview,
  ScheduleAgreement,
  SAFilterParams,
  UploadSAPayload,
} from "../types";

function daysUntil(iso: string): number {
  const target = new Date(iso).getTime();
  return Math.round((target - startOfToday().getTime()) / 86_400_000);
}

function toView(sa: SAEntity, planCount: number): ScheduleAgreement {
  return {
    id: sa.id,
    nomorSA: sa.nomorSA,
    supplier: sa.supplier,
    periodeMulai: sa.periodeMulai,
    periodeBerakhir: sa.periodeBerakhir,
    totalKuota: sa.totalKuota,
    sudahDidistribusikan: sa.terpakai,
    sisaKuota: Math.max(0, sa.totalKuota - sa.terpakai),
    status: sa.status,
    sisaHari: daysUntil(sa.periodeBerakhir),
    catatan: sa.catatan,
    namaDokumen: sa.namaDokumen,
    diunggahOleh: sa.diunggahOleh,
    diunggahPada: sa.diunggahPada,
    jumlahRencana: planCount,
    products: sa.productId
      ? [
          {
            productId: sa.productId,
            productName: sa.productName ?? "Produk",
            totalKuota: sa.totalKuota,
            dialokasikan: sa.dialokasikan,
            terpakai: sa.terpakai,
            sisaKuota: Math.max(0, sa.totalKuota - sa.dialokasikan),
          },
        ]
      : [],
  };
}

async function getSAList(
  filters?: SAFilterParams,
): Promise<ScheduleAgreement[]> {
  await latency("read");
  const db = scopedDb();

  return db.scheduleAgreements
    .map((sa) =>
      toView(
        sa,
        db.plans.filter((p) => p.saId === sa.id && p.status !== "Batal").length,
      ),
    )
    .filter((sa) => {
      if (filters?.status && filters.status !== "Semua" && sa.status !== filters.status)
        return false;
      if (filters?.bulan != null || filters?.tahun != null) {
        const start = new Date(sa.periodeMulai);
        if (filters.bulan != null && start.getMonth() + 1 !== filters.bulan) return false;
        if (filters.tahun != null && start.getFullYear() !== filters.tahun) return false;
      }
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        if (
          !sa.nomorSA.toLowerCase().includes(q) &&
          !sa.supplier.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    })
    .sort((a, b) => b.periodeMulai.localeCompare(a.periodeMulai));
}

async function getSADetail(id: string): Promise<ScheduleAgreement> {
  await latency("read");
  const db = scopedDb();
  const sa = db.scheduleAgreements.find((s) => s.id === id);
  if (!sa) throw new Error("Schedule Agreement tidak ditemukan.");
  return toView(sa, db.plans.filter((p) => p.saId === sa.id).length);
}

async function uploadSA(
  payload: UploadSAPayload,
): Promise<ScheduleAgreement> {
  await latency("upload");
  const sa = createScheduleAgreement({
    nomorSA: payload.nomorSA,
    supplier: payload.supplier,
    periodeMulai: payload.periodeMulai,
    periodeBerakhir: payload.periodeBerakhir,
    totalKuota: payload.totalKuota,
    catatan: payload.notes,
    namaDokumen: payload.namaDokumen,
  });
  return toView(sa, 0);
}

async function activateSA(id: string): Promise<ScheduleAgreement> {
  await latency("write");
  return toView(activateScheduleAgreement(id), 0);
}

async function deleteSA(id: string): Promise<void> {
  await latency("write");
  deleteScheduleAgreement(id);
}

/**
 * Supply sources available when registering a new agreement. Comes from the
 * master list in Konfigurasi Sistem, falling back to whatever historical
 * agreements reference so nothing disappears from an existing database.
 */
async function getSupplierOptions(): Promise<string[]> {
  await latency("read");
  const db = scopedDb();
  const master = db.suppliers.filter((s) => s.aktif).map((s) => s.nama);
  const historical = db.scheduleAgreements.map((s) => s.supplier);
  return [...new Set([...master, ...historical])].sort();
}

/* ── Base SA imports ───────────────────────────────────────────────────── */

/**
 * The largest file this will read.
 *
 * The same 4 MiB the service allows, and for the same reason: a month of dated
 * quantities is a few kilobytes, so anything approaching this is not the file
 * the person means to upload.
 */
const MAKS_UKURAN = 4 << 20;

async function parseImport(saId: string, file: File): Promise<SAImportBatch> {
  await latency("upload");

  if (file.size > MAKS_UKURAN) {
    throw new Error(
      `Berkas lebih besar dari ${MAKS_UKURAN >> 20} MB, jauh di atas ukuran satu bulan tanggal dan jumlah.`,
    );
  }

  const text = await file.text();
  const parsed = parseTargetCsv(text);
  if (parsed.rows.length === 0) {
    // Distinct from a parse failure: a file of headers only is well-formed and
    // useless, and "0 rows" is more actionable than "invalid file".
    throw new Error(PESAN_TANPA_BARIS);
  }

  const db = scopedDb();
  const existing = new Map(
    db.saDailyTargets.filter((t) => t.saId === saId).map((t) => [t.tanggal, t.target]),
  );

  const batch = recordSaImport({
    saId,
    namaBerkas: file.name,
    checksum: await checksum(file),
    rows: parsed.rows.map((r) => ({ tanggal: r.tanggal, target: r.target })),
  });

  return {
    id: batch.id,
    saId,
    namaBerkas: batch.namaBerkas,
    checksum: batch.checksum,
    diff: buildTargetDiff(parsed, existing),
  };
}

async function applyImport(batchId: string): Promise<SAImportApplied> {
  await latency("write");
  const batch = applySaImport(batchId);
  return { id: batch.id, barisDitulis: batch.barisDitulis };
}

async function previewSIM3LON(file: File, supplierName: string, productId: string): Promise<SIM3LONPreview> {
  void file;
  void supplierName;
  void productId;
  throw new Error("Impor XLSX SIM3LON hanya tersedia saat dashboard terhubung ke API.");
}

function sourceKey(outletId: string, date: string): string {
  return `${outletId}|${date}`;
}

function sameScope(left: readonly string[], right: readonly string[]): boolean {
  return left.join("|") === right.join("|");
}

function classifySourceChange(
  baseline: number,
  current: number,
  proposed: number,
  hadBaseline: boolean,
  hasProposed: boolean,
): SIM3LONReconciliationChange["classification"] {
  if (current !== baseline && current !== proposed) return "local_conflict";
  if (hadBaseline && !hasProposed) return "removed";
  if (proposed === 0 && baseline > 0) return "zero";
  if (current === proposed) return "unchanged";
  if (proposed > baseline) return "increase";
  if (proposed < baseline) return "decrease";
  return "unchanged";
}

function deduplicateBlockers(
  blockers: SIM3LONReconciliationBlocker[],
): SIM3LONReconciliationBlocker[] {
  const unique = new Map<string, SIM3LONReconciliationBlocker>();
  for (const blocker of blockers) {
    const key = [blocker.code, blocker.message, blocker.planId, blocker.registrationCode].join("|");
    unique.set(key, blocker);
  }
  return [...unique.values()].sort((left, right) =>
    `${left.code}|${left.planId ?? ""}`.localeCompare(`${right.code}|${right.planId ?? ""}`),
  );
}

function latestPredecessor(
  db: Database,
  candidate: SIM3LONSourceSnapshotEntity,
): SIM3LONSourceSnapshotEntity | undefined {
  return db.sim3lonSourceSnapshots
    .filter((source) =>
      source.batchId !== candidate.batchId &&
      source.tenantId === candidate.tenantId &&
      source.branchId === candidate.branchId &&
      source.productId === candidate.productId &&
      source.periodMonth === candidate.periodMonth &&
      source.status === "applied",
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
}

function sourceDemand(source?: SIM3LONSourceSnapshotEntity): Map<string, number> {
  const demand = new Map<string, number>();
  for (const row of source?.rows ?? []) {
    const key = sourceKey(row.outletId, row.date);
    demand.set(key, (demand.get(key) ?? 0) + row.qty);
  }
  return demand;
}

function sourceWriteCounts(source: SIM3LONSourceSnapshotEntity): {
  outletTargetsWritten: number;
  dailyTargetsWritten: number;
} {
  return {
    outletTargetsWritten: new Set(source.rows.map((row) => row.outletId)).size,
    dailyTargetsWritten: new Set(source.rows.map((row) => row.date)).size,
  };
}

function buildMockReconciliation(
  db: Database,
  candidate: SIM3LONSourceSnapshotEntity,
): SIM3LONReconciliationPreview {
  const predecessor = latestPredecessor(db, candidate);
  const baseline = sourceDemand(predecessor);
  const proposed = sourceDemand(candidate);
  const blockers: SIM3LONReconciliationBlocker[] = [];

  if (!candidate.complete) {
    blockers.push({ code: "candidate_incomplete", message: "Snapshot kandidat belum lengkap." });
  }
  const sourceRows = new Set<string>();
  for (const row of candidate.rows) {
    const key = sourceKey(row.outletId, row.date);
    if (sourceRows.has(key)) {
      blockers.push({
        code: "snapshot_duplicate",
        message: "Sumber memuat pangkalan dan tanggal yang sama lebih dari sekali.",
        registrationCode: row.outletId,
      });
    }
    sourceRows.add(key);
  }
  const validOutletIds = new Set(
    db.outlets
      .filter((outlet) =>
        outlet.tenantId === candidate.tenantId && outlet.branchId === candidate.branchId,
      )
      .map((outlet) => outlet.id),
  );
  for (const row of candidate.rows) {
    if (!validOutletIds.has(row.outletId)) {
      blockers.push({
        code: "outlet_mapping_incomplete",
        message: "Pangkalan sumber tidak terpetakan pada cabang ini.",
        registrationCode: row.outletId,
      });
    }
  }

  const planSources = db.sim3lonPlanSources.filter((source) =>
    source.tenantId === candidate.tenantId &&
    source.branchId === candidate.branchId &&
    source.productId === candidate.productId &&
    source.operationalDate.startsWith(candidate.periodMonth),
  );
  const plansInScope = db.plans.filter((plan) =>
    plan.tenantId === candidate.tenantId &&
    plan.branchId === candidate.branchId &&
    plan.tanggal.startsWith(candidate.periodMonth),
  );
  const sourceByPlanId = new Map(planSources.map((source) => [source.planId, source]));
  const plansWithAnySource = new Set(db.sim3lonPlanSources.map((source) => source.planId));
  const relevantPlans = plansInScope.filter((plan) =>
    sourceByPlanId.has(plan.id) ||
    (!plansWithAnySource.has(plan.id) && db.planRows
      .filter((row) => row.planId === plan.id)
      .some((row) => row.lines.some((line) => line.productId === candidate.productId))),
  );
  const plansByDate = new Map<string, PlanEntity[]>();
  for (const plan of relevantPlans) {
    const rows = plansByDate.get(plan.tanggal) ?? [];
    rows.push(plan);
    plansByDate.set(plan.tanggal, rows);
  }
  for (const [date, plans] of plansByDate) {
    if (plans.length > 1) {
      blockers.push({
        code: "duplicate_source_plan",
        message: `Lebih dari satu rencana sumber ada untuk ${date}.`,
      });
    }
  }

  const expectedPlanVersions = relevantPlans
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((plan) => ({ planId: plan.id, version: plan.version, status: plan.status }));

  for (const plan of relevantPlans) {
    if (plan.status !== "Draft") continue;
    const source = sourceByPlanId.get(plan.id);
    if (!source) {
      blockers.push({
        code: "legacy_provenance_missing",
        message: "Rencana yang ada tidak memiliki sumber SIM3LON immutable.",
        planId: plan.id,
      });
    } else if (!predecessor || source.batchId !== predecessor.batchId) {
      blockers.push({
        code: "source_predecessor_mismatch",
        message: "Sumber rencana tidak sama dengan impor yang terakhir diterapkan.",
        planId: plan.id,
      });
    }
    const hasManualProduct = db.planRows
      .filter((row) => row.planId === plan.id)
      .some((row) => row.lines.some((line) => line.productId !== candidate.productId));
    if (hasManualProduct) {
      blockers.push({
        code: "manual_lines_present",
        message: "Rencana juga memiliki produk di luar sumber SIM3LON.",
        planId: plan.id,
      });
    }
  }

  const keys = new Set([...baseline.keys(), ...proposed.keys()]);
  const current = new Map<string, number>();
  for (const plan of relevantPlans) {
    for (const row of db.planRows.filter((item) => item.planId === plan.id)) {
      const qty = row.lines
        .filter((line) => line.productId === candidate.productId)
        .reduce((sum, line) => sum + line.jumlah, 0);
      const key = sourceKey(row.outletId, plan.tanggal);
      keys.add(key);
      current.set(key, (current.get(key) ?? 0) + qty);
    }
  }

  const changes = [...keys].sort().map((key): SIM3LONReconciliationChange => {
    const separator = key.lastIndexOf("|");
    const outletId = key.slice(0, separator);
    const operationalDate = key.slice(separator + 1);
    const baselineQty = baseline.get(key) ?? 0;
    const proposedQty = proposed.get(key) ?? 0;
    const datePlans = plansByDate.get(operationalDate) ?? [];
    const plan = datePlans[0];
    const currentQty = plan ? current.get(key) ?? 0 : undefined;
    const classification = classifySourceChange(
      baselineQty,
      currentQty ?? baselineQty,
      proposedQty,
      baseline.has(key),
      proposed.has(key),
    );
    const nonDraftDiscrepancy = Boolean(
      plan && plan.status !== "Draft" && (currentQty ?? 0) !== proposedQty,
    );
    if (plan?.status === "Draft" && classification === "local_conflict") {
      blockers.push({
        code: "local_conflict",
        message: "Jumlah rencana berubah lokal setelah sumber sebelumnya diterima.",
        planId: plan.id,
      });
    }
    const assigned = plan
      ? db.planRows.some((row) => row.planId === plan.id && Boolean(row.driverId))
      : false;
    if (plan?.status === "Draft" && sourceByPlanId.has(plan.id) && assigned && classification !== "unchanged") {
      blockers.push({
        code: "assignment_replan_required",
        message: "Hapus penugasan trip lalu susun ulang rute sebelum merekonsiliasi perubahan sumber ini.",
        planId: plan.id,
      });
    }
    return {
      planId: plan?.id,
      outletId,
      productId: candidate.productId,
      operationalDate,
      baselineQty,
      currentQty: currentQty ?? null,
      proposedQty,
      classification,
      nonDraftDiscrepancy,
      crewAssignmentAffected: assigned && (currentQty ?? 0) !== proposedQty,
    };
  });

  const normalized = deduplicateBlockers(blockers);
  return {
    candidateBatchId: candidate.batchId,
    expectedPredecessorBatchId: predecessor?.batchId ?? null,
    sourceCreatedAt: candidate.createdAt,
    reviewReady: normalized.length === 0,
    expectedPlanVersions,
    changes,
    blockers: normalized,
  };
}

function requireCandidate(
  db: Database,
  batchId: string,
  actingTenantId: string,
  branchId: string | null,
): SIM3LONSourceSnapshotEntity {
  const candidate = db.sim3lonSourceSnapshots.find((source) =>
    source.batchId === batchId && source.tenantId === actingTenantId &&
    (!branchId || source.branchId === branchId),
  );
  if (!candidate) throw new ApiError("Impor SIM3LON tidak ditemukan.", 404);
  return candidate;
}

async function getSIM3LONReconciliation(
  batchId: string,
): Promise<SIM3LONReconciliationPreview> {
  const originScope = scopeKey();
  const active = getActiveScope();
  await latency("read");
  if (!sameScope(scopeKey(), originScope)) {
    throw new Error("Tenant berubah. Muat ulang impor pada tenant yang sesuai.");
  }
  const db = scopedDb();
  const candidate = requireCandidate(db, batchId, active.actingTenantId, active.branchId);
  return buildMockReconciliation(db, candidate);
}

function acceptedPlanVersions(review: SIM3LONApplyReview): Map<string, number> {
  const accepted = new Map<string, number>();
  for (const plan of review.acceptedPlans) {
    if (!plan.planId || plan.expectedVersion < 1 || accepted.has(plan.planId)) {
      throw new ApiError("Set rencana yang diterima tidak valid.", 400);
    }
    accepted.set(plan.planId, plan.expectedVersion);
  }
  return accepted;
}

async function applySIM3LON(
  batchId: string,
  review?: SIM3LONApplyReview,
): Promise<SIM3LONApplied> {
  const originScope = scopeKey();
  const active = getActiveScope();
  await latency("write");
  if (!sameScope(scopeKey(), originScope)) {
    throw new Error("Tenant berubah. Muat ulang impor pada tenant yang sesuai.");
  }

  const result = mutate((db) => {
    const candidate = requireCandidate(db, batchId, active.actingTenantId, active.branchId);
    if (candidate.status === "applied") {
      return { candidate, ...sourceWriteCounts(candidate) };
    }
    if (candidate.status !== "parsed") {
      throw new ApiError("Impor SIM3LON tidak lagi dapat diterapkan.", 409);
    }

    const reconciliation = buildMockReconciliation(db, candidate);
    const impactedPlanIds = new Set(
      reconciliation.changes
        .filter((change) => change.planId && change.classification !== "unchanged")
        .map((change) => change.planId!),
    );
    const impactedDrafts = reconciliation.expectedPlanVersions.filter((plan) =>
      plan.status === "Draft" && impactedPlanIds.has(plan.planId),
    );
    if (!review && impactedDrafts.length > 0) {
      throw new ApiError("Perubahan rencana harus ditinjau terlebih dahulu.", 409, "REVIEW_REQUIRED");
    }
    if (review) {
      if (review.expectedPredecessorBatchId !== reconciliation.expectedPredecessorBatchId) {
        throw new ApiError("Sumber SIM3LON berubah setelah ditinjau.", 409, "SOURCE_CHANGED");
      }
      if (reconciliation.blockers.length > 0) {
        throw new ApiError("Rekonsiliasi masih memiliki penghambat.", 409);
      }
      const accepted = acceptedPlanVersions(review);
      if (accepted.size !== impactedDrafts.length || impactedDrafts.some((plan) =>
        accepted.get(plan.planId) !== plan.version,
      )) {
        throw new ApiError("Rencana berubah setelah ditinjau.", 409, "STALE_VERSION");
      }
    }

    const predecessor = latestPredecessor(db, candidate);
    const proposed = sourceDemand(candidate);
    const staged = impactedDrafts.map(({ planId, version }) => {
      const plan = db.plans.find((row) => row.id === planId);
      if (!plan || plan.status !== "Draft" || plan.version !== version) {
        throw new ApiError("Rencana berubah setelah ditinjau.", 409, "STALE_VERSION");
      }
      const existingRows = db.planRows.filter((row) => row.planId === plan.id);
      const metadata = new Map(existingRows.map((row) => [row.outletId, row]));
      const rows: PlanRowEntity[] = [];
      for (const row of candidate.rows) {
        if (row.date !== plan.tanggal || row.qty <= 0) continue;
        const previous = metadata.get(row.outletId);
        rows.push({
          id: previous?.id ?? nextId("row"),
          planId: plan.id,
          outletId: row.outletId,
          driverId: previous?.driverId ?? null,
          vehicleId: previous?.vehicleId ?? null,
          lines: [{ productId: candidate.productId, jumlah: proposed.get(sourceKey(row.outletId, row.date)) ?? row.qty }],
          jumlahUnit: proposed.get(sourceKey(row.outletId, row.date)) ?? row.qty,
          jamPengiriman: previous?.jamPengiriman ?? "07:00",
          tripNo: previous?.tripNo ?? null,
        });
      }
      const oldTotal = existingRows.reduce((sum, row) => sum + row.jumlahUnit, 0);
      const newTotal = rows.reduce((sum, row) => sum + row.jumlahUnit, 0);
      return { plan, rows, oldTotal, newTotal };
    });

    const stagedByPlan = new Map(staged.map((item) => [item.plan.id, item]));
    const nextAllocatedBySa = new Map<string, number>();
    for (const { plan } of staged) {
      if (nextAllocatedBySa.has(plan.saId)) continue;
      const sa = db.scheduleAgreements.find((row) => row.id === plan.saId);
      if (!sa) throw new ApiError("Base SA tidak ditemukan.", 409);
      let nextAllocated = sa.terpakai;
      for (const draft of db.plans.filter((row) => row.saId === plan.saId && row.status === "Draft")) {
        const replacement = stagedByPlan.get(draft.id);
        nextAllocated += replacement
          ? replacement.newTotal
          : db.planRows
              .filter((row) => row.planId === draft.id)
              .reduce((sum, row) => sum + row.jumlahUnit, 0);
      }
      if (nextAllocated > sa.totalKuota) {
        throw new ApiError("Kuota Base SA tidak cukup untuk rekonsiliasi ini.", 409);
      }
      nextAllocatedBySa.set(plan.saId, nextAllocated);
    }

    // Every validation above happens before this point. The mock store has no
    // database transaction, so keeping the commit section non-throwing gives
    // it the same all-or-nothing behavior for this operation.
    for (const item of staged) {
      db.planRows = db.planRows.filter((row) => row.planId !== item.plan.id);
      db.planRows.push(...item.rows);
      item.plan.version += 1;
    }
    for (const [saId, nextAllocated] of nextAllocatedBySa) {
      const sa = db.scheduleAgreements.find((row) => row.id === saId)!;
      sa.dialokasikan = nextAllocated;
    }
    if (predecessor) {
      for (const source of db.sim3lonPlanSources) {
        const plan = db.plans.find((row) => row.id === source.planId);
        if (source.tenantId === candidate.tenantId && source.branchId === candidate.branchId &&
          source.productId === candidate.productId && source.batchId === predecessor.batchId &&
          plan?.status === "Draft") {
          source.batchId = candidate.batchId;
        }
      }
    }
    const daily = new Map<string, number>();
    for (const row of candidate.rows) daily.set(row.date, (daily.get(row.date) ?? 0) + row.qty);
    for (const [date, target] of daily) {
      const existing = db.saDailyTargets.find((row) => row.saId === candidate.saId && row.tanggal === date);
      if (existing) {
        existing.target = target;
        existing.sumber = "file_import";
        existing.importBatchId = candidate.batchId;
      } else {
        db.saDailyTargets.push({
          id: nextId("sadt"), saId: candidate.saId, tanggal: date, target,
          sumber: "file_import", importBatchId: candidate.batchId,
        });
      }
    }
    candidate.status = "applied";
    recordAudit(db, {
      action: "sim3lon.apply_reconciliation",
      entity: "SIM3LONImport",
      entityId: candidate.batchId,
      summary: `Menerapkan sumber ${candidate.batchId} dan merekonsiliasi ${staged.length} rencana draf.`,
    });
    return { candidate, ...sourceWriteCounts(candidate) };
  });

  if (!sameScope(scopeKey(), originScope)) {
    throw new Error("Tenant berubah saat impor diterapkan. Buka tenant semula untuk memeriksa hasilnya.");
  }
  return {
    id: result.candidate.batchId,
    baseAgreementId: result.candidate.saId,
    outletTargetsWritten: result.outletTargetsWritten,
    dailyTargetsWritten: result.dailyTargetsWritten,
  };
}

/**
 * The mock has no outlet-level import snapshot to show: SIM3LON import only
 * runs against the real API (see previewSIM3LON above), and the Base SA CSV
 * import this mock does model carries dates and quantities, not outlets. Null
 * is the honest answer, the same one a hand-typed agreement gets from the
 * real backend.
 */
async function getImportSummary(id: string): Promise<SAImportSummary | null> {
  void id;
  await latency("read");
  return null;
}

/**
 * SHA-256 of the uploaded bytes.
 *
 * Computed rather than invented, even in the mock: the console renders it as
 * the fingerprint of what was reviewed, and a fabricated one would make the
 * demo teach that the number means nothing.
 *
 * `crypto.subtle` is unavailable over plain HTTP on a non-localhost origin, so
 * an empty string stands for "not computed here" rather than a fake digest.
 */
async function checksum(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) return "";
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

import type { ScheduleAgreementApi } from "./contract";

export const saApiMock: ScheduleAgreementApi = {
  getSAList,
  getSADetail,
  getImportSummary,
  uploadSA,
  activateSA,
  deleteSA,
  getSupplierOptions,
  parseImport,
  applyImport,
  previewSIM3LON,
  getSIM3LONReconciliation,
  applySIM3LON,
};
