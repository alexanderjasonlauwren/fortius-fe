/**
 * Business rules for the mock backend.
 *
 * These are the operations a real server would own: they validate, they touch
 * more than one collection, and they leave an audit trail. Feature APIs call
 * them; components never do.
 */

import { ApiError, currentActor, mutate, nextId, notify, recordAudit } from "./db";
import { accountByRole, postJournal } from "./ledger";
import {
  addDaysIso,
  issueCreditNote as issueCreditNoteAr,
  applyAllocation,
  issueInvoiceForDelivery,
  outletExposure,
  recordPayment as recordPaymentAr,
  refreshOverdue,
  verifyPaymentRecord,
} from "./ar";
import { crewedVehicle } from "./fleet";
import { isoDate, startOfToday } from "./seed";
import { distanceMeters, type GeoStamp } from "@/lib/geo";
import {
  applyScalarRealisasi,
  productOf,
  sumJumlah,
  sumKembali,
  sumRealisasi,
  sumTarget,
} from "./lines";
import { getActiveScope, stampScope } from "./scope";
import type {
  Database,
  DeliveryEntity,
  DeliveryEventEntity,
  DeliveryEventType,
  DriverEntity,
  VehicleEntity,
  GeofenceRuleEntity,
  GeofenceAlertEntity,
  ID,
  DeliveryLine,
  OutletEntity,
  PaymentEntity,
  PlanEntity,
  PlanRowEntity,
  InvoiceEntity,
  OutletWarningEntity,
  ProductEntity,
  ReceiptEntity,
  SAEntity,
  SAImportBatchEntity,
  TransportationClaimEntity,
  UserEntity,
} from "./types";
import { outletLabel, outletLabelTitle, unitLabel } from "@/lib/lexicon";

const fmt = (n: number) => n.toLocaleString("id-ID");

/**
 * Builds a document number from the configured prefix.
 *
 * Numbering is visible on every row and printout, so it belongs in
 * Konfigurasi Sistem rather than scattered through this file.
 */
function docNumber(
  db: Database,
  jenis: keyof Omit<Database["settings"]["penomoran"], "sertakanTanggal">,
  tanggal: string,
  seq?: number,
  pad = 3,
): string {
  const { penomoran } = db.settings;
  const prefix = penomoran[jenis];
  const parts = [prefix];
  if (penomoran.sertakanTanggal) parts.push(tanggal.replace(/-/g, ""));
  if (seq != null) parts.push(String(seq).padStart(pad, "0"));
  return parts.join("-");
}

function requirePlan(db: Database, planId: ID): PlanEntity {
  const plan = db.plans.find((p) => p.id === planId);
  if (!plan) throw new ApiError("Rencana distribusi tidak ditemukan.", 404);
  return plan;
}

function requireSa(db: Database, saId: ID): SAEntity {
  const sa = db.scheduleAgreements.find((s) => s.id === saId);
  if (!sa) throw new ApiError("Schedule Agreement tidak ditemukan.", 404);
  return sa;
}

/** Used quota plus every still-editable draft reservation for one agreement. */
function allocatedQuota(
  db: Database,
  saId: ID,
  replacement?: { planId: ID; total: number },
): number {
  let draftTotal = 0;
  for (const plan of db.plans) {
    if (plan.saId !== saId || plan.status !== "Draft") continue;
    if (replacement && plan.id === replacement.planId) {
      draftTotal += replacement.total;
      continue;
    }
    draftTotal += db.planRows
      .filter((row) => row.planId === plan.id)
      .reduce((sum, row) => sum + row.jumlahUnit, 0);
  }
  return requireSa(db, saId).terpakai + draftTotal;
}

/** Keeps SA status in step with how much of its quota is drawn down. */
function refreshSaStatus(sa: SAEntity) {
  if (sa.status === "Draft") return;
  const ratio = sa.totalKuota === 0 ? 0 : sa.terpakai / sa.totalKuota;
  const expired = sa.periodeBerakhir < isoDate(startOfToday());
  if (expired || ratio >= 1) sa.status = "Selesai";
  else if (ratio >= 0.95) sa.status = "Limit";
  else sa.status = "Aktif";
}

/* ── schedule agreements ───────────────────────────────────────────────── */

export function createScheduleAgreement(input: {
  nomorSA: string;
  supplier: string;
  periodeMulai: string;
  periodeBerakhir: string;
  totalKuota: number;
  catatan?: string;
  namaDokumen?: string;
}): SAEntity {
  return mutate((db) => {
    if (db.scheduleAgreements.some((s) => s.nomorSA === input.nomorSA)) {
      throw new ApiError(`Nomor SA ${input.nomorSA} sudah terdaftar.`, 409);
    }
    if (input.periodeBerakhir < input.periodeMulai) {
      throw new ApiError("Periode berakhir mendahului periode mulai.");
    }
    if (input.totalKuota <= 0) {
      throw new ApiError("Total kuota harus lebih besar dari nol.");
    }

    const sa: SAEntity = {
      ...stampScope({}),
      id: nextId("sa"),
      nomorSA: input.nomorSA,
      supplier: input.supplier,
      periodeMulai: input.periodeMulai,
      periodeBerakhir: input.periodeBerakhir,
      totalKuota: input.totalKuota,
      dialokasikan: 0,
      terpakai: 0,
      status: "Draft",
      catatan: input.catatan,
      namaDokumen: input.namaDokumen,
      diunggahOleh: "",
      diunggahPada: new Date().toISOString(),
    };
    const entry = recordAudit(db, {
      action: "sa.upload",
      entity: "ScheduleAgreement",
      entityId: sa.id,
      summary: `Mengunggah ${sa.nomorSA} (${fmt(sa.totalKuota)} ${unitLabel()}) dari ${sa.supplier}.`,
    });
    sa.diunggahOleh = entry.actor;
    db.scheduleAgreements.unshift(sa);
    return sa;
  });
}

/** Draft → Aktif. Only an active SA can back a distribution plan. */
export function activateScheduleAgreement(saId: ID): SAEntity {
  return mutate((db) => {
    const sa = requireSa(db, saId);
    if (sa.status !== "Draft") {
      throw new ApiError(`${sa.nomorSA} sudah aktif dan tidak perlu diaktifkan lagi.`);
    }
    sa.status = "Aktif";
    refreshSaStatus(sa);
    recordAudit(db, {
      action: "sa.activate",
      entity: "ScheduleAgreement",
      entityId: sa.id,
      summary: `Mengaktifkan ${sa.nomorSA}.`,
    });
    notify(db, {
      type: "Sistem",
      title: "Schedule Agreement aktif",
      message: `${sa.nomorSA} siap dipakai untuk perencanaan distribusi.`,
      href: "/distribution",
    });
    return sa;
  });
}

export function deleteScheduleAgreement(saId: ID) {
  return mutate((db) => {
    const sa = requireSa(db, saId);
    if (sa.terpakai > 0) {
      throw new ApiError(
        `${sa.nomorSA} sudah terpakai ${fmt(sa.terpakai)} ${unitLabel()} dan tidak dapat dihapus.`,
      );
    }
    db.scheduleAgreements = db.scheduleAgreements.filter((s) => s.id !== saId);
    recordAudit(db, {
      action: "sa.delete",
      entity: "ScheduleAgreement",
      entityId: saId,
      summary: `Menghapus ${sa.nomorSA}.`,
    });
  });
}

/* ── Base SA imports ───────────────────────────────────────────────────── */

/**
 * Records an upload. Writes no targets.
 *
 * Parsing and applying are separate acts on purpose: counts alone are not
 * enough to decide with, and a bad spreadsheet should cost a glance rather than
 * a month of overwritten obligations.
 *
 * The parsed rows are stored on the batch, so applying writes the numbers whose
 * diff someone approved rather than whatever the file says when it is read
 * again. The service does the same thing by checksum against the stored object.
 */
export function recordSaImport(input: {
  saId: ID;
  namaBerkas: string;
  checksum: string;
  rows: { tanggal: string; target: number }[];
}): SAImportBatchEntity {
  return mutate((db) => {
    requireSa(db, input.saId);

    const batch: SAImportBatchEntity = {
      id: nextId("saimp"),
      saId: input.saId,
      namaBerkas: input.namaBerkas,
      checksum: input.checksum,
      status: "parsed",
      dibuatPada: new Date().toISOString(),
      rows: input.rows.map((r) => ({ ...r })),
      barisDitulis: 0,
    };
    db.saImportBatches.unshift(batch);
    return batch;
  });
}

/**
 * Writes the daily targets a reviewed import describes.
 *
 * Dates already on record but absent from the file are left alone. A Base SA
 * covering half a month is a partial statement, not an instruction to erase the
 * rest, and treating an absent date as a deletion would let an incomplete
 * export wipe obligations the supplier never withdrew.
 *
 * Unchanged rows are still written, so their provenance names this file rather
 * than an older import that happened to state the same number.
 */
