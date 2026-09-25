/**
 * Drivers against the browser store.
 *
 * The demo build's implementation. It keeps every delivery-derived figure it
 * always had, which is what the HTTP adapter cannot do — hence
 * `statistikTersedia`.
 */
import { scopedDb } from "@/mocks/scope";
import { latency } from "@/mocks/db";
import { deleteDriver, saveDriver } from "@/mocks/rules";
import { exportCsv, timestampSuffix } from "@/lib/export";
import { addDays, isoDate, startOfToday } from "@/mocks/seed";
import { todayIso } from "@/mocks/selectors";
import type { DriverEntity } from "@/mocks/types";
import type { DriverApi, DriverFilters, DriverView, DriverWriteInput } from "./contract";
import { unitLabelTitle } from "@/lib/lexicon";

function toView(d: DriverEntity): DriverView {
  const db = scopedDb();
  const today = todayIso();
  const from = isoDate(addDays(startOfToday(), -29));

  const todays = db.deliveries.filter(
    (x) => x.driverId === d.id && x.tanggal === today,
  );
  const window = db.deliveries.filter(
    (x) => x.driverId === d.id && x.tanggal >= from && x.tanggal <= today,
  );
  const closed = window.filter((x) => x.status === "Selesai" || x.status === "Tertunda");
  const muatan = todays.reduce((s, x) => s + x.target, 0);

  return {
    ...d,
    tugasHariIni: todays.length,
    selesaiHariIni: todays.filter((x) => x.status === "Selesai").length,
    muatanHariIni: muatan,
    pengiriman30Hari: window.filter((x) => x.status === "Selesai").length,
    unit30Hari: window.reduce((s, x) => s + x.realisasi, 0),
    ketepatan:
      closed.length === 0
        ? 1
        : closed.filter((x) => x.status === "Selesai").length / closed.length,
    // The store holds the deliveries, so every figure above is real here.
    statistikTersedia: true,
  };
}

async function getDrivers(filters?: DriverFilters): Promise<DriverView[]> {
  await latency("read");
  const db = scopedDb();
  return db.drivers
    .map(toView)
    .filter((d) => {
      if (filters?.status && filters.status !== "Semua" && d.status !== filters.status)
        return false;
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        // The plate is deliberately not searched here any more: it belongs to
        // a truck, and a driver matching it depends on which one they are out
        // in today. The fleet list is where a plate is looked up.
        return (
          d.nama.toLowerCase().includes(q) ||
          d.kode.toLowerCase().includes(q) ||
          d.nomorSim.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

async function getDriverDetail(id: string): Promise<DriverView> {
  await latency("read");
  const d = scopedDb().drivers.find((x) => x.id === id);
  if (!d) throw new Error("Driver tidak ditemukan.");
  return toView(d);
}

/** Today's stop list for one truck. */
export async function getDriverSchedule(id: string) {
  await latency("read");
  const db = scopedDb();
  return db.deliveries
    .filter((d) => d.driverId === id && d.tanggal === todayIso())
    .sort((a, b) => a.jamRencana.localeCompare(b.jamRencana))
    .map((d) => ({
      id: d.id,
      kode: d.kode,
      jam: d.jamRencana,
      outlet: db.outlets.find((p) => p.id === d.outletId)?.nama ?? "—",
      kecamatan: db.outlets.find((p) => p.id === d.outletId)?.kecamatan ?? "—",
      target: d.target,
      realisasi: d.realisasi,
      status: d.status,
    }));
}

async function createOrUpdateDriver(input: DriverWriteInput) {
  await latency("write");
  return toView(saveDriver(input));
}

async function removeDriver(id: string) {
  await latency("write");
  deleteDriver(id);
}

async function exportDrivers() {
  await latency("read");
  const rows = await getDrivers();
  exportCsv(
    `armada-driver-${timestampSuffix()}`,
    [
      "Kode",
      "Nama",
      "Telepon",
      "No. SIM",
      "Status",
      "Tugas Hari Ini",
      "Selesai Hari Ini",
      "Muatan Hari Ini",
      "Pengiriman 30 Hari",
      `${unitLabelTitle()} 30 Hari`,
      "Ketepatan (%)",
    ],
    rows.map((d) => [
      d.kode,
      d.nama,
      d.telepon,
      d.nomorSim,
      d.status,
      d.tugasHariIni,
      d.selesaiHariIni,
      d.muatanHariIni,
      d.pengiriman30Hari,
      d.unit30Hari,
      Math.round(d.ketepatan * 100),
    ]),
  );
  return rows.length;
}

export const driverApiMock: DriverApi = {
  getDrivers,
  getDriverDetail,
  createOrUpdateDriver,
  removeDriver,
  exportDrivers,
};
