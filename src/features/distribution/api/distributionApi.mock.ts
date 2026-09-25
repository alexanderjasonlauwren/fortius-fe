/**
 * Distribution planning against the browser store.
 *
 * The demo build's implementation, and the one the browser packer in
 * `suggestAssignment.ts` was written for. It stays exactly as capable as it
 * was: what changed is that it is now one of two adapters behind a contract,
 * rather than the only thing the console can talk to.
 */
import { crewedArmada, crewedVehicle } from "@/mocks/fleet";
import { getActiveScope, scopedDb } from "@/mocks/scope";
import { ApiError, currentActorId, latency, mutate, nextId, recordAudit } from "@/mocks/db";
import {
  cancelPlan,
  confirmPlan as confirmPlanRule,
  createPlan as createPlanRule,
  savePlanRows,
  scheduleOrders,
} from "@/mocks/rules";
import { printDocument } from "@/lib/export";
import { outletExposure } from "@/mocks/ar";
import { isoDate, startOfToday } from "@/mocks/seed";
import type { PlanEntity, PlanRowEntity } from "@/mocks/types";
import type {
  AssignmentSuggestion,
  DistributionMonthGrid,
  DistributionPaymentBoard,
  DistributionPlan,
  DriverOption,
  PlanOption,
  PlanRow,
  SAOutletPlanRow,
  VehicleOption,
} from "../types";
import type {
  CreditOverrideInput,
  DispatchResult,
  DistributionApi,
  TripAssignment,
} from "./contract";
import { suggestAssignment as suggestAssignmentLocal } from "./suggestAssignment";
import { compareStops } from "../lib/stopOrder";
import { outletLabelTitle, unitLabel, unitLabelTitle } from "@/lib/lexicon";

function toPlanView(plan: PlanEntity): DistributionPlan {
  const db = scopedDb();
  const rows = db.planRows.filter((r) => r.planId === plan.id);
  const sa = db.scheduleAgreements.find((s) => s.id === plan.saId);

  return {
    id: plan.id,
    kode: plan.kode,
    tanggal: plan.tanggal,
    totalUnit: rows.reduce((s, r) => s + r.jumlahUnit, 0),
    jumlahOutlet: rows.length,
    jumlahDriver: new Set(rows.map((r) => r.driverId).filter(Boolean)).size,
    status: plan.status,
    saId: plan.saId,
    nomorSA: sa?.nomorSA ?? "—",
    sisaKuotaSA: sa ? Math.max(0, sa.totalKuota - sa.dialokasikan) : 0,
    catatan: plan.catatan,
    dibuatOleh: plan.dibuatOleh,
    dikonfirmasiOleh: plan.dikonfirmasiOleh,
    dikonfirmasiPada: plan.dikonfirmasiPada,
    version: plan.version,
  };
}

async function getPlanList(): Promise<DistributionPlan[]> {
  await latency("read");
  return scopedDb()
    .plans.slice()
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
    .map(toPlanView);
}

async function getPlan(planId: string): Promise<DistributionPlan> {
  await latency("read");
  const plan = scopedDb().plans.find((p) => p.id === planId);
  if (!plan) throw new Error("Rencana distribusi tidak ditemukan.");
  return toPlanView(plan);
}