export function applySaImport(batchId: ID): SAImportBatchEntity {
  return mutate((db) => {
    const batch = db.saImportBatches.find((b) => b.id === batchId);
    if (!batch) throw new ApiError("Impor tidak ditemukan.", 404);
    if (batch.status !== "parsed") {
      throw new ApiError("Impor ini sudah diterapkan.", 409);
    }
    const sa = requireSa(db, batch.saId);

    for (const row of batch.rows) {
      const existing = db.saDailyTargets.find(
        (t) => t.saId === batch.saId && t.tanggal === row.tanggal,
      );
      if (existing) {
        existing.target = row.target;
        existing.sumber = "file_import";
        existing.importBatchId = batch.id;
      } else {
        db.saDailyTargets.push({
          id: nextId("sadt"),
          saId: batch.saId,
          tanggal: row.tanggal,
          target: row.target,
          sumber: "file_import",
          importBatchId: batch.id,
        });
      }
    }

    batch.status = "applied";
    batch.diterapkanPada = new Date().toISOString();
    batch.barisDitulis = batch.rows.length;

    recordAudit(db, {
      action: "sa.import.apply",
      entity: "ScheduleAgreement",
      entityId: sa.id,
      summary: `Menerapkan ${batch.namaBerkas} pada ${sa.nomorSA}: ${fmt(batch.barisDitulis)} tanggal ditulis.`,
    });
    return batch;
  });
}

/* ── distribution planning ─────────────────────────────────────────────── */

export function createPlan(input: { tanggal: string; saId: ID; catatan?: string }): PlanEntity {
  return mutate((db) => {
    const sa = requireSa(db, input.saId);
    if (sa.status === "Draft") {
      throw new ApiError(`${sa.nomorSA} belum aktif. Aktifkan SA sebelum membuat rencana.`);
    }
    if (db.plans.some((p) => p.tanggal === input.tanggal && p.status !== "Batal")) {
      throw new ApiError(`Sudah ada rencana distribusi untuk tanggal tersebut.`, 409);
    }

    const plan: PlanEntity = {
      ...stampScope({}),
      id: nextId("plan"),
      version: 1,
      kode: docNumber(db, "rencana", input.tanggal),
      tanggal: input.tanggal,
      saId: input.saId,
      status: "Draft",
      catatan: input.catatan,
      dibuatOleh: "",
      dibuatPada: new Date().toISOString(),
    };
    const entry = recordAudit(db, {
      action: "plan.create",
      entity: "DistributionPlan",
      entityId: plan.id,
      summary: `Membuat rencana ${plan.kode}.`,
    });
    plan.dibuatOleh = entry.actor;
    db.plans.unshift(plan);
    return plan;
  });
}

/** Replaces a draft plan's stop list. Confirmed plans are frozen. */
export function savePlanRows(
  planId: ID,
  rows: Array<Omit<PlanRowEntity, "planId">>,
  expectedVersion: number,
): PlanRowEntity[] {
  return mutate((db) => {
    const plan = requirePlan(db, planId);
    if (plan.status !== "Draft") {
      throw new ApiError("Rencana yang sudah dikonfirmasi tidak dapat diubah.");
    }
    if (plan.version !== expectedVersion) {
      throw new ApiError("Rencana ini berubah. Muat ulang sebelum menyimpan.", 409);
    }
    for (const row of rows) {
      if (row.jumlahUnit <= 0) {
        throw new ApiError(`Jumlah ${unitLabel()} setiap ${outletLabel()} harus lebih dari nol.`);
      }
    }
    // Lines are authoritative; the scalar beside them is recomputed, never
    // trusted from the caller.
    const saved = rows.map((r) => ({
      ...r,
      planId,
      jumlahUnit: r.lines.length > 0 ? sumJumlah(r.lines) : r.jumlahUnit,
    }));
    const sa = requireSa(db, plan.saId);
    const nextAllocated = allocatedQuota(db, sa.id, {
      planId,
      total: saved.reduce((sum, row) => sum + row.jumlahUnit, 0),
    });
    if (nextAllocated > sa.totalKuota) {
      throw new ApiError(
        `Kuota ${sa.nomorSA} tidak mencukupi untuk reservasi draf ini.`,
        409,
      );
    }
    db.planRows = db.planRows.filter((r) => r.planId !== planId);
    db.planRows.push(...saved);
    sa.dialokasikan = nextAllocated;
    plan.version += 1;
    recordAudit(db, {
      action: "plan.save_draft",
      entity: "DistributionPlan",
      entityId: planId,
      summary: `Menyimpan draf ${plan.kode}: ${saved.length} outlet, ${fmt(
        saved.reduce((s, r) => s + r.jumlahUnit, 0),
      )} ${unitLabel()}.`,
    });
    return saved;
  });
}

/**
 * Confirmation is the pivot of the whole console: quota leaves the SA, surat
 * jalan are issued, and the monitoring board fills up.
 */
export function confirmPlan(planId: ID): { deliveries: number; total: number } {
  return mutate((db) => {
    const plan = requirePlan(db, planId);
    if (plan.status !== "Draft") {
      throw new ApiError("Rencana ini sudah dikonfirmasi.");
    }

    const rows = db.planRows.filter((r) => r.planId === planId);
    if (rows.length === 0) {
      throw new ApiError(`Tambahkan minimal satu ${outletLabel()} sebelum konfirmasi.`);
    }
    const unassigned = rows.filter((r) => !r.driverId);
    if (unassigned.length > 0) {
      throw new ApiError(
        `${unassigned.length} ${outletLabel()} belum punya driver. Tetapkan driver sebelum konfirmasi.`,
      );
    }

    // Credit control belongs here — refusing to load a truck for an outlet that
    // is over its limit is the only moment the block actually saves money.
    const diblokir = rows
      .map((r) => ({ row: r, exp: outletExposure(db, r.outletId) }))
      .filter((x) => x.exp.terblokir);
    if (diblokir.length > 0) {
      const names = diblokir
        .map((x) => db.outlets.find((p) => p.id === x.row.outletId)?.nama)
        .filter(Boolean);
      throw new ApiError(
        `${names.join(", ")} diblokir karena kredit. ${diblokir[0].exp.alasan} Selesaikan tagihan atau naikkan plafon di data ${outletLabel()}.`,
      );
    }

    const total = rows.reduce((s, r) => s + r.jumlahUnit, 0);
    const sa = requireSa(db, plan.saId);
    const nextAllocated = allocatedQuota(db, sa.id);
    if (nextAllocated > sa.totalKuota) {
      throw new ApiError(
        `Kuota ${sa.nomorSA} tidak mencukupi. Tersisa ${fmt(Math.max(0, sa.totalKuota - sa.dialokasikan))} ${unitLabel()}.`,
      );
    }

    // Check truck capacity per driver.
    const perDriver = new Map<ID, number>();
    for (const r of rows) {
      perDriver.set(r.driverId!, (perDriver.get(r.driverId!) ?? 0) + r.jumlahUnit);
    }
    for (const [driverId, muatan] of perDriver) {
      const driver = db.drivers.find((d) => d.id === driverId);
      if (!driver) continue;
      // Capacity is the truck's, never the driver's. A driver with no truck has
      // no ceiling to check against, so the load is not refused here -- the
      // dispatch board is where a run without a vehicle is caught, and refusing
      // it twice in two vocabularies helps nobody.
      const vehicle = crewedVehicle(db, driverId);
      if (vehicle && muatan > vehicle.kapasitas) {
        throw new ApiError(
          `Muatan ${driver.nama} ${fmt(muatan)} ${unitLabel()} melebihi kapasitas ${vehicle.armada} (${fmt(vehicle.kapasitas)}).`,
        );
      }
    }

    sa.terpakai += total;
    // The plan leaves the draft pool at the same instant its quantity becomes
    // used, so confirming consumes the existing reservation exactly once.
    sa.dialokasikan = nextAllocated;
    refreshSaStatus(sa);

    const actor = recordAudit(db, {
      action: "plan.confirm",
      entity: "DistributionPlan",
      entityId: plan.id,
      summary: `Mengonfirmasi ${plan.kode}: ${rows.length} surat jalan, ${fmt(total)} ${unitLabel()} dari ${sa.nomorSA}.`,
    }).actor;

    plan.status = "Terkonfirmasi";
    plan.dikonfirmasiOleh = actor;
    plan.dikonfirmasiPada = new Date().toISOString();

    rows
      .slice()
      .sort((a, b) => a.jamPengiriman.localeCompare(b.jamPengiriman))
      .forEach((row, idx) => {
        db.deliveries.push({
          // Follows its plan, not the active scope.
          tenantId: plan.tenantId,
          branchId: plan.branchId,
          id: nextId("dlv"),
          kode: docNumber(db, "suratJalan", plan.tanggal, idx + 1, 2),
          planId: plan.id,
          planRowId: row.id,
          outletId: row.outletId,
          driverId: row.driverId!,
          tanggal: plan.tanggal,
          jamRencana: row.jamPengiriman,
          lines: row.lines.map((l) => ({
            productId: l.productId,
            target: l.jumlah,
            realisasi: 0,
          })),
          target: row.jumlahUnit,
          realisasi: 0,
          status: "Antrian",
        });
      });

    notify(db, {
      type: "Sistem",
      title: `Rencana ${plan.kode} dikonfirmasi`,
      message: `${rows.length} surat jalan terbit, ${fmt(total)} ${unitLabel()} dialokasikan dari ${sa.nomorSA}.`,
      href: "/monitoring",
    });

    if (sa.status === "Limit") {
      notify(db, {
        type: "Alert",
        title: "Kuota SA hampir habis",
        message: `${sa.nomorSA} tersisa ${fmt(sa.totalKuota - sa.terpakai)} ${unitLabel()} setelah konfirmasi ini.`,
        href: "/sa",
      rule: "quotaLow",
      });
    }

    return { deliveries: rows.length, total };
  });
}

