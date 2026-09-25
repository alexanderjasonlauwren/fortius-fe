import { crewedArmada } from "@/mocks/fleet";
import { scopedDb } from "@/mocks/scope";
import { latency } from "@/mocks/db";
import { addDays, isoDate, startOfToday } from "@/mocks/seed";
import {
  distributedOn,
  monthlyProgress,
  monthlyQuota,
  shareByKecamatan,
  targetOn,
  todayIso,
} from "@/mocks/selectors";
import type {
  DispatchLane,
  DispatchRail,
  KpiSummary,
  MonthlyChartPoint,
  OutletShare,
  RecentActivity,
} from "../types";
import type { DashboardApi } from "./contract";

const toMinutes = (hhmm: string) =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

async function getKpiSummary(includeManualOrders = false): Promise<KpiSummary> {
  await latency("read");
  const db = scopedDb();
  const today = todayIso();
  const yesterday = isoDate(addDays(startOfToday(), -1));
  const quota = monthlyQuota();

  const pending = db.payments.filter((p) => p.status === "Menunggu Verifikasi");
  const outstanding = db.invoices.filter(
    (i) => i.status !== "Batal" && i.total - i.terbayar - i.kredit > 0,
  );
  const dailyTarget = targetOn(today) || db.settings.targetHarian;

  return {
    dailyDistributed: distributedOn(today),
    dailyTarget,
    monthlyQuotaRemaining: quota.sisa,
    monthlyQuotaTotal: quota.total,
    activeOutlet: db.outlets.filter((p) => p.status === "Aktif").length,
    totalOutlet: db.outlets.length,
    pendingPayments: pending.length,
    pendingPaymentValue: pending.reduce((s, p) => s + p.jumlah, 0),
    piutangOutstanding: outstanding.reduce(
      (s, i) => s + (i.total - i.terbayar - i.kredit),
      0,
    ),
    piutangJatuhTempo: outstanding
      .filter((i) => i.status === "Jatuh Tempo")
      .reduce((s, i) => s + (i.total - i.terbayar - i.kredit), 0),
    previousDayDistributed: distributedOn(yesterday),
    openOrders: includeManualOrders ? db.orders.filter((o) => o.status === "Baru").length : 0,
    lateDeliveries: db.deliveries.filter(
      (d) => d.tanggal === today && d.status === "Tertunda",
    ).length,
  };
}

async function getMonthlyChart(): Promise<MonthlyChartPoint[]> {
  await latency("read");
  return monthlyProgress();
}

async function getOutletShares(): Promise<OutletShare[]> {
  await latency("read");
  return shareByKecamatan();
}

async function getRecentActivities(): Promise<RecentActivity[]> {
  await latency("read");
  const db = scopedDb();
  const stageLabel: Record<string, RecentActivity["status"]> = {
    Selesai: "Selesai",
    Proses: "Dalam Pengiriman",
    Antrian: "Pending",
    Tertunda: "Pending",
  };

  return db.deliveries
    .filter((d) => d.tanggal === todayIso())
    .sort((a, b) => b.jamRencana.localeCompare(a.jamRencana))
    .slice(0, 8)
    .map((d) => ({
      id: d.id,
      tanggal: `${new Date(d.tanggal).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      })}, ${d.jamRencana}`,
      outlet: db.outlets.find((p) => p.id === d.outletId)?.nama ?? "—",
      driver: db.drivers.find((x) => x.id === d.driverId)?.nama ?? "—",
      jumlahUnit: d.realisasi || d.target,
      status: stageLabel[d.status] ?? "Pending",
    }));
}

/**
 * The dispatch rail: today's working day as one lane per truck.
 *
 * A stop's width is its planned window (unloading is budgeted at 45 minutes),
 * so a lane reads as a schedule, and the "now" marker shows at a glance which
 * trucks are behind.
 */
async function getDispatchRail(): Promise<DispatchRail> {
  await latency("read");
  const db = scopedDb();
  const today = todayIso();
  const now = new Date();

  const dayStart = toMinutes(db.settings.jamOperasionalMulai);
  const dayEnd = toMinutes(db.settings.jamOperasionalSelesai);
  const drops = db.deliveries.filter((d) => d.tanggal === today);

  const lanes: DispatchLane[] = db.drivers
    .filter((driver) => drops.some((d) => d.driverId === driver.id))
    .map((driver) => {
      const mine = drops
        .filter((d) => d.driverId === driver.id)
        .sort((a, b) => a.jamRencana.localeCompare(b.jamRencana));

      return {
        driverId: driver.id,
        driver: driver.nama,
        // The truck, from the fleet rather than from the driver: capacity is
        // a property of the vehicle, and the pairing belongs to the run.
        ...crewedArmada(db, driver),
        muatan: mine.reduce((s, d) => s + d.target, 0),
        status: driver.status,
        stops: mine.map((d) => {
          const start = toMinutes(d.jamRencana);
          return {
            id: d.id,
            kode: d.kode,
            outlet:
              db.outlets.find((p) => p.id === d.outletId)?.nama ?? "—",
            kecamatan:
              db.outlets.find((p) => p.id === d.outletId)?.kecamatan ?? "—",
            startMinute: start,
            // Travel plus unloading, from Konfigurasi Sistem.
            endMinute: start + db.settings.operasi.durasiSinggahMenit,
            target: d.target,
            realisasi: d.realisasi,
            stage: d.status,
          };
        }),
      };
    })
    .sort((a, b) => {
      const first = (l: DispatchLane) => l.stops[0]?.startMinute ?? 9999;
      return first(a) - first(b);
    });

  return {
    dayStart,
    dayEnd,
    nowMinute: now.getHours() * 60 + now.getMinutes(),
    lanes,
    idleDrivers: db.drivers
      .filter((d) => !drops.some((x) => x.driverId === d.id))
      .map((d) => ({ id: d.id, nama: d.nama, plat: crewedArmada(db, d).plat, status: d.status })),
    hasSchedule: true,
  };
}

/** Recent entries from the audit trail, for the "who did what" panel. */
async function getRecentAudit(limit = 6) {
  await latency("read");
  return scopedDb().audit.slice(0, limit);
}

export const dashboardApiMock: DashboardApi = {
  getKpiSummary,
  getMonthlyChart,
  getOutletShares,
  getRecentActivities,
  getDispatchRail,
  getRecentAudit,
};