async function getPlanDetail(planId: string): Promise<PlanRow[]> {
  await latency("read");
  const db = scopedDb();
  const monthStart = isoDate(
    new Date(startOfToday().getFullYear(), startOfToday().getMonth(), 1),
  );

  return db.planRows
    .filter((r) => r.planId === planId)
    .map((r) => {
      const pkl = db.outlets.find((p) => p.id === r.outletId);
      const driver = db.drivers.find((d) => d.id === r.driverId);
      const takenThisMonth = db.deliveries
        .filter((d) => d.outletId === r.outletId && d.tanggal >= monthStart)
        .reduce((s, d) => s + d.target, 0);
      // Credit standing, not "is there an unverified transfer" — this column
      // is what tells the planner a stop is about to be refused.
      const exp = outletExposure(db, r.outletId);

      return {
        id: r.id,
        outletId: r.outletId,
        outlet: pkl?.nama ?? "—",
        alamat: pkl ? `${pkl.alamat}, Kec. ${pkl.kecamatan}` : "—",
        lines: r.lines.map((l) => ({ ...l })),
        jumlahUnit: r.jumlahUnit,
        driverId: r.driverId,
        driver: driver?.nama ?? "Belum ditetapkan",
        // The truck the run is on. Falls back to `crewedVehicle` for a board
        // saved before vehicles existed — the same stand-in the rest of the
        // demo uses for a pairing the service keeps on the trip.
        vehicleId: r.vehicleId ?? (r.driverId ? crewedVehicle(db, r.driverId)?.id ?? null : null),
        vehicle:
          db.vehicles.find(
            (v) => v.id === (r.vehicleId ?? (r.driverId ? crewedVehicle(db, r.driverId)?.id : null)),
          )?.plat ?? "Belum ditetapkan",
        jamPengiriman: r.jamPengiriman,
        tripNo: r.tripNo ?? null,
        urutan: r.urutan ?? null,
        // The mock has no trips table, so a run has no id of its own — the
        // same `driverId#tripNo` key the planner already groups rows by
        // stands in for one. See `dispatchTrip`'s own header comment.
        tripId: r.driverId && r.tripNo ? `${r.driverId}#${r.tripNo}` : null,
        statusBayar: exp.terblokir ? "Belum Lunas" : "Lunas",
        sisaKuotaOutlet: Math.max(0, (pkl?.kuotaBulanan ?? 0) - takenThisMonth),
        piutang: exp.outstanding,
        piutangJatuhTempo: exp.jatuhTempo,
        alasanBlokir: exp.alasan,
      } satisfies PlanRow;
    })
    // By run and position, matching the http build and the board itself --
    // not delivery-hour order, which said nothing about which truck a stop was
    // on or where in its route it fell.
    .sort(compareStops);
}

function datesInMonth(month: string): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12) return [];
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from({ length: count }, (_, index) =>
    `${month}-${String(index + 1).padStart(2, "0")}`,
  );
}

async function getMonthlyGrid(month: string): Promise<DistributionMonthGrid> {
  await latency("read");
  const db = scopedDb();
  const dates = datesInMonth(month);
  const dateSet = new Set(dates);
  const plansById = new Map(
    db.plans.filter((plan) => dateSet.has(plan.tanggal)).map((plan) => [plan.id, plan]),
  );
  const plannedByOutlet = new Map<string, Record<string, number>>();
  for (const row of db.planRows) {
    const plan = plansById.get(row.planId);
    if (!plan) continue;
    const cells = plannedByOutlet.get(row.outletId) ?? {};
    cells[plan.tanggal] = (cells[plan.tanggal] ?? 0) + row.jumlahUnit;
    plannedByOutlet.set(row.outletId, cells);
  }

  const requiredByDate = new Map<string, number>();
  for (const target of db.saDailyTargets) {
    if (!dateSet.has(target.tanggal)) continue;
    requiredByDate.set(target.tanggal, (requiredByDate.get(target.tanggal) ?? 0) + target.target);
  }
  const rows = db.outlets
    .filter((outlet) => outlet.status === "Aktif")
    .sort((a, b) => a.kode.localeCompare(b.kode))
    .map((outlet) => {
      const cells = plannedByOutlet.get(outlet.id) ?? {};
      const total = Object.values(cells).reduce((sum, qty) => sum + qty, 0);
      return {
        outletId: outlet.id,
        outletCode: outlet.kode,
        outletName: outlet.nama,
        cells,
        targetQty: outlet.kuotaBulanan,
        total,
        remainingQty: outlet.kuotaBulanan - total,
      };
    });
  const footer = dates.map((date) => {
    const planned = rows.reduce((sum, row) => sum + (row.cells[date] ?? 0), 0);
    const required = requiredByDate.get(date) ?? 0;
    return { date, planned, required, hasTarget: requiredByDate.has(date), shortfall: required - planned };
  });
  const planned = footer.reduce((sum, day) => sum + day.planned, 0);
  const required = footer.reduce((sum, day) => sum + day.required, 0);
  return {
    month,
    dates,
    rows,
    footer,
    totals: { planned, required, shortfall: required - planned, outlets: rows.length },
  };
}