/** Rolls a confirmed plan back and returns its quota to the SA. */
export function cancelPlan(planId: ID) {
  return mutate((db) => {
    const plan = requirePlan(db, planId);
    if (plan.status === "Selesai") {
      throw new ApiError("Rencana yang sudah selesai tidak dapat dibatalkan.");
    }
    const deliveries = db.deliveries.filter((d) => d.planId === planId);
    if (deliveries.some((d) => d.status !== "Antrian")) {
      throw new ApiError(
        "Sebagian armada sudah berjalan. Batalkan surat jalan satu per satu di Monitoring.",
      );
    }
    if (plan.status === "Terkonfirmasi") {
      const total = deliveries.reduce((s, d) => s + d.target, 0);
      const sa = requireSa(db, plan.saId);
      sa.terpakai = Math.max(0, sa.terpakai - total);
      refreshSaStatus(sa);
      db.deliveries = db.deliveries.filter((d) => d.planId !== planId);
    }
    plan.status = "Batal";
    const sa = requireSa(db, plan.saId);
    sa.dialokasikan = allocatedQuota(db, sa.id);
    recordAudit(db, {
      action: "plan.cancel",
      entity: "DistributionPlan",
      entityId: planId,
      summary: `Membatalkan ${plan.kode} dan mengembalikan kuota ke SA.`,
    });
  });
}

/* ── outlet orders ──────────────────────────────────────────────────── */

export function decideOrder(
  orderId: ID,
  action: "approve" | "reject",
  catatan?: string,
) {
  return mutate((db) => {
    const o = db.orders.find((x) => x.id === orderId);
    if (!o) throw new ApiError("Pesanan tidak ditemukan.", 404);
    if (o.status !== "Baru") {
      throw new ApiError(`${o.kode} sudah diproses.`);
    }
    if (action === "reject" && !catatan?.trim()) {
      throw new ApiError("Alasan penolakan wajib diisi.");
    }
    o.status = action === "approve" ? "Disetujui" : "Ditolak";
    if (catatan?.trim()) o.catatan = catatan.trim();
    o.diprosesPada = new Date().toISOString();
    const entry = recordAudit(db, {
      action: `order.${action}`,
      entity: "Order",
      entityId: o.id,
      summary: `${action === "approve" ? "Menyetujui" : "Menolak"} ${o.kode} (${fmt(o.jumlahUnit)} ${unitLabel()}).`,
    });
    o.diprosesOleh = entry.actor;
    return o;
  });
}

/** Pulls approved orders onto a draft plan as stops. */
export function scheduleOrders(planId: ID, orderIds: ID[]) {
  return mutate((db) => {
    const plan = requirePlan(db, planId);
    if (plan.status !== "Draft") {
      throw new ApiError("Hanya rencana berstatus draf yang dapat diisi pesanan.");
    }
    const orders = db.orders.filter((o) => orderIds.includes(o.id));
    if (orders.length === 0) throw new ApiError("Pilih minimal satu pesanan.");
    const notApproved = orders.filter((o) => o.status !== "Disetujui");
    if (notApproved.length > 0) {
      throw new ApiError(
        `${notApproved.length} pesanan belum disetujui dan tidak dapat dijadwalkan.`,
      );
    }

    orders.forEach((o, i) => {
      const existing = db.planRows.find(
        (r) => r.planId === planId && r.outletId === o.outletId,
      );
      if (existing) {
        for (const line of o.lines) {
          const same = existing.lines.find((l) => l.productId === line.productId);
          if (same) same.jumlah += line.jumlah;
          else existing.lines.push({ ...line });
        }
        existing.jumlahUnit = sumJumlah(existing.lines);
      } else {
        const count = db.planRows.filter((r) => r.planId === planId).length;
        db.planRows.push({
          id: nextId("row"),
          planId,
          outletId: o.outletId,
          driverId: null,
          lines: [...o.lines],
          jumlahUnit: o.jumlahUnit,
          jamPengiriman: `${String(Math.min(17, 7 + count + i)).padStart(2, "0")}:00`,
        });
      }
      o.status = "Dijadwalkan";
      o.planId = planId;
    });

    recordAudit(db, {
      action: "order.schedule",
      entity: "DistributionPlan",
      entityId: planId,
      summary: `Menjadwalkan ${orders.length} pesanan ke ${plan.kode}.`,
    });
    return orders.length;
  });
}

/* ── delivery execution ────────────────────────────────────────────────── */

/** What the sopir records at the drop, beyond the status itself. */
export interface DeliveryReport {
  /** Empty cylinders collected. */
  unitKembali?: number;
  /** Who signed for the load. */
  diterimaOleh?: string;
  catatan?: string;
  /** Where the sopir was when they filed this, if the device could say. */
  posisi?: GeoStamp;
  /**
   * Per-product outcome, when whoever filed it knew the breakdown.
   *
   * The sopir always does — they unloaded it. The desk close does not, and
   * falls back to spreading the scalar total across the loaded lines.
   */
  lines?: { productId: ID; realisasi: number; kembali?: number }[];
}

export function updateDeliveryStatus(
  deliveryId: ID,
  status: DeliveryEntity["status"],
  realisasi?: number,
  report?: DeliveryReport,
) {
  return mutate((db) => {
    const d = db.deliveries.find((x) => x.id === deliveryId);
    if (!d) throw new ApiError("Surat jalan tidak ditemukan.", 404);

    // The surat jalan is the authority on what left the yard, so a drop cannot
    // report more than was loaded — that is a paperwork error, not a delivery.
    if (realisasi !== undefined) {
      if (realisasi < 0) throw new ApiError(`Jumlah ${unitLabel()} tidak boleh negatif.`);
      if (realisasi > d.target) {
        throw new ApiError(
          `${d.kode} hanya memuat ${fmt(d.target)} ${unitLabel()}, tidak bisa mencatat ${fmt(realisasi)} diterima.`,
        );
      }
    }
    if (report?.unitKembali != null && report.unitKembali < 0) {
      throw new ApiError(`Jumlah ${unitLabel()} kembali tidak boleh negatif.`);
    }

    d.status = status;

    if (report?.lines?.length) {
      // Filed per product: the authoritative case.
      const byProduct = new Map(report.lines.map((l) => [l.productId, l]));
      d.lines = d.lines.map((l) => {
        const filed = byProduct.get(l.productId);
        if (!filed) return l;
        return {
          ...l,
          realisasi: Math.min(l.target, Math.max(0, filed.realisasi)),
          kembali: filed.kembali,
        } satisfies DeliveryLine;
      });
      d.realisasi = sumRealisasi(d.lines);
      d.unitKembali = sumKembali(d.lines);
    } else if (realisasi !== undefined) {
      d.lines = applyScalarRealisasi(d.lines, realisasi);
      d.realisasi = realisasi;
    }

    if (report?.unitKembali != null) d.unitKembali = report.unitKembali;
    if (report?.diterimaOleh?.trim()) d.diterimaOleh = report.diterimaOleh.trim();
    if (report?.catatan?.trim()) d.catatan = report.catatan.trim();

    if (status === "Proses" && !d.mulaiPada) d.mulaiPada = new Date().toISOString();
    if (status === "Selesai") {
      d.selesaiPada = new Date().toISOString();
      if (realisasi === undefined && !report?.lines?.length && d.realisasi === 0) {
        d.lines = d.lines.map((l) => ({ ...l, realisasi: l.target }));
        d.realisasi = sumTarget(d.lines);
      }
      // The truck is at the outlet, so it is no longer somewhere on the road.
      d.driverLat = undefined;
      d.driverLng = undefined;
      raiseInvoice(db, d);
    }

    recordAudit(db, {
      action: "delivery.status",
      entity: "Delivery",
      entityId: d.id,
      summary: `${d.kode} → ${status}${realisasi !== undefined ? ` (${fmt(realisasi)} ${unitLabel()})` : ""}.`,
    });

    if (report?.posisi) recordDeliveryEvent(db, d, status, report.posisi, report.catatan);

    // The board reads driver status, so a drop moved by hand has to update it
    // too — otherwise a truck the sopir just despatched still shows Standby.
    refreshDriverStatus(db, d.driverId);

    // A plan is done once every surat jalan under it is settled.
    const siblings = db.deliveries.filter((x) => x.planId === d.planId);
    if (siblings.every((x) => x.status === "Selesai" || x.status === "Tertunda")) {
      const plan = db.plans.find((p) => p.id === d.planId);
      if (plan && plan.status === "Terkonfirmasi") {
        plan.status = "Selesai";
        db.orders
          .filter((o) => o.planId === plan.id && o.status === "Dijadwalkan")
          .forEach((o) => (o.status = "Selesai"));
      }
    }
    return d;
  });
}

/**
 * The truck reached the gate.
 *
 * Its own function rather than a fifth status, because arriving does not change
 * what the drop is — it is still in progress. What it changes is when the
 * waiting started, and the gap from `mulaiPada` to here is the travel time
 * while the gap from here to `selesaiPada` is the wait at the gate. Folded into
 * the completion those two are indistinguishable, and the second one reads as
 * zero.
 *
 * Filing twice is a no-op rather than an error: the truck arrived once, and a
 * driver double-tapping in a cab should not see a failure.
 */