async function getPaymentBoard(date: string): Promise<DistributionPaymentBoard> {
  await latency("read");
  const db = scopedDb();
  const plans = db.plans.filter((plan) => plan.tanggal === date);
  const rowsByOutlet = new Map<string, { planned: number; funded: number; orderIds: Set<string> }>();
  for (const plan of plans) {
    const details = await getPlanDetail(plan.id);
    for (const row of details) {
      const current = rowsByOutlet.get(row.outletId) ?? { planned: 0, funded: 0, orderIds: new Set<string>() };
      current.planned += row.jumlahUnit;
      if (row.statusBayar === "Lunas") current.funded += row.jumlahUnit;
      current.orderIds.add(plan.id);
      rowsByOutlet.set(row.outletId, current);
    }
  }
  const rows = [...rowsByOutlet].map(([outletId, amounts]) => {
    const outlet = db.outlets.find((item) => item.id === outletId);
    const unpaidQty = amounts.planned - amounts.funded;
    const orderIds = [...amounts.orderIds];
    return {
      outletId,
      outletCode: outlet?.kode ?? "—",
      outletName: outlet?.nama ?? "—",
      plannedQty: amounts.planned,
      fundedQty: amounts.funded,
      unpaidQty,
      creditQty: 0,
      deliveredQty: db.deliveries
        .filter((delivery) => delivery.outletId === outletId && delivery.tanggal === date)
        .reduce((sum, delivery) => sum + delivery.realisasi, 0),
      // The mock has never priced a plan line -- see PlanRow, which carries
      // no unit price at all -- so there is no honest rupiah figure to sum.
      // hasUnpricedLine: true says so rather than reporting a silent 0 as if
      // every line were priced and simply worth nothing.
      plannedAmount: 0,
      fundedAmount: 0,
      hasUnpricedLine: true,
      distributionOrderId: orderIds[0] ?? "",
      planCount: orderIds.length,
      // Which receipt funds this stop is tracked only inside financeApi.mock
      // (module-local, not this shared db) -- see its own "distribution
      // funding" section for why. Left undefined here rather than guessed.
      fundingPaymentId: undefined,
      fundingPaymentNumber: undefined,
      state: unpaidQty === 0 ? ("paid" as const) : amounts.funded > 0 ? ("partial" as const) : ("unpaid" as const),
      lastPaymentAt: undefined,
      late: undefined,
      hasUnverifiedPayment: false,
    };
  });
  const targetRows = db.saDailyTargets.filter((target) => target.tanggal === date);
  const required = targetRows.reduce((sum, target) => sum + target.target, 0);
  const planned = rows.reduce((sum, row) => sum + row.plannedQty, 0);
  const funded = rows.reduce((sum, row) => sum + row.fundedQty, 0);
  const unpaid = rows.reduce((sum, row) => sum + row.unpaidQty, 0);
  const delivered = rows.reduce((sum, row) => sum + row.deliveredQty, 0);
  return {
    date,
    cutoff: "",
    timezone: "Asia/Jakarta",
    rows,
    summary: {
      required,
      hasTarget: targetRows.length > 0,
      planned,
      funded,
      unpaid,
      delivered,
      shortfall: required - delivered,
      outlets: rows.length,
      paidOutlets: rows.filter((row) => row.state === "paid").length,
      lateOutlets: 0,
    },
  };
}

async function saveDraft(planId: string, rows: PlanRow[], version: number): Promise<DistributionPlan> {
  await latency("write");
  savePlanRows(
    planId,
    rows.map((r) => ({
      id: r.id,
      outletId: r.outletId,
      driverId: r.driverId,
      vehicleId: r.vehicleId,
      // A row edited on a screen that still only knows totals keeps its mix and
      // pushes the change onto the first line, rather than dropping the rest.
      lines: r.lines.filter((l) => l.productId && l.jumlah > 0),
      // Recomputed by the rules layer from the lines; sent only so the shape
      // matches the entity.
      jumlahUnit: r.jumlahUnit,
      jamPengiriman: r.jamPengiriman,
      // Persisted, or accepting a suggestion would collapse every trip back
      // into one the moment the draft was saved.
      tripNo: r.tripNo,
      // Same reasoning as tripNo -- a saved order that forgot its stops'
      // positions would reopen to alphabetical order regardless of what the
      // planner arranged.
      urutan: r.urutan ?? null,
    })),
    version,
  );
  const saved = scopedDb().plans.find((plan) => plan.id === planId);
  if (!saved) throw new Error("Rencana distribusi tidak ditemukan.");
  return toPlanView(saved);
}

async function confirmPlan(planId: string): Promise<DistributionPlan> {
  await latency("write");
  // The rule reports how many delivery notes it issued; the adapter returns
  // the plan, because that is what both builds can answer. The service confirms
  // the obligation and leaves the paperwork to dispatch, so a shape carrying a
  // delivery count would be one only this adapter could fill.
  confirmPlanRule(planId);
  const plan = scopedDb().plans.find((p) => p.id === planId);
  if (!plan) throw new Error("Rencana distribusi tidak ditemukan.");
  return toPlanView(plan);
}

async function createPlan(input: { tanggal: string; saId: string }) {
  await latency("write");
  return toPlanView(createPlanRule(input));
}

async function createSourcePlan(input: { batchId: string; tanggal: string; notes?: string }) {
  await latency("write");
  const scope = getActiveScope();
  const plan = mutate((db) => {
    const source = db.sim3lonSourceSnapshots.find((row) =>
      row.batchId === input.batchId && row.tenantId === scope.actingTenantId &&
      (!scope.branchId || row.branchId === scope.branchId));
    if (!source || source.status !== "applied" || !source.complete || input.tanggal.slice(0, 7) !== source.periodMonth) {
      throw new ApiError("Sumber SIM3LON belum lengkap atau tidak mencakup tanggal yang dipilih.", 409);
    }
    const sa = db.scheduleAgreements.find((row) => row.id === source.saId && row.tenantId === source.tenantId && row.branchId === source.branchId);
    if (!sa || sa.status === "Draft" || sa.productId !== source.productId) {
      throw new ApiError("Sumber SIM3LON tidak memiliki Base SA aktif yang sesuai.", 409);
    }
    if (db.sim3lonPlanSources.some((row) => row.tenantId === source.tenantId && row.branchId === source.branchId && row.productId === source.productId && row.operationalDate === input.tanggal)) {
      throw new ApiError("Rencana bersumber SIM3LON sudah ada untuk cabang, produk, dan tanggal ini.", 409);
    }
    const dated = source.rows.filter((row) => row.date === input.tanggal);
    if (dated.length === 0 || dated.some((row) => row.qty < 0 || !db.outlets.some((outlet) => outlet.id === row.outletId && outlet.tenantId === source.tenantId && outlet.branchId === source.branchId))) {
      throw new ApiError("Pemetaan pangkalan atau snapshot harian SIM3LON belum lengkap.", 409);
    }
    const positive = dated.filter((row) => row.qty > 0);
    if (positive.length === 0) throw new ApiError("Tidak ada alokasi positif untuk tanggal yang dipilih.", 409);

    const created: PlanEntity = {
      tenantId: source.tenantId, branchId: source.branchId, id: nextId("plan"), version: 1,
      kode: `RD-${input.tanggal.replace(/-/g, "")}-${String(db.plans.length + 1).padStart(3, "0")}`,
      tanggal: input.tanggal, saId: sa.id, status: "Draft", catatan: input.notes,
      dibuatOleh: "", dibuatPada: new Date().toISOString(),
    };
    const rows: PlanRowEntity[] = positive.map((row) => ({
      id: nextId("row"), planId: created.id, outletId: row.outletId, driverId: null,
      vehicleId: null, lines: [{ productId: source.productId, jumlah: row.qty }], jumlahUnit: row.qty,
      jamPengiriman: "07:00", tripNo: null,
    }));
    const total = rows.reduce((sum, row) => sum + row.jumlahUnit, 0);
    if (sa.dialokasikan + total > sa.totalKuota) {
      throw new ApiError("Kuota Base SA tidak cukup untuk rencana sumber ini.", 409);
    }
    const audit = recordAudit(db, { action: "plan.create_from_sim3lon", entity: "DistributionPlan", entityId: created.id,
      summary: `Membuat ${created.kode} dari batch ${source.batchId}: ${rows.length} pangkalan.` });
    created.dibuatOleh = audit.actor;
    db.plans.unshift(created);
    db.planRows.push(...rows);
    sa.dialokasikan += total;
    db.sim3lonPlanSources.push({ tenantId: source.tenantId, branchId: source.branchId, planId: created.id,
      batchId: source.batchId, productId: source.productId, operationalDate: input.tanggal });
    return created;
  });
  return toPlanView(plan);
}