export function recordDeliveryArrival(deliveryId: ID, posisi: GeoStamp) {
  return mutate((db) => {
    const d = db.deliveries.find((x) => x.id === deliveryId);
    if (!d) throw new ApiError("Surat jalan tidak ditemukan.", 404);
    if (d.status === "Selesai" || d.status === "Tertunda") {
      throw new ApiError(`${d.kode} sudah ditutup.`);
    }
    if (d.tibaPada) return d;

    d.tibaPada = posisi.at;
    recordAudit(db, {
      action: "delivery.status",
      entity: "Delivery",
      entityId: d.id,
      summary: `${d.kode} tiba di lokasi.`,
    });
    appendDeliveryEvent(db, d, "tiba", posisi);
    return d;
  });
}

const EVENT_TYPE: Partial<Record<DeliveryEntity["status"], DeliveryEventType>> = {
  Proses: "berangkat",
  Selesai: "selesai",
  Tertunda: "tertunda",
};

/**
 * Appends what the sopir filed, and where from.
 *
 * The distance is computed here, once, against the outlet's coordinates as they
 * stand at the moment of filing — see the note on DeliveryEventEntity.
 */
function recordDeliveryEvent(
  db: Database,
  d: DeliveryEntity,
  status: DeliveryEntity["status"],
  posisi: GeoStamp,
  catatan?: string,
) {
  const tipe = EVENT_TYPE[status];
  if (!tipe) return;
  return appendDeliveryEvent(db, d, tipe, posisi, catatan, status === "Selesai");
}

/** The append itself, shared with filings that are not a status change. */
function appendDeliveryEvent(
  db: Database,
  d: DeliveryEntity,
  tipe: DeliveryEventType,
  posisi: GeoStamp,
  catatan?: string,
  arrivedForGood = false,
) {
  const pkl = db.outlets.find((p) => p.id === d.outletId);
  const jarakMeter =
    posisi.status === "ok" && posisi.lat != null && posisi.lng != null && pkl
      ? distanceMeters({ lat: posisi.lat, lng: posisi.lng }, { lat: pkl.lat, lng: pkl.lng })
      : undefined;

  const event: DeliveryEventEntity = {
    // Follows the delivery, not the active scope: the event belongs where the
    // goods went, exactly as its invoice does.
    tenantId: d.tenantId,
    branchId: d.branchId,
    id: nextId("evt"),
    deliveryId: d.id,
    driverId: d.driverId,
    tipe,
    at: posisi.at,
    aktor: currentActor(),
    posisi,
    jarakMeter,
    catatan,
  };
  db.deliveryEvents.unshift(event);
  if (db.deliveryEvents.length > 2000) db.deliveryEvents.length = 2000;

  // A real fix is better than the simulated position the ops clock invents, so
  // it takes over as the truck's last known whereabouts while the run is live.
  if (posisi.status === "ok" && !arrivedForGood) {
    d.driverLat = posisi.lat;
    d.driverLng = posisi.lng;
  }
  return event;
}

/**
 * Recomputes one driver's runtime status from today's surat jalan.
 *
 * Status is derived, never set directly: two screens and a timer all move
 * deliveries, and any of them setting the driver by hand would drift.
 */
function refreshDriverStatus(db: Database, driverId: ID) {
  const driver = db.drivers.find((x) => x.id === driverId);
  if (!driver || driver.status === "Cuti") return;

  const today = isoDate(startOfToday());
  const mine = db.deliveries.filter(
    (x) => x.tanggal === today && x.driverId === driverId,
  );
  if (mine.length === 0) return;

  if (mine.some((x) => x.status === "Proses")) {
    // Keep whichever of the two running states it already had; they differ only
    // in what the truck is doing at the stop, which only the sopir knows.
    if (driver.status !== "Dalam Perjalanan" && driver.status !== "Bongkar Muat") {
      driver.status = "Dalam Perjalanan";
    }
  } else if (mine.every((x) => x.status === "Selesai" || x.status === "Tertunda")) {
    driver.status = "Selesai";
  } else {
    driver.status = "Standby";
  }
}

/** A completed drop raises the invoice finance will later collect. */
function raiseInvoice(db: Database, d: DeliveryEntity) {
  issueInvoiceForDelivery(db, d.id, currentActor());
}

/* ── payments ──────────────────────────────────────────────────────────── */

export function decidePayment(
  paymentId: ID,
  action: "verify" | "reject",
  keterangan?: string,
): PaymentEntity {
  return mutate((db) => {
    const actor = currentActor();
    const p = verifyPaymentRecord(db, paymentId, action, keterangan, actor);
    const pkl = db.outlets.find((x) => x.id === p.outletId);

    recordAudit(db, {
      action: `payment.${action}`,
      entity: "Payment",
      entityId: p.id,
      summary: `${action === "verify" ? "Memverifikasi" : "Menolak"} ${p.nomor} senilai Rp ${fmt(p.jumlah)}.`,
    });

    if (action === "reject") {
      notify(db, {
        type: "Alert",
        title: "Penerimaan ditolak",
        message: `${p.nomor} dari ${pkl?.nama ?? "${outletLabel()}"} ditolak: ${p.keterangan}`,
        href: "/payments",
        rule: "paymentPending",
      });
    }
    return p;
  });
}

/** Records cash received, optionally applying it to invoices in one step. */
export function createPayment(input: {
  outletId: ID;
  jumlah: number;
  tanggal: string;
  bank: PaymentEntity["bank"];
  noRekening: string;
  rekeningTujuanId?: ID;
  buktiTransfer?: string;
  keterangan?: string;
  alokasi?: { invoiceId: ID; jumlah: number }[];
}) {
  return mutate((db) => {
    const actor = currentActor();
    const p = recordPaymentAr(db, input, actor);
    recordAudit(db, {
      action: "payment.create",
      entity: "Payment",
      entityId: p.id,
      summary: `Mencatat penerimaan ${p.nomor} senilai Rp ${fmt(p.jumlah)}.`,
    });
    return p;
  });
}

export function allocatePayment(
  paymentId: ID,
  alokasi: { invoiceId: ID; jumlah: number }[],
) {
  return mutate((db) => applyAllocation(db, paymentId, alokasi, currentActor()));
}

export function createCreditNote(input: {
  outletId: ID;
  invoiceId: ID | null;
  jumlah: number;
  alasan: string;
}) {
  return mutate((db) => {
    const actor = currentActor();
    const note = issueCreditNoteAr(db, input, actor);
    recordAudit(db, {
      action: "creditNote.create",
      entity: "CreditNote",
      entityId: note.id,
      summary: `Menerbitkan nota kredit ${note.nomor} senilai Rp ${fmt(note.jumlah)} — ${note.alasan}`,
    });
    return note;
  });
}

/** Recomputes overdue status; called when the finance pages load. */
export function syncReceivables() {
  return mutate((db) => refreshOverdue(db));
}

/* ── OCR receipts ──────────────────────────────────────────────────────── */