async function cancelDistributionPlan(planId: string): Promise<void> {
  await latency("write");
  cancelPlan(planId);
}

export async function addApprovedOrders(planId: string, orderIds: string[]) {
  await latency("write");
  return scheduleOrders(planId, orderIds);
}

/* ── option lists for the planner ──────────────────────────────────────── */

async function getOutletOptions(): Promise<PlanOption[]> {
  await latency("read");
  return scopedDb()
    .outlets.filter((p) => p.status === "Aktif")
    .sort((a, b) => a.nama.localeCompare(b.nama))
    .map((p) => ({
      id: p.id,
      label: p.nama,
      sublabel: `Kec. ${p.kecamatan} · kuota ${p.kuotaBulanan.toLocaleString("id-ID")}/bln`,
    }));
}

/** What a stop can be loaded with. */
async function getProductOptions(): Promise<
  { id: string; label: string; satuan: string }[]
> {
  await latency("read");
  return scopedDb()
    .products.filter((p) => p.aktif)
    .map((p) => ({ id: p.id, label: p.nama, satuan: p.satuan }));
}

/**
 * The product(s) an agreement is actually for -- see the contract's own doc
 * comment for why a new stop must default to this rather than to
 * `getProductOptions()`'s catalogue-wide list.
 *
 * The mock models a single product per agreement, set only when the demo
 * seed says so; a hand-typed one has none, same as the real backend.
 */
async function getSAProductOptions(
  saId: string,
): Promise<{ id: string; label: string; satuan: string }[]> {
  await latency("read");
  const sa = scopedDb().scheduleAgreements.find((s) => s.id === saId);
  if (!sa?.productId) return [];
  return [{ id: sa.productId, label: sa.productName ?? "Produk", satuan: "" }];
}

/**
 * The mock has no SIM3LON-style per-outlet, per-date import snapshot to read
 * -- see `saApiMock.getImportSummary`'s own comment. An empty plan for the
 * planner to fill by hand is the honest answer, the same one a hand-typed
 * agreement gets from the real backend.
 */
async function getSAOutletPlan(saId: string, tanggal: string): Promise<SAOutletPlanRow[]> {
  void saId;
  void tanggal;
  await latency("read");
  return [];
}

async function getDriverOptions(planId: string): Promise<DriverOption[]> {
  await latency("read");
  const db = scopedDb();
  const rows = db.planRows.filter((r) => r.planId === planId);

  return db.drivers.map((d) => ({
    id: d.id,
    label: d.nama,
    // The truck this driver is out in, from the fleet. The HTTP adapter reads
    // the same pairing from the dispatch board, which is where the service
    // records it -- so an uncrewed driver has no capacity there, and here has
    // the one `crewedVehicle` stands in with.
    sublabel: `${crewedArmada(db, d).plat} · ${crewedArmada(db, d).armada}`,
    kapasitas: crewedArmada(db, d).kapasitas,
    muatan: rows
      .filter((r) => r.driverId === d.id)
      .reduce((s, r) => s + r.jumlahUnit, 0),
    status: d.status,
    disabled: d.status === "Cuti",
  }));
}

async function getVehicleOptions(): Promise<VehicleOption[]> {
  await latency("read");
  return scopedDb()
    .vehicles.filter((v) => v.status === "Aktif")
    .sort((a, b) => a.plat.localeCompare(b.plat))
    .map((v) => ({
      id: v.id,
      label: v.plat,
      sublabel: v.armada,
      kapasitas: v.kapasitas,
    }));
}

/**
 * Commits the board to the browser store.
 *
 * The mock has no trips table, so a run is expressed the way the store already
 * holds it: the driver, the vehicle and the trip number written onto each stop
 * of that run. The service keeps them on `dispatch_trips`; the shape the caller
 * passes is the same either way, which is the point of the contract.
 */
async function applyAssignment(planId: string, trips: TripAssignment[], version: number): Promise<void> {
  await latency("write");
  const placement = new Map<string, { driverId: string; vehicleId: string; tripNo: number; urutan: number }>();
  for (const trip of trips) {
    for (const stop of trip.stops) {
      placement.set(stop.outletId, {
        driverId: trip.driverId,
        vehicleId: trip.vehicleId,
        tripNo: trip.tripNo,
        urutan: stop.sequenceNo,
      });
    }
  }

  const db = scopedDb();
  const rows = db.planRows
    .filter((r) => r.planId === planId)
    .map((r) => {
      const at = placement.get(r.outletId);
      return {
        id: r.id,
        outletId: r.outletId,
        driverId: at?.driverId ?? null,
        vehicleId: at?.vehicleId ?? null,
        lines: r.lines,
        jumlahUnit: r.jumlahUnit,
        jamPengiriman: r.jamPengiriman,
        tripNo: at?.tripNo ?? null,
        urutan: at?.urutan ?? null,
      };
    });
  savePlanRows(planId, rows, version);
}

/**
 * Sends one run's stops out — D3 A-Step 2/3's parity implementation.
 *
 * `tripId` is the synthetic `driverId#tripNo` key `getPlanDetail` already
 * hands back, since the mock has no trips table of its own to name a real
 * one from.
 *
 * `outletExposure` (`mocks/ar.ts`) is the mock's own, pre-existing model of
 * a breach — over the credit limit, or overdue while flagged to hold — and
 * is reused as-is rather than re-derived here. Two known, deliberate gaps
 * against the real service, left as found rather than silently
 * reconciled:
 * - `outletExposure` only evaluates either condition when `blokirOtomatis`
 *   is set; the real API's credit-limit-exceeded check applies regardless
 *   of that flag, and only the overdue-invoice check is conditional on it.
 * - Nothing here checks that a named second approver actually holds
 *   `distribution.override.deliveries` — the mock has no per-user
 *   permission resolution to check it against. Only self-approval (naming
 *   the acting session as its own second approver) is refused, mirroring
 *   `ck_deliveries_credit_override`'s own distinctness rule; an
 *   unauthorised-but-different approver is accepted here where the real
 *   API would refuse it.
 *
 * Nor does the mock persist that a trip has already left: calling this
 * twice for the same run succeeds twice, since there is no `dispatch_trips`
 * row here to guard on — see `PlanRow.tripStatus`'s own doc comment.
 */
async function dispatchTrip(
  tripId: string,
  overrides: CreditOverrideInput[] = [],
): Promise<DispatchResult> {
  await latency("write");
  const db = scopedDb();
  const rows = db.planRows.filter((r) => r.driverId && `${r.driverId}#${r.tripNo}` === tripId);
  if (rows.length === 0) throw new ApiError("Trip tidak ditemukan.", 404);

  const overrideByOutlet = new Map(overrides.map((o) => [o.outletId, o]));
  const actorId = currentActorId();

  for (const row of rows) {
    const exp = outletExposure(db, row.outletId);
    if (!exp.terblokir) continue;

    const override = overrideByOutlet.get(row.outletId);
    const pkl = db.outlets.find((p) => p.id === row.outletId);
    if (!override) {
      throw new ApiError(
        `${pkl?.nama ?? "Outlet ini"} ${exp.alasan ?? "melebihi plafon kreditnya"} -- ` +
          "keberangkatan ditolak tanpa persetujuan kedua yang menyebutkan penyetuju lain.",
        409,
      );
    }
    if (actorId && override.secondApproverId === actorId) {
      throw new ApiError(
        "Penyetuju kedua pada persetujuan kredit harus orang lain, bukan yang sedang mengirim.",
        400,
      );
    }
  }

  return { issued: rows.length };
}

async function getActiveSaOptions(): Promise<PlanOption[]> {
  await latency("read");
  const today = isoDate(startOfToday());
  return scopedDb()
    .scheduleAgreements.filter(
      (s) => s.status !== "Draft" && s.periodeBerakhir >= today,
    )
    .map((s) => ({
      id: s.id,
      label: s.nomorSA,
      sublabel: `${s.supplier} · sisa ${(s.totalKuota - s.dialokasikan).toLocaleString("id-ID")} ${unitLabel()}`,
      disabled: s.dialokasikan >= s.totalKuota,
    }));
}