/** Accepting a scanned receipt turns it into a payment awaiting verification. */
export function validateReceipt(
  receiptId: ID,
  edits: Partial<
    Pick<
      ReceiptEntity,
      | "outletId"
      | "nomorKwitansi"
      | "tanggalKwitansi"
      | "lines"
      | "nominal"
      | "bank"
    >
  >,
): ReceiptEntity {
  return mutate((db) => {
    const r = db.receipts.find((x) => x.id === receiptId);
    if (!r) throw new ApiError("Kwitansi tidak ditemukan.", 404);
    if (r.status !== "Menunggu Review") {
      throw new ApiError(`${r.nomorKwitansi} sudah ditinjau.`);
    }
    Object.assign(r, edits);
    if (!r.outletId) {
      throw new ApiError(`Pilih ${outletLabel()} sebelum memvalidasi kwitansi.`);
    }
    if (r.lines.length === 0) {
      throw new ApiError("Kwitansi belum punya rincian barang.");
    }

    // Every line must name a real product. Billing an unmatched line against a
    // default would put the wrong item at the wrong price on a real invoice.
    const belumDikenali = r.lines.filter((l) => !l.productId);
    if (belumDikenali.length > 0) {
      throw new ApiError(
        `${belumDikenali.length} baris belum dicocokkan ke produk: ${belumDikenali
          .map((l) => l.namaTerbaca || "tanpa nama")
          .join(", ")}.`,
      );
    }
    if (r.lines.some((l) => l.jumlah <= 0 || l.hargaSatuan <= 0)) {
      throw new ApiError("Jumlah dan harga setiap baris harus lebih dari nol.");
    }
    if (r.nominal <= 0) throw new ApiError("Nominal kwitansi harus lebih dari nol.");

    // The printed total and the items are read independently. If they disagree,
    // one of them was misread, and neither is safe to bill from until a human
    // says which.
    const dariRincian = r.lines.reduce((sum, l) => sum + l.jumlah * l.hargaSatuan, 0);
    if (Math.abs(dariRincian - r.nominal) > 1) {
      throw new ApiError(
        `Rincian berjumlah Rp ${fmt(dariRincian)} tetapi kwitansi tertulis Rp ${fmt(
          r.nominal,
        )}. Perbaiki salah satunya sebelum memvalidasi.`,
      );
    }

    r.jumlahUnit = r.lines.reduce((sum, l) => sum + l.jumlah, 0);

    r.status = "Tervalidasi";
    r.ditinjauPada = new Date().toISOString();

    // A validated scan is a billable event, so it raises a proper invoice.
    const pkl = db.outlets.find((p) => p.id === r.outletId);
    const seq = db.invoices.length + 1;
    const invoice: InvoiceEntity = {
      // Falls back to the ACTING tenant, not to "the" tenant: with a hierarchy there
    // is no single one, and stamping a row with the root's id while acting as a
    // subsidiary is a cross-tenant write the backend's WITH CHECK would refuse.
    tenantId: pkl?.tenantId ?? getActiveScope().actingTenantId,
      branchId: pkl?.branchId ?? db.branches[0]?.id ?? "",
      id: nextId("inv"),
      nomor: docNumber(db, "invoice", r.tanggalKwitansi, seq),
      outletId: r.outletId,
      deliveryId: null,
      tanggal: r.tanggalKwitansi,
      jatuhTempo: addDaysIso(r.tanggalKwitansi, pkl?.termin ?? 0),
      // Billed from the receipt's own items, at the prices the paper states
      // rather than today's catalogue — the invoice has to match the document
      // the customer is holding.
      lines: r.lines.map((l) => {
        const prod = productOf(db.products, l.productId!);
        return {
          productId: l.productId!,
          nama: prod?.nama ?? l.namaTerbaca,
          satuan: prod?.satuan ?? "unit",
          jumlah: l.jumlah,
          hargaSatuan: l.hargaSatuan,
          subtotal: l.jumlah * l.hargaSatuan,
        };
      }),
      jumlahUnit: r.jumlahUnit,
      hargaSatuan: r.jumlahUnit > 0 ? Math.round(r.nominal / r.jumlahUnit) : 0,
      subtotal: r.nominal,
      pajak: 0,
      total: r.nominal,
      terbayar: 0,
      kredit: 0,
      status: "Terbit",
      catatan: `Hasil pindai ${r.nomorKwitansi}.`,
      dibuatOleh: currentActor(),
    };
    db.invoices.unshift(invoice);
    postJournal(db, {
      scope: { tenantId: invoice.tenantId, branchId: invoice.branchId },
      tanggal: invoice.tanggal,
      keterangan: `${invoice.nomor} — hasil pindai kwitansi`,
      sumber: { tipe: "invoice", id: invoice.id },
      aktor: currentActor(),
      lines: [
        { akunId: accountByRole(db, "piutang").id, debit: invoice.total, kredit: 0 },
        { akunId: accountByRole(db, "pendapatan").id, debit: 0, kredit: invoice.total },
      ],
    });
    r.paymentId = invoice.id;

    const entry = recordAudit(db, {
      action: "receipt.validate",
      entity: "Receipt",
      entityId: r.id,
      summary: `Memvalidasi ${r.nomorKwitansi} dan menerbitkan ${invoice.nomor}.`,
    });
    r.ditinjauOleh = entry.actor;
    return r;
  });
}

export function rejectReceipt(receiptId: ID, alasan: string): ReceiptEntity {
  return mutate((db) => {
    const r = db.receipts.find((x) => x.id === receiptId);
    if (!r) throw new ApiError("Kwitansi tidak ditemukan.", 404);
    if (!alasan.trim()) throw new ApiError("Alasan penolakan wajib diisi.");
    r.status = "Ditolak";
    r.ditinjauPada = new Date().toISOString();
    const entry = recordAudit(db, {
      action: "receipt.reject",
      entity: "Receipt",
      entityId: r.id,
      summary: `Menolak ${r.nomorKwitansi}: ${alasan.trim()}`,
    });
    r.ditinjauOleh = entry.actor;
    return r;
  });
}

/* ── master data ───────────────────────────────────────────────────────── */

export function saveOutlet(
  input: Partial<OutletEntity> & { id?: ID },
): OutletEntity {
  return mutate((db) => {
    if (!input.nama?.trim()) throw new ApiError(`Nama ${outletLabel()} wajib diisi.`);

    if (input.id) {
      const existing = db.outlets.find((p) => p.id === input.id);
      if (!existing) throw new ApiError(`${outletLabelTitle()} tidak ditemukan.`, 404);
      Object.assign(existing, input);
      recordAudit(db, {
        action: "outlet.update",
        entity: outletLabelTitle(),
        entityId: existing.id,
        summary: `Memperbarui data ${existing.nama}.`,
      });
      return existing;
    }

    const seq = db.outlets.length + 1;
    const created: OutletEntity = {
      ...stampScope({}),
      id: nextId("pkl"),
      kode: input.kode?.trim() || `PKL-${String(seq).padStart(4, "0")}`,
      nama: input.nama.trim(),
      alamat: input.alamat ?? "",
      kecamatan: input.kecamatan ?? "",
      kota: input.kota ?? "Kota Salatiga",
      lat: input.lat ?? -7.3305,
      lng: input.lng ?? 110.5084,
      penanggungJawab: input.penanggungJawab ?? "",
      telepon: input.telepon ?? "",
      bank: input.bank,
      noRekening: input.noRekening,
      status: input.status ?? "Aktif",
      kuotaBulanan: input.kuotaBulanan ?? 600,
      termin: input.termin ?? 7,
      batasKredit: input.batasKredit ?? 0,
      blokirOtomatis: input.blokirOtomatis ?? true,
      terdaftarPada: isoDate(startOfToday()),
    };
    if (db.outlets.some((p) => p.kode === created.kode)) {
      throw new ApiError(`Kode ${created.kode} sudah dipakai ${outletLabel()} lain.`, 409);
    }
    db.outlets.unshift(created);
    recordAudit(db, {
      action: "outlet.create",
      entity: outletLabelTitle(),
      entityId: created.id,
      summary: `Mendaftarkan ${outletLabel()} ${created.nama} (${created.kode}).`,
    });
    return created;
  });
}

export function deleteOutlet(id: ID) {
  return mutate((db) => {
    const pkl = db.outlets.find((p) => p.id === id);
    if (!pkl) throw new ApiError(`${outletLabelTitle()} tidak ditemukan.`, 404);
    const open = db.deliveries.some(
      (d) => d.outletId === id && d.status !== "Selesai",
    );
    if (open) {
      throw new ApiError(
        `${pkl.nama} masih punya surat jalan berjalan. Selesaikan pengiriman sebelum menghapus.`,
      );
    }
    db.outlets = db.outlets.filter((p) => p.id !== id);
    recordAudit(db, {
      action: "outlet.delete",
      entity: outletLabelTitle(),
      entityId: id,
      summary: `Menghapus ${outletLabel()} ${pkl.nama}.`,
    });
  });
}

/**
 * `akunUsername`/`akunEmail`/`akunPassword` mirror
 * `DriverWriteInput` (features/drivers/api/contract.ts) without importing it —
 * that module imports from `@/mocks/types`, and importing it back here would
 * make the dependency circular.
 */
type SaveDriverInput = Partial<DriverEntity> & {
  id?: ID;
  akunUsername?: string;
  akunEmail?: string;
  akunPassword?: string;
};

export function saveDriver(input: SaveDriverInput): DriverEntity {
  return mutate((db) => {
    if (!input.nama?.trim()) throw new ApiError("Nama driver wajib diisi.");
    if (!input.id && !input.kode?.trim()) throw new ApiError("Kode driver wajib diisi.");
    if (input.kode && db.drivers.some((d) => d.kode === input.kode && d.id !== input.id)) {
      throw new ApiError(`Kode ${input.kode} sudah dipakai driver lain.`, 409);
    }

    if (input.id) {
      const existing = db.drivers.find((d) => d.id === input.id);
      if (!existing) throw new ApiError("Driver tidak ditemukan.", 404);
      Object.assign(existing, input);
      recordAudit(db, {
        action: "driver.update",
        entity: "Driver",
        entityId: existing.id,
        summary: `Memperbarui data ${existing.nama}.`,
      });
      return existing;
    }

    if (!input.akunUsername?.trim()) throw new ApiError("Username akun wajib diisi.");
    if (!input.akunPassword?.trim()) throw new ApiError("Kata sandi akun wajib diisi.");
    const akunEmail = input.akunEmail?.trim();
    if (akunEmail && db.users.some((u) => u.email.toLowerCase() === akunEmail.toLowerCase())) {
      throw new ApiError(`Email ${akunEmail} sudah dipakai.`, 409);
    }

    const created: DriverEntity = {
      ...stampScope({}),
      id: nextId("drv"),
      kode: input.kode!.trim(),
      nama: input.nama.trim(),
      telepon: input.telepon ?? "",
      nomorSim: input.nomorSim ?? "",
      status: input.status ?? "Standby",
      bergabungPada: isoDate(startOfToday()),
    };

    // A driver is always a person, and a person here is always a user: the
    // login is provisioned in the same step, not left for someone to wire up
    // from the Users page afterwards. Mirrors saveUser's own shape for a
    // `driver`-role account.
    const account: UserEntity = {
      id: nextId("usr"),
      nama: created.nama,
      email: akunEmail || `${input.akunUsername.trim()}@sidistrib.id`,
      role: "driver",
      telepon: created.telepon,
      driverId: created.id,
      cabang: "Semua cabang",
      branchIds: [],
      scopeType: "tenant",
      status: "Aktif",
      dibuatPada: isoDate(startOfToday()),
    };
    created.userId = account.id;
    db.users.unshift(account);
    db.drivers.unshift(created);
    recordAudit(db, {
      action: "driver.create",
      entity: "Driver",
      entityId: created.id,
      summary: `Menambahkan driver ${created.nama} dan akun login ${input.akunUsername.trim()}.`,
    });
    return created;
  });
}