/** Prints the route sheet handed to drivers at the depot. */
export async function printRouteSheet(planId: string): Promise<void> {
  await latency("read");
  const db = scopedDb();
  const plan = db.plans.find((p) => p.id === planId);
  if (!plan) throw new Error("Rencana distribusi tidak ditemukan.");

  // By run and position, matching `compareStops` -- a stop with neither sorts
  // last, by outlet name.
  const rows = db.planRows
    .filter((r) => r.planId === planId)
    .sort((a, b) => {
      const tripA = a.tripNo ?? Infinity;
      const tripB = b.tripNo ?? Infinity;
      if (tripA !== tripB) return tripA - tripB;
      const posA = a.urutan ?? Infinity;
      const posB = b.urutan ?? Infinity;
      if (posA !== posB) return posA - posB;
      const nameA = db.outlets.find((p) => p.id === a.outletId)?.nama ?? "";
      const nameB = db.outlets.find((p) => p.id === b.outletId)?.nama ?? "";
      return nameA.localeCompare(nameB);
    });
  const total = rows.reduce((s, r) => s + r.jumlahUnit, 0);
  const fmt = (n: number) => n.toLocaleString("id-ID");

  printDocument(
    `${plan.kode} — Lembar Rute`,
    `
    <p class="eyebrow">${db.settings.namaPerusahaan} · Agen ${db.settings.nomorAgen}</p>
    <h1>Lembar Rute Distribusi</h1>
    <hr class="rule" />
    <div class="meta">
      <div>Kode rencana<strong class="code">${plan.kode}</strong></div>
      <div>Tanggal<strong>${new Date(plan.tanggal).toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</strong></div>
      <div>Status<strong>${plan.status}</strong></div>
      <div>Titik singgah<strong>${rows.length}</strong></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th><th>Jam</th><th>${outletLabelTitle()}</th><th>Alamat</th><th>Driver / Armada</th>
          <th style="text-align:right">${unitLabelTitle()}</th><th style="width:90px">Diterima</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((r) => {
            const pkl = db.outlets.find((p) => p.id === r.outletId);
            const drv = db.drivers.find((d) => d.id === r.driverId);
            return `<tr>
              <td class="code">${r.urutan ?? "—"}</td>
              <td class="code">${r.jamPengiriman}</td>
              <td>${pkl?.nama ?? "—"}</td>
              <td>${pkl ? `${pkl.alamat}, Kec. ${pkl.kecamatan}` : "—"}</td>
              <td>${drv ? `${drv.nama}<br /><span class="code">${crewedArmada(db, drv).plat}</span>` : "Belum ditetapkan"}</td>
              <td class="num">${fmt(r.jumlahUnit)}</td>
              <td></td>
            </tr>`;
          })
          .join("")}
      </tbody>
      <tfoot><tr><td colspan="5">Total muatan</td><td class="num">${fmt(total)}</td><td></td></tr></tfoot>
    </table>
    <div class="sign">
      <div>Petugas gudang<span></span></div>
      <div>Koordinator distribusi<span>${plan.dikonfirmasiOleh ?? ""}</span></div>
    </div>`,
  );
}

/**
 * The browser packer, as the mock adapter's proposal.
 *
 * It is already tested (`suggestAssignment.test.ts`) and already prints what it
 * is based on, so it is reused rather than replaced. What it cannot do is order
 * the stops within a trip -- the store has no outlet coordinates -- and
 * `DASAR_KAPASITAS` says exactly that.
 */
async function suggestAssignmentMock(planId: string): Promise<AssignmentSuggestion> {
  const [rows, drivers] = await Promise.all([
    getPlanDetail(planId),
    getDriverOptions(planId),
  ]);
  return suggestAssignmentLocal(rows, drivers);
}

export const distributionApiMock: DistributionApi = {
  getPlanList,
  getPlan,
  getPlanDetail,
  getMonthlyGrid,
  getPaymentBoard,
  createPlan,
  createSourcePlan,
  saveDraft,
  confirmPlan,
  cancelDistributionPlan,
  getOutletOptions,
  getProductOptions,
  getSAProductOptions,
  getDriverOptions,
  getVehicleOptions,
  getActiveSaOptions,
  getSAOutletPlan,
  suggestAssignment: suggestAssignmentMock,
  applyAssignment,
  dispatchTrip,
};