/**
 * Creates or updates a truck.
 *
 * The plate is the natural key a depot uses, so a duplicate is refused rather
 * than allowed and reconciled later -- two rows for one truck means two
 * capacities, and the planner loads against whichever they opened.
 */
export function saveVehicle(input: Partial<VehicleEntity> & { id?: ID }): VehicleEntity {
  return mutate((db) => {
    if (!input.plat?.trim()) throw new ApiError("Plat nomor wajib diisi.");
    const plat = input.plat.trim();
    if (db.vehicles.some((v) => v.plat === plat && v.id !== input.id)) {
      throw new ApiError(`Plat ${plat} sudah terdaftar pada armada lain.`, 409);
    }
    if (input.kapasitas !== undefined && input.kapasitas <= 0) {
      throw new ApiError("Kapasitas harus lebih dari nol.");
    }

    if (input.id) {
      const existing = db.vehicles.find((v) => v.id === input.id);
      if (!existing) throw new ApiError("Armada tidak ditemukan.", 404);
      Object.assign(existing, input, { plat });
      recordAudit(db, {
        action: "vehicle.update",
        entity: "Vehicle",
        entityId: existing.id,
        summary: `Memperbarui armada ${existing.plat}.`,
      });
      return existing;
    }

    const created: VehicleEntity = {
      ...stampScope({}),
      id: nextId("veh"),
      plat,
      armada: input.armada?.trim() ?? "",
      kapasitas: input.kapasitas ?? 240,
      kapasitasKg: input.kapasitasKg,
      status: input.status ?? "Aktif",
      terdaftarPada: isoDate(startOfToday()),
    };
    db.vehicles.unshift(created);
    recordAudit(db, {
      action: "vehicle.create",
      entity: "Vehicle",
      entityId: created.id,
      summary: `Menambahkan armada ${created.plat}.`,
    });
    return created;
  });
}

export function deleteVehicle(id: ID) {
  return mutate((db) => {
    const index = db.vehicles.findIndex((v) => v.id === id);
    if (index < 0) throw new ApiError("Armada tidak ditemukan.", 404);
    const [removed] = db.vehicles.splice(index, 1);
    recordAudit(db, {
      action: "vehicle.delete",
      entity: "Vehicle",
      entityId: removed.id,
      summary: `Menghapus armada ${removed.plat}.`,
    });
  });
}

/**
 * The mock LPG 3kg's own weight and the transport-fee rate -- neither exists
 * as real mock data (ProductEntity carries no weightKg, and there is no mock
 * `transport_fee_tariffs` table), so both are fixed constants matching the
 * real backend's own confirmed, unchanging default (docs/distribution-
 * business-rules.md §8: Rp354.64/kg has not moved across 33 months of the
 * source spreadsheet). Documented in DATA_SOURCES.md's own transportation
 * row -- a real per-product weight and a real tariff history are both out of
 * scope for the mock, not silently invented as if they were live data.
 */
const MOCK_WEIGHT_KG_PER_UNIT = 3;
const MOCK_TARIFF_RATE_PER_KG = 354.64;

function periodBounds(period: string): { periodStart: string; periodEnd: string } {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) throw new ApiError("Periode harus berformat YYYY-MM.");
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { periodStart: isoDate(start), periodEnd: isoDate(end) };
}

/** Opens an empty draft for one billing period -- no lines, no amount. generateTransportationClaimLines derives both. */
export function saveTransportationClaim(
  input: {
    id?: ID;
    period?: string;
    handoverDate?: string;
    handoverReference?: string;
    branchId?: ID;
  },
): TransportationClaimEntity {
  return mutate((db) => {
    if (input.id) {
      const existing = db.transportationClaims.find((c) => c.id === input.id);
      if (!existing) throw new ApiError("Klaim BAST tidak ditemukan.", 404);
      if (input.handoverReference !== undefined) existing.handoverReference = input.handoverReference.trim() || undefined;
      if (input.handoverDate !== undefined) existing.handoverDate = input.handoverDate;
      existing.version += 1;
      existing.updatedAt = new Date().toISOString();
      recordAudit(db, {
        action: "transportation_claim.update",
        entity: "TransportationClaim",
        entityId: existing.id,
        summary: `Memperbarui klaim BAST ${existing.claimNumber}.`,
      });
      return existing;
    }

    if (!input.period) throw new ApiError("Periode wajib diisi.");
    if (!input.handoverDate) throw new ApiError("Tanggal serah terima wajib diisi.");
    const { periodStart, periodEnd } = periodBounds(input.period);

    const now = new Date();
    const created: TransportationClaimEntity = {
      ...stampScope({}, input.branchId ? { branchId: input.branchId } : undefined),
      id: nextId("bast"),
      claimNumber: `BAST-${input.period.replace("-", "")}-${String(db.transportationClaims.length + 1).padStart(4, "0")}`,
      handoverReference: input.handoverReference?.trim() || undefined,
      handoverDate: input.handoverDate,
      periodStart,
      periodEnd,
      claimedAmount: 0,
      totalQty: 0,
      totalWeightKg: 0,
      claimStatus: "draft",
      deliveryIds: [],
      version: 1,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    db.transportationClaims.unshift(created);
    recordAudit(db, {
      action: "transportation_claim.create",
      entity: "TransportationClaim",
      entityId: created.id,
      summary: `Membuka klaim BAST untuk periode ${input.period}.`,
    });
    return created;
  });
}

/**
 * (Re)derives a draft's lines from Selesai deliveries in its own branch and
 * period, priced at the mock's own fixed rate/weight (see those constants'
 * own doc). Regeneration replaces the previous set wholesale, the same
 * "delete then re-derive" contract the real GenerateLines carries.
 *
 * Ledger posting on submit/paid/reject is NOT wired in the mock -- doing so
 * would mean extending AccountRole/JournalSourceType (both closed unions
 * that already lag the real backend's own expense/purchase source types)
 * for every feature, not just this one. Documented as a gap in
 * DATA_SOURCES.md rather than silently simulated.
 */
export function generateTransportationClaimLines(id: ID): TransportationClaimEntity {
  return mutate((db) => {
    const claim = db.transportationClaims.find((c) => c.id === id);
    if (!claim) throw new ApiError("Klaim BAST tidak ditemukan.", 404);
    if (claim.claimStatus !== "draft") {
      throw new ApiError(
        "Hanya klaim berstatus draft yang lini-nya dapat dibuat ulang -- klaim yang sudah " +
          "diserahkan adalah catatan yang sudah dikirim ke prinsipal.",
        409,
      );
    }
    if (!claim.periodStart || !claim.periodEnd) {
      throw new ApiError("Klaim ini tidak memiliki periode penagihan.", 409);
    }

    const alreadyClaimed = new Set(
      db.transportationClaims.filter((c) => c.id !== id).flatMap((c) => c.deliveryIds),
    );
    const matched = db.deliveries.filter(
      (d) =>
        d.branchId === claim.branchId &&
        d.status === "Selesai" &&
        d.tanggal >= claim.periodStart! &&
        d.tanggal < claim.periodEnd! &&
        !alreadyClaimed.has(d.id),
    );

    let totalQty = 0;
    for (const delivery of matched) {
      for (const line of delivery.lines) totalQty += line.realisasi;
    }
    const totalWeightKg = totalQty * MOCK_WEIGHT_KG_PER_UNIT;
    const claimedAmount = Math.round(totalWeightKg * MOCK_TARIFF_RATE_PER_KG * 100) / 100;

    claim.deliveryIds = matched.map((d) => d.id);
    claim.totalQty = totalQty;
    claim.totalWeightKg = totalWeightKg;
    claim.claimedAmount = claimedAmount;
    claim.version += 1;
    claim.updatedAt = new Date().toISOString();
    recordAudit(db, {
      action: "transportation_claim.generate_lines",
      entity: "TransportationClaim",
      entityId: claim.id,
      summary: `Membuat ulang lini klaim BAST ${claim.claimNumber} dari ${matched.length} pengiriman.`,
    });
    return claim;
  });
}

/**
 * Records what the agent read off iVendor -- any of the six statuses, in any
 * order. settledAt/settledAmount/settlementMode are required together only
 * on the transition to "paid", and settledAmount must match the claim's own
 * claimedAmount -- mirrors the real UpdateStatusRequest's own rule.
 */
export function updateTransportationClaimStatus(
  id: ID,
  claimStatus: TransportationClaimEntity["claimStatus"],
  principalInvoiceNumber?: string,
  statusNote?: string,
  settlement?: { settledAt?: string; settledAmount?: number; settlementMode?: "cash" | "bank" },
): TransportationClaimEntity {
  return mutate((db) => {
    const claim = db.transportationClaims.find((c) => c.id === id);
    if (!claim) throw new ApiError("Klaim BAST tidak ditemukan.", 404);

    if (claimStatus === "paid") {
      if (!settlement?.settledAt || !settlement.settledAmount || !settlement.settlementMode) {
        throw new ApiError(
          "Menandai klaim lunas memerlukan tanggal pelunasan, jumlah, dan metode pembayaran.",
        );
      }
      if (settlement.settledAmount !== claim.claimedAmount) {
        throw new ApiError(
          `Jumlah pelunasan ${settlement.settledAmount} tidak sama dengan nilai klaim ` +
            `${claim.claimedAmount} -- pemotongan pajak atau pembayaran sebagian belum didukung.`,
        );
      }
      claim.settledAt = settlement.settledAt;
      claim.settledAmount = settlement.settledAmount;
      claim.settlementMode = settlement.settlementMode;
    }

    claim.claimStatus = claimStatus;
    if (principalInvoiceNumber !== undefined) claim.principalInvoiceNumber = principalInvoiceNumber;
    if (statusNote !== undefined) claim.statusNote = statusNote;
    claim.statusUpdatedAt = new Date().toISOString();
    claim.version += 1;
    claim.updatedAt = claim.statusUpdatedAt;
    recordAudit(db, {
      action: "transportation_claim.status",
      entity: "TransportationClaim",
      entityId: claim.id,
      summary: `Status BAST ${claim.claimNumber} diubah menjadi ${claimStatus}.`,
    });
    return claim;
  });
}

/** Refused once the claim has left 'draft' -- mirrors the real service's own rule. */
export function deleteTransportationClaim(id: ID) {
  return mutate((db) => {
    const claim = db.transportationClaims.find((c) => c.id === id);
    if (!claim) throw new ApiError("Klaim BAST tidak ditemukan.", 404);
    if (claim.claimStatus !== "draft") {
      throw new ApiError(
        "Hanya klaim berstatus draft yang dapat dihapus -- klaim yang sudah diserahkan adalah " +
          "catatan yang sudah dikirim ke prinsipal. Ubah statusnya sebagai gantinya.",
        409,
      );
    }
    db.transportationClaims = db.transportationClaims.filter((c) => c.id !== id);
    recordAudit(db, {
      action: "transportation_claim.delete",
      entity: "TransportationClaim",
      entityId: claim.id,
      summary: `Menghapus klaim BAST ${claim.claimNumber}.`,
    });
  });
}

/**
 * Records one Surat Peringatan against an outlet — D3 A-Step 3. Read+create
 * only: no update or delete pairs with this, the same as the transportation
 * claim's own delete guard has no counterpart for a status the schema calls
 * final. A warning is corrected by issuing a new entry.
 */
export function createOutletWarning(
  input: Partial<OutletWarningEntity> & { outletId: ID },
): OutletWarningEntity {
  return mutate((db) => {
    const pkl = db.outlets.find((p) => p.id === input.outletId);
    if (!pkl) throw new ApiError("Outlet tidak ditemukan.", 404);
    if (!input.reason?.trim()) {
      throw new ApiError("Alasan SP wajib diisi.");
    }

    const now = new Date();
    const created: OutletWarningEntity = {
      ...stampScope({}),
      id: nextId("spr"),
      outletId: input.outletId,
      issuedOn: input.issuedOn ?? isoDate(now),
      reason: input.reason.trim(),
      notes: input.notes?.trim() || undefined,
      createdAt: now.toISOString(),
    };
    db.outletWarnings.unshift(created);
    recordAudit(db, {
      action: "outlet_warning.create",
      entity: "OutletWarning",
      entityId: created.id,
      summary: `Mencatat SP untuk ${pkl.nama}.`,
    });
    return created;
  });
}

export function deleteDriver(id: ID) {
  return mutate((db) => {
    const drv = db.drivers.find((d) => d.id === id);
    if (!drv) throw new ApiError("Driver tidak ditemukan.", 404);
    if (db.deliveries.some((d) => d.driverId === id && d.status !== "Selesai")) {
      throw new ApiError(
        `${drv.nama} masih menjalankan surat jalan hari ini. Tugaskan ulang sebelum menghapus.`,
      );
    }
    db.drivers = db.drivers.filter((d) => d.id !== id);
    recordAudit(db, {
      action: "driver.delete",
      entity: "Driver",
      entityId: id,
      summary: `Menghapus driver ${drv.nama}.`,
    });
  });
}

export function saveUser(input: Partial<UserEntity> & { id?: ID }): UserEntity {
  return mutate((db) => {
    if (!input.nama?.trim()) throw new ApiError("Nama pengguna wajib diisi.");
    if (!input.email?.trim()) throw new ApiError("Email wajib diisi.");

    const clash = db.users.find(
      (u) => u.email.toLowerCase() === input.email!.toLowerCase() && u.id !== input.id,
    );
    if (clash) throw new ApiError(`Email ${input.email} sudah dipakai.`, 409);

    if (input.id) {
      const existing = db.users.find((u) => u.id === input.id);
      if (!existing) throw new ApiError("Pengguna tidak ditemukan.", 404);
      Object.assign(existing, input);
      recordAudit(db, {
        action: "user.update",
        entity: "User",
        entityId: existing.id,
        summary: `Memperbarui akun ${existing.nama} (${existing.role}).`,
      });
      return existing;
    }

    const created: UserEntity = {
      id: nextId("usr"),
      nama: input.nama.trim(),
      email: input.email.trim(),
      role: input.role ?? "staff",
      telepon: input.telepon ?? "",
      cabang: input.cabang ?? "Semua cabang",
      driverId: input.driverId,
      branchIds: input.branchIds ?? [],
      scopeType: input.scopeType ?? "tenant",
      status: "Diundang",
      dibuatPada: isoDate(startOfToday()),
    };
    db.users.unshift(created);
    recordAudit(db, {
      action: "user.invite",
      entity: "User",
      entityId: created.id,
      summary: `Mengundang ${created.nama} sebagai ${created.role}.`,
    });
    notify(db, {
      type: "Sistem",
      title: "Undangan pengguna terkirim",
      message: `${created.nama} diundang bergabung sebagai ${created.role}.`,
      href: "/users",
    });
    return created;
  });
}

export function deleteUser(id: ID) {
  return mutate((db) => {
    const user = db.users.find((u) => u.id === id);
    if (!user) throw new ApiError("Pengguna tidak ditemukan.", 404);
    if (user.role === "admin" && db.users.filter((u) => u.role === "admin").length === 1) {
      throw new ApiError("Sistem harus punya minimal satu admin.");
    }
    db.users = db.users.filter((u) => u.id !== id);
    recordAudit(db, {
      action: "user.delete",
      entity: "User",
      entityId: id,
      summary: `Menghapus akun ${user.nama}.`,
    });
  });
}

export function saveProduct(
  input: Partial<ProductEntity> & { id?: ID },
): ProductEntity {
  return mutate((db) => {
    if (!input.nama?.trim()) throw new ApiError("Nama produk wajib diisi.");
    if ((input.hargaJual ?? 0) <= 0) throw new ApiError("Harga jual harus lebih dari nol.");

    if (input.id) {
      const existing = db.products.find((p) => p.id === input.id);
      if (!existing) throw new ApiError("Produk tidak ditemukan.", 404);
      Object.assign(existing, input);
      recordAudit(db, {
        action: "product.update",
        entity: "Product",
        entityId: existing.id,
        summary: `Memperbarui produk ${existing.nama}.`,
      });
      return existing;
    }

    const seq = db.products.length + 1;
    const created: ProductEntity = {
      id: nextId("prd"),
      kode: input.kode?.trim() || `SKU-${String(seq).padStart(4, "0")}`,
      nama: input.nama.trim(),
      ukuran: input.ukuran ?? "",
      satuan: input.satuan?.trim() || "unit",
      returnable: input.returnable ?? false,
      hargaJual: input.hargaJual!,
      hargaBeli: input.hargaBeli ?? 0,
      stok: input.stok ?? 0,
      stokMinimum: input.stokMinimum ?? 0,
      aktif: input.aktif ?? true,
    };
    db.products.unshift(created);
    recordAudit(db, {
      action: "product.create",
      entity: "Product",
      entityId: created.id,
      summary: `Menambahkan produk ${created.nama} (${created.kode}).`,
    });
    return created;
  });
}

export function deleteProduct(id: ID) {
  return mutate((db) => {
    const p = db.products.find((x) => x.id === id);
    if (!p) throw new ApiError("Produk tidak ditemukan.", 404);
    db.products = db.products.filter((x) => x.id !== id);
    recordAudit(db, {
      action: "product.delete",
      entity: "Product",
      entityId: id,
      summary: `Menghapus produk ${p.nama}.`,
    });
  });
}

export function adjustStock(id: ID, delta: number, alasan: string) {
  return mutate((db) => {
    const p = db.products.find((x) => x.id === id);
    if (!p) throw new ApiError("Produk tidak ditemukan.", 404);
    if (delta === 0) throw new ApiError("Masukkan jumlah penyesuaian.");
    if (p.stok + delta < 0) {
      throw new ApiError(`Stok ${p.nama} tidak cukup untuk pengurangan sebesar ${fmt(Math.abs(delta))}.`);
    }
    p.stok += delta;
    recordAudit(db, {
      action: "product.stock",
      entity: "Product",
      entityId: p.id,
      summary: `Menyesuaikan stok ${p.nama} ${delta > 0 ? "+" : ""}${fmt(delta)} — ${alasan}.`,
    });
    if (p.aktif && p.stok < p.stokMinimum) {
      notify(db, {
        type: "Alert",
        title: "Stok di bawah minimum",
        message: `${p.nama} tersisa ${fmt(p.stok)}, di bawah ambang ${fmt(p.stokMinimum)}.`,
        href: "/products",
      rule: "stockLow",
      });
    }
    return p;
  });
}

export function saveSettings(patch: Partial<Database["settings"]>) {
  return mutate((db) => {
    // Written to the ACTING tenant's own row, never to db.settings.
    //
    // db.settings is derived — the acting tenant's values resolved up the tree
    // — so assigning to it would look like it worked and be discarded on the
    // next getDb(). Worse, if it did persist, every inherited value the form
    // rendered would become an override this tenant never chose, and its parent
    // could not change it for them again. Writing only the patch keeps
    // "inherited" and "set here" distinguishable.
    const tenantId = getActiveScope().actingTenantId;
    const own = db.settingsByTenant.find((r) => r.tenantId === tenantId);
    if (own) {
      own.values = { ...own.values, ...patch };
    } else {
      db.settingsByTenant.push({ tenantId, values: { ...patch } });
    }
    db.settings = { ...db.settings, ...patch };

    recordAudit(db, {
      action: "settings.update",
      entity: "Settings",
      entityId: "app",
      summary: "Memperbarui pengaturan aplikasi.",
    });
    return db.settings;
  });
}

/**
 * Nudges today's run forward: queued drops start, running drops load, finished
 * drops raise invoices. Called on a timer so the monitoring board breathes.
 */
export function advanceOperations(): boolean {
  return mutate((db) => {
    const today = isoDate(startOfToday());
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    let changed = false;

    for (const d of db.deliveries) {
      if (d.tanggal !== today) continue;
      const planned = Number(d.jamRencana.slice(0, 2)) * 60 + Number(d.jamRencana.slice(3));

      if (d.status === "Antrian" && minutes >= planned - 20) {
        d.status = "Proses";
        d.mulaiPada = now.toISOString();
        const pkl = db.outlets.find((p) => p.id === d.outletId);
        if (pkl) {
          d.driverLat = pkl.lat + (Math.random() - 0.5) * 0.03;
          d.driverLng = pkl.lng + (Math.random() - 0.5) * 0.03;
        }
        changed = true;
      } else if (d.status === "Proses") {
        const step = Math.ceil(d.target * (0.08 + Math.random() * 0.12));
        d.realisasi = Math.min(d.target, d.realisasi + step);
        // Lines are what the invoice is priced from, so simulated progress has
        // to move them too. Advancing only the headline total would leave a
        // clock-completed drop invoicing against stale line quantities.
        d.lines = applyScalarRealisasi(d.lines, d.realisasi);
        const pkl = db.outlets.find((p) => p.id === d.outletId);
        if (pkl && d.driverLat != null && d.driverLng != null) {
          d.driverLat += (pkl.lat - d.driverLat) * 0.35;
          d.driverLng += (pkl.lng - d.driverLng) * 0.35;
        }
        if (d.realisasi >= d.target) {
          d.status = "Selesai";
          d.selesaiPada = now.toISOString();
          d.driverLat = undefined;
          d.driverLng = undefined;
          raiseInvoice(db, d);
        }
        changed = true;
      }
    }

    if (changed) {
      for (const driver of db.drivers) refreshDriverStatus(db, driver.id);
    }

    return changed;
  });
}

/**
 * Removes a tenant's override so the field inherits again.
 *
 * Deletes the key rather than writing null or an empty string. An absent key is
 * what "not set here, ask my parent" means in this shape — a null would be a
 * value the tenant had chosen, and "" would pin an empty lexicon term that the
 * parent could never correct.
 */
export function clearOverride(field: keyof Database["settings"]) {
  return mutate((db) => {
    const tenantId = getActiveScope().actingTenantId;
    const own = db.settingsByTenant.find((r) => r.tenantId === tenantId);
    if (own) delete own.values[field];

    recordAudit(db, {
      action: "settings.inherit",
      entity: "Settings",
      entityId: String(field),
      summary: `Mengembalikan "${String(field)}" ke pengaturan induk.`,
    });
    // Re-resolved on the next getDb(), so the caller sees the parent's value.
    return db.settingsByTenant;
  });
}

/* ── geofencing ────────────────────────────────────────────────────────── */

/**
 * Save a fence.
 *
 * The shape rules mirror the service's own, so the demo refuses what the API
 * would refuse rather than accepting it and failing on the real build:
 * ck_geofence_rules_shape wants exactly one of centre+radius or boundary, and
 * ck_geofence_rules_territory wants an outlet on a territory rule.
 *
 * rule_type is fixed at create. Swapping a circle for a polygon is a different
 * fence wearing the old one's code, and the service has no field to say so.
 */
export function saveGeofenceRule(
  input: Partial<GeofenceRuleEntity> & { id?: ID },
): GeofenceRuleEntity {
  return mutate((db) => {
    const kode = input.kode?.trim();
    if (!input.id && !kode) throw new ApiError("Kode aturan wajib diisi.");
    if (!input.nama?.trim()) throw new ApiError("Nama aturan wajib diisi.");
    if (kode && db.geofenceRules.some((r) => r.kode === kode && r.id !== input.id)) {
      throw new ApiError(`Kode ${kode} sudah dipakai aturan lain.`, 409);
    }
    if (input.subjek === "Wilayah outlet" && !input.outletId) {
      throw new ApiError("Aturan wilayah outlet harus menyebut outlet-nya.");
    }
    if (input.bentuk?.jenis === "Lingkaran" && input.bentuk.radiusMeter <= 0) {
      throw new ApiError("Radius harus lebih dari nol.");
    }
    if (input.bentuk?.jenis === "Poligon" && input.bentuk.batas.length < 3) {
      throw new ApiError("Poligon memerlukan minimal 3 titik.");
    }

    if (input.id) {
      const existing = db.geofenceRules.find((r) => r.id === input.id);
      if (!existing) throw new ApiError("Aturan tidak ditemukan.", 404);
      if (input.bentuk && input.bentuk.jenis !== existing.bentuk.jenis) {
        throw new ApiError(
          "Jenis pagar tidak bisa diubah. Buat aturan baru untuk bentuk yang lain.",
        );
      }
      Object.assign(existing, input, { version: existing.version + 1 });
      recordAudit(db, {
        action: "geofence.update",
        entity: "GeofenceRule",
        entityId: existing.id,
        summary: `Memperbarui pagar ${existing.nama}.`,
      });
      return existing;
    }

    if (!input.bentuk) throw new ApiError("Bentuk pagar wajib dipilih.");
    const created: GeofenceRuleEntity = {
      ...stampScope({}),
      id: nextId("gfr"),
      kode: kode!,
      nama: input.nama.trim(),
      keterangan: input.keterangan,
      bentuk: input.bentuk,
      subjek: input.subjek ?? "Rute",
      outletId: input.outletId,
      mode: input.mode ?? "Keluar",
      keparahan: input.keparahan ?? "Peringatan",
      aktif: input.aktif ?? true,
      version: 1,
    };
    db.geofenceRules.unshift(created);
    recordAudit(db, {
      action: "geofence.create",
      entity: "GeofenceRule",
      entityId: created.id,
      summary: `Menambahkan pagar ${created.nama}.`,
    });
    return created;
  });
}

export function deleteGeofenceRule(id: ID) {
  return mutate((db) => {
    const index = db.geofenceRules.findIndex((r) => r.id === id);
    if (index < 0) throw new ApiError("Aturan tidak ditemukan.", 404);
    const [removed] = db.geofenceRules.splice(index, 1);
    recordAudit(db, {
      action: "geofence.delete",
      entity: "GeofenceRule",
      entityId: removed.id,
      summary: `Menghapus pagar ${removed.nama}.`,
    });
  });
}

/**
 * Move an alert along its lifecycle.
 *
 * The same transitions the service allows, and the same refusals: there is no
 * way back to Terbuka, and Selesai and Bukan pelanggaran are terminal. A demo
 * that let an operator reopen a closed alert would teach a habit the real
 * build answers with a 409.
 */
export function setGeofenceAlertStatus(
  id: ID,
  status: GeofenceAlertEntity["status"],
  catatan?: string,
): GeofenceAlertEntity {
  return mutate((db) => {
    const alert = db.geofenceAlerts.find((a) => a.id === id);
    if (!alert) throw new ApiError("Peringatan tidak ditemukan.", 404);
    if (alert.status === "Selesai" || alert.status === "Bukan pelanggaran") {
      throw new ApiError(
        `Peringatan ini sudah ${alert.status.toLowerCase()} dan tidak bisa diubah lagi.`,
        409,
      );
    }
    if (status === "Terbuka") {
      throw new ApiError("Peringatan tidak bisa dibuka kembali.", 409);
    }
    alert.status = status;
    alert.version += 1;
    if (catatan) alert.catatan = catatan;
    recordAudit(db, {
      action: "geofence.alert.update",
      entity: "GeofenceAlert",
      entityId: alert.id,
      summary: `Peringatan pagar ditandai ${status.toLowerCase()}.`,
    });
    return alert;
  });
}
