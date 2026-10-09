/**
 * Deterministic seed data for the mock backend.
 *
 * Everything is generated relative to "today", so the console always opens on a
 * live-looking working day: finished runs behind it, a confirmed plan in
 * progress, drafts queued ahead.
 */

import { seedAccounts } from "./ledger";
import { applyScalarRealisasi, costOfGoods, priceLines } from "./lines";
import type {
  AccountEntity,
  AssetEntity,
  BranchEntity,
  TenantEntity,
  CreditNoteEntity,
  ExpenseCategoryEntity,
  InvoiceEntity,
  JournalEntity,
  Database,
  DeliveryEntity,
  DriverEntity,
  VehicleEntity,
  GeofenceRuleEntity,
  NotificationEntity,
  OutletEntity,
  PaymentEntity,
  PlanEntity,
  PlanRowEntity,
  BankAccountEntity,
  BankNameEntity,
  NotificationSettings,
  LexiconEntity,
  NumberingEntity,
  OperationsEntity,
  OrderEntity,
  ProductEntity,
  RegistrationPackageEntity,
  SupplierEntity,
  ReceiptEntity,
  SAEntity,
  OutletWarningEntity,
  SADailyTargetEntity,
  SettingsEntity,
  TenantSettingsEntity,
  TransportationClaimEntity,
  UserEntity,
  VendorEntity,
} from "./types";

export const DB_VERSION = 18;

/* ── deterministic RNG ─────────────────────────────────────────────────── */

function mulberry32(seed: number) {
  return function rng() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260803);

const rand = () => rng();
const randInt = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];

/* ── date helpers ──────────────────────────────────────────────────────── */

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function atTime(date: Date, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/* ── source vocabulary ─────────────────────────────────────────────────── */

const SPBE = [
  "SPBE Salatiga Utama",
  "SPBE Ungaran Mandiri",
  "SPBE Boyolali Raya",
  "SPBE Ambarawa Sejahtera",
];

const KECAMATAN = [
  // Salatiga's four kecamatan, then the surrounding Kab. Semarang districts an
  // agency there actually serves. Salatiga city is small — four districts does
  // not fill a round — so the ring around it is where the volume is.
  "Sidorejo",
  "Sidomukti",
  "Tingkir",
  "Argomulyo",
  "Getasan",
  "Tengaran",
  "Suruh",
  "Pabelan",
  "Tuntang",
  "Banyubiru",
  "Bringin",
  "Susukan",
];

const OUTLET_NAMA = [
  "Outlet Jaya Abadi",
  "Mitra Sejahtera Gas",
  "Outlet Berkah Rejeki",
  "Toko Gas Utama Mandiri",
  "Outlet Sinar Baru",
  "UD Maju Terus",
  "Outlet Berkah Jaya",
  "Toko Gas Sejahtera",
  "Outlet Ibu Ani",
  "Sumber Gas Rejeki",
  "Outlet Maju Jaya",
  "Outlet Sumber Gas",
  "Outlet Berkah Elpiji",
  "UD Cahaya Gas",
  "Outlet Amanah",
  "Toko Gas Barokah",
  "Outlet Rukun Santosa",
  "Mitra Gas Nusantara",
  "Outlet Karya Mandiri",
  "UD Sumber Makmur",
  "Outlet Tirta Jaya",
  "Toko Gas Harapan",
  "Outlet Sejahtera Abadi",
  "UD Bintang Gas",
];

const ORANG = [
  "Budi Santoso",
  "Agus Setiawan",
  "Bambang Wijaya",
  "Rahmat Hidayat",
  "Dedi Kurniawan",
  "Surya Saputra",
  "Ahmad Subarjo",
  "Rizky Ramadhan",
  "Eko Wijayanto",
  "Hendra Kurniawan",
  "Siti Nurhaliza",
  "Dewi Lestari",
  "Joko Prasetyo",
  "Rina Marlina",
  "Tono Suharto",
  "Wahyu Nugroho",
  "Indra Gunawan",
  "Fitri Handayani",
  "Yusuf Maulana",
  "Nanda Pratama",
  "Lukman Hakim",
  "Sari Wulandari",
  "Bayu Anggara",
  "Citra Dewanti",
];

const ARMADA = [
  { armada: "Isuzu Giga FVR", kapasitas: 560 },
  { armada: "Hino Ranger FM", kapasitas: 480 },
  { armada: "Isuzu Elf NMR", kapasitas: 240 },
  { armada: "Mitsubishi Fuso FN", kapasitas: 560 },
  { armada: "Hino Dutro 130", kapasitas: 320 },
];

const BANKS = ["BCA", "BNI", "Mandiri", "BRI", "BSI"] as const;


/** The agency yard per branch. Routes start here between runs. */
export const DEPOT = { lat: -7.3305, lng: 110.5084, nama: "Pool Salatiga" };

/**
 * A group with two operating subsidiaries in different businesses.
 *
 * Two businesses, not one, and deliberately: a single-tenant seed lets the whole
 * hierarchy look like it works while nothing has exercised it. With an LPG
 * subsidiary beside a water depot, switching between them visibly changes the
 * vocabulary on every screen — tabung/pangkalan/SPBE against galon/depot/pabrik
 * — which is the feature, and it is the demo that proves it.
 *
 * `level` is absolute, counted from the root. The switcher subtracts its own
 * depth before indenting.
 */
export const TENANTS: TenantEntity[] = [
  {
    id: "tnt-001", kode: "bimbo-holdings", nama: "Bimbo Holdings",
    indukId: null, level: 0, jenisUsaha: "holding", jenis: "grup", aktif: true,
  },
  {
    id: "tnt-002", kode: "pt-salatiga", nama: "PT. Bhakta Dharma Anindita",
    indukId: "tnt-001", level: 1, jenisUsaha: "lpg_distribution",
    jenis: "operasional", aktif: true,
  },
  {
    id: "tnt-003", kode: "pt-pati", nama: "PT Bimbo Pati",
    indukId: "tnt-001", level: 1, jenisUsaha: "lpg_distribution",
    jenis: "operasional", aktif: true,
  },
  {
    // Kept deliberately. Salatiga and Pati are both LPG, so switching between
    // them proves tenant isolation but not the business-agnostic lexicon — the
    // nouns would be identical either way. A third tenant in a different trade
    // is the only way "the console is not an LPG console" is demonstrable on
    // screen rather than merely claimed.
    id: "tnt-004", kode: "pt-tirta", nama: "PT Bimbo Tirta",
    indukId: "tnt-001", level: 1, jenisUsaha: "water_depot",
    jenis: "operasional", aktif: true,
  },
];

/**
 * The tenant the operational seed hangs off.
 *
 * PT Salatiga, not the holding: a `grup` tenant owns others and runs nothing
 * itself, so hanging outlets and deliveries off it would describe a company that
 * does not exist. Pati and Tirta are seeded thin — enough to switch into and see
 * a different scope and vocabulary, not a second full dataset to maintain.
 */
export const TENANT: TenantEntity = TENANTS[1];

/** Three branches, so consolidated views have something to consolidate. */
export const BRANCHES: BranchEntity[] = [
  // One branch per operating tenant, and exactly one: neither PT has
  // organisational branches, but branch_id is NOT NULL on every operational
  // table in the backend and document number series are issued per branch, so
  // the single default row IS the pool where vehicles load. More can be added
  // later with no migration.
  {
    id: "brc-001", tenantId: "tnt-002", kode: "SLT", nama: "Pool Salatiga",
    kota: "Kota Salatiga", provinsi: "Jawa Tengah",
    alamat: "Jl. Lingkar Selatan No. 42, Sidorejo",
    penanggungJawab: "Alex Lawrence", telepon: "0298-321-4210",
    lat: -7.3305, lng: 110.5084, utama: true, aktif: true,
  },
  {
    id: "brc-002", tenantId: "tnt-003", kode: "PTI", nama: "Pool Pati",
    kota: "Kab. Pati", provinsi: "Jawa Tengah",
    alamat: "Jl. Raya Pati-Juwana Km. 4, Margorejo",
    penanggungJawab: "Siti Nurhaliza", telepon: "0295-381-7720",
    lat: -6.7559, lng: 111.0388, utama: true, aktif: true,
  },
  {
    id: "brc-003", tenantId: "tnt-004", kode: "TRT", nama: "Depot Tirta Ungaran",
    kota: "Kab. Semarang", provinsi: "Jawa Tengah",
    alamat: "Jl. Diponegoro No. 118, Ungaran Barat",
    penanggungJawab: "Joko Prasetyo", telepon: "024-692-1880",
    lat: -7.1389, lng: 110.4058, utama: true, aktif: true,
  },
];

/** Round-robin assignment, so every branch has a working day of its own. */
/**
 * Which branch — and therefore which tenant — a generated row belongs to.
 *
 * The tenant comes from the BRANCH, not from a constant. Branches used to all
 * sit under one tenant, so `TENANT.id` was right; now each pool belongs to a
 * different PT, and stamping every row with the same tenant would put Pati's
 * outlets inside Salatiga.
 *
 * Operational data is seeded for Salatiga only — see TENANT — so this returns
 * its pool, and takes no index. It used to round-robin across three branches of
 * one tenant; each pool now belongs to a different PT, so spreading rows across
 * them would put Pati's outlets inside Salatiga.
 *
 * Pati and Tirta exist to be switched into. A tenant whose console is empty is
 * the honest demonstration that scope filtering works — data that appeared
 * everywhere would prove nothing.
 */
function branchFor(): { tenantId: string; branchId: string } {
  const b = BRANCHES[0];
  return { tenantId: b.tenantId, branchId: b.id };
}

/* ── generators ────────────────────────────────────────────────────────── */

function seedOutlet(): OutletEntity[] {
  return OUTLET_NAMA.map((nama, i) => {
    const kecamatan = KECAMATAN[i % KECAMATAN.length];
    const statusRoll = rand();
    return {
      ...branchFor(),
      id: `pkl-${String(i + 1).padStart(3, "0")}`,
      kode: `PKL-${String(i + 1).padStart(4, "0")}`,
      nama,
      alamat: `Jl. ${pick(["Melati", "Kenanga", "Raya Industri", "Pahlawan", "Merdeka", "Cempaka", "Diponegoro", "Sudirman"])} No. ${randInt(1, 180)}`,
      kecamatan,
      kota: i % 5 === 0 ? "Kab. Semarang" : "Kota Salatiga",
      // A box south and east of the pool.
      //
      // The direction is not decorative. Salatiga sits on the slope between
      // Merbabu and Telomoyo, and the served districts — Getasan, Tengaran,
      // Suruh, Tuntang — lie south and east of the city. A symmetric jitter
      // would scatter pins onto the mountains to the west, and MonitoringPage
      // renders these on a real Leaflet map where that is immediately visible.
      lat: DEPOT.lat - rand() * 0.09,
      lng: DEPOT.lng + rand() * 0.09,
      penanggungJawab: ORANG[(i * 3 + 5) % ORANG.length],
      telepon: `08${randInt(11, 99)}${randInt(1000000, 9999999)}`,
      status:
        statusRoll > 0.93
          ? "Ditangguhkan"
          : statusRoll > 0.86
            ? "Nonaktif"
            : "Aktif",
      kuotaBulanan: randInt(6, 24) * 100,
      // A mix of cash-on-delivery and short terms, as an agency actually runs.
      termin: pick([0, 7, 7, 14, 14, 30]),
      batasKredit: pick([0, 5_000_000, 10_000_000, 15_000_000, 25_000_000]),
      blokirOtomatis: rand() > 0.25,
      terdaftarPada: isoDate(addDays(startOfToday(), -randInt(120, 900))),
    };
  });
}

function seedDrivers(): DriverEntity[] {
  return Array.from({ length: 8 }, (_, i) => ({
    ...branchFor(),
    id: `drv-${String(i + 1).padStart(3, "0")}`,
    kode: `DRV-${String(i + 1).padStart(4, "0")}`,
    nama: ORANG[i],
    telepon: `08${randInt(11, 99)}${randInt(1000000, 9999999)}`,
    nomorSim: `B${randInt(1000000, 9999999)}`,
    status: i === 7 ? "Cuti" : "Standby",
    bergabungPada: isoDate(addDays(startOfToday(), -randInt(200, 1400))),
  }));
}

/**
 * The fleet, as its own rows.
 *
 * Eight trucks for eight drivers, which is what the console used to imply by
 * putting the plate on the driver. They are separate rows now because the
 * schema keeps them separate: a driver swaps trucks and a truck swaps drivers,
 * and the pairing belongs to a trip rather than to either of them.
 *
 * The same count is deliberate. It keeps the demo looking exactly as it did
 * while `crewedVehicle` stands in for the trip that would decide it — see
 * `mocks/fleet.ts`.
 */
function seedVehicles(): VehicleEntity[] {
  return Array.from({ length: 8 }, (_, i) => {
    const unit = ARMADA[i % ARMADA.length];
    return {
      ...branchFor(),
      id: `veh-${String(i + 1).padStart(3, "0")}`,
      plat: `B ${randInt(1000, 9999)} ${pick(["TGH", "AB", "CK", "PV", "KYA", "RFS"])}`,
      armada: unit.armada,
      kapasitas: unit.kapasitas,
      // Left unset on most of the fleet, mirroring the column: a weight limit
      // nobody has recorded is a real state, and the planner checks the count.
      kapasitasKg: i % 3 === 0 ? unit.kapasitas * 15 : undefined,
      status: i === 7 ? "Perawatan" : "Aktif",
      terdaftarPada: isoDate(addDays(startOfToday(), -randInt(200, 1400))),
    } satisfies VehicleEntity;
  });
}

/**
 * BAST claims for the transportation fee -- D3's own A-Step 1, "the
 * smallest useful version": record the handover, record what iVendor
 * answered. A handful spanning every status, one referencing real
 * deliveries so the link is not always empty.
 */
function seedTransportationClaims(deliveries: DeliveryEntity[]): TransportationClaimEntity[] {
  const today = startOfToday();
  const linkedDeliveryIds = deliveries.slice(0, 2).map((d) => d.id);

  const rows: Array<{
    offsetDays: number;
    claimStatus: TransportationClaimEntity["claimStatus"];
    principalInvoiceNumber?: string;
    statusNote?: string;
    deliveryIds?: string[];
  }> = [
    { offsetDays: -2, claimStatus: "draft" },
    {
      offsetDays: -10,
      claimStatus: "submitted",
      deliveryIds: linkedDeliveryIds,
    },
    {
      offsetDays: -18,
      claimStatus: "under_review",
      principalInvoiceNumber: `INV/${randInt(1000, 9999)}/IV/${today.getFullYear()}`,
      statusNote: "iVendor tidak memberikan notifikasi yang jelas -- masih menunggu kabar.",
    },
    {
      offsetDays: -32,
      claimStatus: "approved",
      principalInvoiceNumber: `INV/${randInt(1000, 9999)}/IV/${today.getFullYear()}`,
    },
    {
      offsetDays: -46,
      claimStatus: "paid",
      principalInvoiceNumber: `INV/${randInt(1000, 9999)}/IV/${today.getFullYear()}`,
    },
  ];

  return rows.map((row, i) => {
    const handoverDate = addDays(today, row.offsetDays);
    // The period is the calendar month the handover date falls in -- a claim
    // is signed a few days after the month it covers, same as the real
    // spreadsheet this feature replaces (each of its 33 sheets is titled
    // "PERIODE BULAN <month>" and signed after month-end).
    const periodStart = new Date(handoverDate.getFullYear(), handoverDate.getMonth(), 1);
    const periodEnd = new Date(handoverDate.getFullYear(), handoverDate.getMonth() + 1, 1);
    // totalQty is the base random figure, not claimedAmount -- claimedAmount
    // is DERIVED (weight x the mock's own fixed rate), the same direction
    // generateTransportationClaimLines computes it in, not typed by hand.
    const totalQty = randInt(80, 400) * 10;
    const totalWeightKg = totalQty * 3;
    const claimedAmount = Math.round(totalWeightKg * 354.64 * 100) / 100;
    return {
      ...branchFor(),
      id: `bast-${String(i + 1).padStart(3, "0")}`,
      claimNumber: `BAST-${isoDate(periodStart).replace(/-/g, "").slice(0, 6)}-${String(i + 1).padStart(4, "0")}`,
      handoverReference:
        row.claimStatus === "draft" ? undefined : `BAST/${randInt(100, 999)}/${handoverDate.getFullYear()}`,
      handoverDate: isoDate(handoverDate),
      periodStart: isoDate(periodStart),
      periodEnd: isoDate(periodEnd),
      claimedAmount,
      totalQty,
      totalWeightKg,
      principalInvoiceNumber: row.principalInvoiceNumber,
      claimStatus: row.claimStatus,
      statusNote: row.statusNote,
      statusUpdatedAt:
        row.claimStatus === "draft" ? undefined : addDays(handoverDate, 2).toISOString(),
      settledAt: row.claimStatus === "paid" ? isoDate(addDays(handoverDate, 5)) : undefined,
      settledAmount: row.claimStatus === "paid" ? claimedAmount : undefined,
      settlementMode: row.claimStatus === "paid" ? "bank" : undefined,
      deliveryIds: row.deliveryIds ?? [],
      version: 1,
      createdAt: handoverDate.toISOString(),
      updatedAt: (row.statusNote ? addDays(handoverDate, 2) : handoverDate).toISOString(),
    } satisfies TransportationClaimEntity;
  });
}

/**
 * A handful of Surat Peringatan (SP) rows — D3 A-Step 3. Rarely-used by
 * design (the client's own flow document names this a manual, occasional
 * entry, §9.1), so a couple of examples against real seeded outlets is
 * enough; most outlets carry none.
 */
function seedOutletWarnings(outlets: OutletEntity[]): OutletWarningEntity[] {
  const today = startOfToday();
  if (outlets.length === 0) return [];

  const rows: Array<{ outletIndex: number; offsetDays: number; reason: string; notes?: string }> = [
    {
      outletIndex: 0,
      offsetDays: -40,
      reason: "Keterlambatan pembayaran berulang",
      notes: "Tunggakan lebih dari 30 hari, telah dikonfirmasi via telepon.",
    },
    {
      outletIndex: Math.min(1, outlets.length - 1),
      offsetDays: -15,
      reason: "Volume penjualan di bawah target tiga bulan berturut-turut",
    },
  ];

  return rows.map((row, i) => {
    const issuedOn = addDays(today, row.offsetDays);
    return {
      ...branchFor(),
      id: `spr-${String(i + 1).padStart(3, "0")}`,
      outletId: outlets[row.outletIndex].id,
      issuedOn: isoDate(issuedOn),
      reason: row.reason,
      notes: row.notes,
      createdAt: issuedOn.toISOString(),
    } satisfies OutletWarningEntity;
  });
}

function seedScheduleAgreements(): SAEntity[] {
  const today = startOfToday();
  const y = today.getFullYear();
  const m = today.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");

  const periods = [
    { offset: -2, status: "Selesai" as const, ratio: 1 },
    { offset: -1, status: "Selesai" as const, ratio: 0.97 },
    { offset: 0, status: "Aktif" as const, ratio: 0.62 },
    { offset: 0, status: "Limit" as const, ratio: 0.985 },
    { offset: 0, status: "Aktif" as const, ratio: 0.34 },
    { offset: 1, status: "Draft" as const, ratio: 0 },
  ];

  return periods.map((p, i) => {
    const mulai = new Date(y, m + p.offset, 1);
    const berakhir = new Date(y, m + p.offset + 1, 0);
    const totalKuota = randInt(12, 60) * 10_000;
    return {
      ...branchFor(),
      id: `sa-${String(i + 1).padStart(3, "0")}`,
      nomorSA: `SA-${mulai.getFullYear()}-${pad(mulai.getMonth() + 1)}-${pad(randInt(1, 99))}`,
      supplier: SPBE[i % SPBE.length],
      periodeMulai: isoDate(mulai),
      periodeBerakhir: isoDate(berakhir),
      totalKuota,
      dialokasikan: Math.round(totalKuota * p.ratio),
      terpakai: Math.round(totalKuota * p.ratio),
      status: p.status,
      diunggahOleh: "Alex Lawrence",
      diunggahPada: atTime(addDays(mulai, -2), "09:15"),
      namaDokumen: `${`SA-${mulai.getFullYear()}-${pad(mulai.getMonth() + 1)}`}.pdf`,
      catatan: p.status === "Draft" ? "Menunggu verifikasi dokumen SPBE." : undefined,
    };
  });
}

/**
 * The daily obligations already on record for an agreement.
 *
 * Seeded for the running month only, and only to the 20th. Two reasons, both
 * about what the import screen has to show: a diff against an empty record is
 * every row "new", which demonstrates nothing about the case that matters, and
 * a month already complete leaves no dates for an upload to add. Twenty days on
 * record and a file covering the month produces all three outcomes at once.
 *
 * Sundays are seeded as a stated zero rather than left absent. That is the
 * distinction the record exists to keep, so the demo has to carry it too.
 */
function seedDailyTargets(sas: SAEntity[]): SADailyTargetEntity[] {
  const today = startOfToday();
  const targets: SADailyTargetEntity[] = [];

  const running = sas.filter(
    (sa) =>
      sa.status !== "Draft" &&
      new Date(sa.periodeMulai).getMonth() === today.getMonth() &&
      new Date(sa.periodeMulai).getFullYear() === today.getFullYear(),
  );

  for (const sa of running) {
    const start = new Date(sa.periodeMulai);
    // Roughly the month's quota spread over its working days, rounded to the
    // fifties a supplier actually writes. Derived, and the console says so
    // wherever it renders one.
    const perDay = Math.round(sa.totalKuota / 26 / 50) * 50;

    for (let day = 1; day <= 20; day += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), day);
      if (date.getMonth() !== start.getMonth()) break;
      const sunday = date.getDay() === 0;
      targets.push({
        id: `sadt-${sa.id}-${String(day).padStart(2, "0")}`,
        saId: sa.id,
        tanggal: isoDate(date),
        target: sunday ? 0 : perDay,
        sumber: "manual",
        importBatchId: null,
      });
    }
  }
  return targets;
}

/**
 * Builds plans, their rows, and the deliveries that flow from confirmation.
 * Past days are finished, today is mid-run, the next two days are drafts.
 */
function seedOperations(
  outlet: OutletEntity[],
  drivers: DriverEntity[],
  sas: SAEntity[],
  products: ProductEntity[],
) {
  /**
   * Most drops are the subsidised 3 kg staple; roughly one in five also carries
   * a few 12 kg for restaurants and households on the same round. That mix is
   * the point — it is what makes per-product pricing observable rather than
   * theoretical.
   */
  const staple = products[0];
  const bulk = products[2];
  const today = startOfToday();
  const plans: PlanEntity[] = [];
  const planRows: PlanRowEntity[] = [];
  const deliveries: DeliveryEntity[] = [];

  const activeSa = sas.find((s) => s.status === "Aktif") ?? sas[2];
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  let planSeq = 0;
  let deliverySeq = 0;

  // Each branch runs its own day, so a plan and everything under it belong to
  // exactly one branch — the same shape as core.plans.branch_id.
  for (const branch of BRANCHES) {
  const scope = { tenantId: TENANT.id, branchId: branch.id };
  const aktifOutlet = outlet.filter(
    (p) => p.status === "Aktif" && p.branchId === branch.id,
  );
  const aktifDrivers = drivers.filter(
    (d) => d.status !== "Cuti" && d.branchId === branch.id,
  );
  if (aktifOutlet.length === 0 || aktifDrivers.length === 0) continue;

  for (let offset = -14; offset <= 2; offset++) {
    const date = addDays(today, offset);
    // Agency runs six days a week — no Sunday dispatch.
    if (date.getDay() === 0) continue;

    planSeq += 1;
    const planId = `plan-${String(planSeq).padStart(3, "0")}`;
    const status: PlanEntity["status"] =
      offset < 0 ? "Selesai" : offset === 0 ? "Terkonfirmasi" : "Draft";

    plans.push({
      ...scope,
      id: planId,
      version: 1,
      kode: `RD-${isoDate(date).replace(/-/g, "")}`,
      tanggal: isoDate(date),
      saId: activeSa.id,
      status,
      dibuatOleh: "Alex Lawrence",
      dibuatPada: atTime(addDays(date, -1), "16:20"),
      dikonfirmasiOleh: status === "Draft" ? undefined : "Alex Lawrence",
      dikonfirmasiPada: status === "Draft" ? undefined : atTime(addDays(date, -1), "17:05"),
    });

    const stopCount = randInt(6, 9);
    const chosen = [...aktifOutlet]
      .sort(() => rand() - 0.5)
      .slice(0, stopCount);

    // Three or four trucks share the day's stops, so each lane on the dispatch
    // rail reads as a route rather than a single drop.
    const crew = [...aktifDrivers]
      .sort(() => rand() - 0.5)
      .slice(0, randInt(3, 4));

    chosen.forEach((pkl, idx) => {
      const rowId = `row-${planId}-${idx + 1}`;
      const driver = crew[idx % crew.length];
      const slot = Math.floor(idx / crew.length);
      const jam = `${String(7 + slot * 3 + (idx % crew.length)).padStart(2, "0")}:${
        idx % 2 === 0 ? "00" : "30"
      }`;
      const pokok = randInt(6, 18) * 10;
      const tambahan = rand() > 0.8 ? randInt(1, 4) * 5 : 0;
      const lines = [
        { productId: staple.id, jumlah: pokok },
        ...(tambahan > 0 ? [{ productId: bulk.id, jumlah: tambahan }] : []),
      ];
      const target = pokok + tambahan;

      planRows.push({
        id: rowId,
        planId,
        outletId: pkl.id,
        driverId: status === "Draft" && idx === stopCount - 1 ? null : driver.id,
        lines,
        jumlahUnit: target,
        jamPengiriman: jam,
      });

      if (status === "Draft") return;

      deliverySeq += 1;
      const jamMinutes = Number(jam.slice(0, 2)) * 60 + Number(jam.slice(3));

      let dStatus: DeliveryEntity["status"];
      let realisasi: number;

      if (offset < 0) {
        const late = rand() > 0.92;
        dStatus = late ? "Tertunda" : "Selesai";
        realisasi = late ? 0 : target - (rand() > 0.7 ? randInt(0, 8) * 5 : 0);
      } else if (nowMinutes > jamMinutes + 90) {
        dStatus = "Selesai";
        realisasi = target - (rand() > 0.75 ? randInt(0, 6) * 5 : 0);
      } else if (nowMinutes > jamMinutes - 30) {
        dStatus = "Proses";
        realisasi = Math.round(target * (0.2 + rand() * 0.5));
      } else {
        dStatus = "Antrian";
        realisasi = 0;
      }

      // Split through the same helper the runtime uses, so seeded history can
      // never disagree with a drop filed in the session. Hand-rolling this put
      // a fully-delivered bulk line on drops where nothing arrived at all.
      const deliveryLines = applyScalarRealisasi(
        lines.map((l) => ({ productId: l.productId, target: l.jumlah, realisasi: 0 })),
        realisasi,
      ).map((l) => ({
        ...l,
        // Empties come back against what was actually dropped, not what was loaded.
        kembali: dStatus === "Selesai" ? l.realisasi : undefined,
      }));

      deliveries.push({
        ...scope,
        lines: deliveryLines,
        id: `dlv-${String(deliverySeq).padStart(4, "0")}`,
        kode: `SJ-${isoDate(date).replace(/-/g, "")}-${String(idx + 1).padStart(2, "0")}`,
        planId,
        planRowId: rowId,
        outletId: pkl.id,
        driverId: driver.id,
        tanggal: isoDate(date),
        jamRencana: jam,
        target,
        realisasi,
        status: dStatus,
        mulaiPada: dStatus === "Antrian" ? undefined : atTime(date, jam),
        selesaiPada:
          dStatus === "Selesai"
            ? atTime(date, `${String(Math.min(19, Number(jam.slice(0, 2)) + 1)).padStart(2, "0")}:15`)
            : undefined,
        driverLat: dStatus === "Proses" ? pkl.lat + (rand() - 0.5) * 0.03 : undefined,
        driverLng: dStatus === "Proses" ? pkl.lng + (rand() - 0.5) * 0.03 : undefined,
        catatan: dStatus === "Tertunda" ? "Outlet tutup saat armada tiba." : undefined,
      });
    });
  }

  }

  // Today's drivers reflect what they are actually doing right now.
  const todayIso = isoDate(today);
  for (const driver of drivers) {
    if (driver.status === "Cuti") continue;
    const mine = deliveries.filter(
      (d) => d.tanggal === todayIso && d.driverId === driver.id,
    );
    if (mine.some((d) => d.status === "Proses")) {
      driver.status = rand() > 0.5 ? "Dalam Perjalanan" : "Bongkar Muat";
    } else if (mine.length > 0 && mine.every((d) => d.status === "Selesai")) {
      driver.status = "Selesai";
    }
  }

  return { plans, planRows, deliveries };
}

/**
 * Builds the receivables ledger from completed deliveries.
 *
 * Deliberately messy: some invoices settled in full, some part-paid, some
 * overdue, a couple of credit notes. A clean ledger would make the aging report
 * look like decoration rather than a tool.
 */
function seedReceivables(
  deliveries: DeliveryEntity[],
  outlet: OutletEntity[],
  products: ProductEntity[],
) {
  const invoices: InvoiceEntity[] = [];
  const payments: PaymentEntity[] = [];
  const creditNotes: CreditNoteEntity[] = [];
  const accounts = seedAccounts();
  const journals: JournalEntity[] = [];

  const acc = (role: string) => accounts.find((a) => a.role === role)!.id;
  const today = startOfToday();

  let jSeq = 0;
  const post = (
    tanggal: string,
    keterangan: string,
    sumber: JournalEntity["sumber"],
    lines: JournalEntity["lines"],
    scope: { tenantId: string; branchId: string } = {
      tenantId: TENANT.id,
      branchId: BRANCHES[0].id,
    },
  ) => {
    jSeq += 1;
    journals.push({
      ...scope,
      id: `jrn-${String(jSeq).padStart(4, "0")}`,
      nomor: `JV-${tanggal.replace(/-/g, "")}-${String(jSeq).padStart(4, "0")}`,
      tanggal,
      keterangan,
      sumber,
      lines,
      status: "Diposting",
      dibuatOleh: "Sistem",
      dibuatPada: new Date().toISOString(),
      version: 1,
    });
  };

  const settled = deliveries
    .filter((d) => d.status === "Selesai" && d.realisasi > 0)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  settled.forEach((d, i) => {
    const pkl = outlet.find((p) => p.id === d.outletId);
    // Everything raised from a delivery lives in that delivery's branch.
    const scope = { tenantId: d.tenantId, branchId: d.branchId };
    // Same pricing path the live rules use, so seeded history and anything
    // raised in the session are directly comparable.
    const invLines = priceLines(
      products,
      d.lines.map((l) => ({ productId: l.productId, jumlah: l.realisasi })),
    );
    const subtotal = invLines.reduce((sum, l) => sum + l.subtotal, 0);
    const jatuhTempo = isoDate(addDays(new Date(d.tanggal), pkl?.termin ?? 7));

    const inv: InvoiceEntity = {
      ...scope,
      id: `inv-${String(i + 1).padStart(4, "0")}`,
      nomor: `INV-${d.tanggal.replace(/-/g, "")}-${String(i + 1).padStart(3, "0")}`,
      outletId: d.outletId,
      deliveryId: d.id,
      invoiceType: "delivery",
      tanggal: d.tanggal,
      jatuhTempo,
      lines: invLines,
      jumlahUnit: d.realisasi,
      hargaSatuan: d.realisasi > 0 ? Math.round(subtotal / d.realisasi) : 0,
      subtotal,
      pajak: 0,
      total: subtotal,
      terbayar: 0,
      kredit: 0,
      status: "Terbit",
      catatan: `Tagihan otomatis dari ${d.kode}.`,
      dibuatOleh: "Sistem",
    };
    invoices.push(inv);

    const hpp = costOfGoods(products, d.lines);
    post(inv.tanggal, `${inv.nomor} — penjualan ke ${pkl?.nama ?? "outlet"}`,
      { tipe: "invoice", id: inv.id },
      [
        { akunId: acc("piutang"), debit: inv.total, kredit: 0 },
        { akunId: acc("pendapatan"), debit: 0, kredit: inv.subtotal },
        { akunId: acc("hpp"), debit: hpp, kredit: 0 },
        { akunId: acc("persediaan"), debit: 0, kredit: hpp },
      ], scope);

    // Older invoices are mostly settled; recent ones are still open.
    const umur = Math.round((today.getTime() - new Date(d.tanggal).getTime()) / 86_400_000);
    const roll = rand();
    let bayar = 0;
    if (umur > 9) bayar = roll > 0.12 ? inv.total : inv.total * 0.4;
    else if (umur > 4) bayar = roll > 0.45 ? inv.total : roll > 0.2 ? inv.total * 0.5 : 0;
    else bayar = roll > 0.75 ? inv.total : 0;
    bayar = Math.round(bayar);

    if (bayar > 0) {
      const tanggalBayar = isoDate(addDays(new Date(d.tanggal), randInt(1, Math.max(2, (pkl?.termin ?? 7) + 3))));
      const p: PaymentEntity = {
        ...scope,
        id: `pay-${String(payments.length + 1).padStart(4, "0")}`,
        nomor: `BKM-${tanggalBayar.replace(/-/g, "")}-${String(payments.length + 1).padStart(3, "0")}`,
        outletId: d.outletId,
        tanggal: tanggalBayar,
        jumlah: bayar,
        bank: pick(BANKS),
        noRekening: `${randInt(1000, 9999)}-${randInt(1000, 9999)}-${randInt(1000, 9999)}`,
        status: umur > 2 ? "Terverifikasi" : "Menunggu Verifikasi",
        alokasi: [{ invoiceId: inv.id, jumlah: bayar }],
        buktiTransfer: `bukti-${pkl?.kode ?? "PKL"}-${payments.length + 1}.jpg`,
        keterangan: rand() > 0.7 ? "Transfer via mobile banking." : undefined,
        diverifikasiOleh: umur > 2 ? "Alex Lawrence" : undefined,
        diverifikasiPada: umur > 2 ? atTime(new Date(tanggalBayar), "16:40") : undefined,
      };
      payments.push(p);

      // Only verified cash reduces the receivable and reaches the ledger, so
      // the AR sub-ledger reconciles to the control account.
      if (p.status === "Terverifikasi") {
        inv.terbayar = bayar;
        post(p.tanggal, `${p.nomor} — penerimaan dari ${pkl?.nama ?? "outlet"}`,
          { tipe: "payment", id: p.id },
          [
            { akunId: acc("bank"), debit: bayar, kredit: 0 },
            { akunId: acc("piutang"), debit: 0, kredit: bayar },
          ], scope);
      }
    }

    // A couple of returns, so the credit-note path has history.
    const hargaRata = d.realisasi > 0 ? subtotal / d.realisasi : 0;
    if (rand() > 0.94 && inv.total - inv.terbayar > hargaRata * 5) {
      const jumlah = Math.round(hargaRata * randInt(2, 5));
      const note: CreditNoteEntity = {
        ...scope,
        id: `cn-${String(creditNotes.length + 1).padStart(3, "0")}`,
        nomor: `NK-${d.tanggal.replace(/-/g, "")}-${String(creditNotes.length + 1).padStart(3, "0")}`,
        outletId: d.outletId,
        invoiceId: inv.id,
        tanggal: isoDate(addDays(new Date(d.tanggal), 1)),
        jumlah,
        alasan: pick([
          "Tabung dikembalikan karena segel rusak.",
          "Koreksi jumlah pada surat jalan.",
          "Potongan atas keterlambatan pengiriman.",
        ]),
        status: "Terpakai",
        dibuatOleh: "Alex Lawrence",
      };
      creditNotes.push(note);
      inv.kredit = jumlah;
      post(note.tanggal, `${note.nomor} — ${note.alasan}`,
        { tipe: "creditNote", id: note.id },
        [
          { akunId: acc("returPenjualan"), debit: jumlah, kredit: 0 },
          { akunId: acc("piutang"), debit: 0, kredit: jumlah },
        ], scope);
    }

    const sisa = inv.total - inv.terbayar - inv.kredit;
    const todayIso = isoDate(today);
    if (sisa <= 0) inv.status = "Lunas";
    else if (inv.jatuhTempo < todayIso) inv.status = "Jatuh Tempo";
    else if (inv.terbayar > 0 || inv.kredit > 0) inv.status = "Sebagian";
    else inv.status = "Terbit";
  });

  // Opening equity, so the balance sheet does not start lopsided.
  const modal = 250_000_000;
  post(isoDate(addDays(today, -400)), "Setoran modal awal", { tipe: "manual", id: "opening" }, [
    { akunId: acc("bank"), debit: modal * 0.4, kredit: 0 },
    { akunId: acc("persediaan"), debit: modal * 0.6, kredit: 0 },
    { akunId: accounts.find((a) => a.kode === "3-1000")!.id, debit: 0, kredit: modal },
  ]);

  return { invoices, payments, creditNotes, accounts, journals };
}

function seedReceipts(
  outlet: OutletEntity[],
  products: ProductEntity[],
): ReceiptEntity[] {
  return Array.from({ length: 9 }, (_, i) => {
    const pkl = outlet[randInt(0, outlet.length - 1)];
    const confident = rand();

    // A scan matches a catalogue product only when it read the text cleanly.
    // Below that the line keeps what it saw and waits for a human.
    const dipakai = [products[0], ...(rand() > 0.7 ? [products[2]] : [])];
    const lines = dipakai.map((prod) => {
      const jumlah = randInt(2, 12) * 5;
      return {
        productId: confident > 0.35 ? prod.id : null,
        namaTerbaca:
          confident > 0.6 ? prod.nama : prod.nama.toUpperCase().replace(/ /g, ""),
        jumlah,
        hargaSatuan: prod.hargaJual,
      };
    });
    const jumlah = lines.reduce((sum, l) => sum + l.jumlah, 0);
    const dariLines = lines.reduce((sum, l) => sum + l.jumlah * l.hargaSatuan, 0);

    return {
      lines,
      jumlahUnit: jumlah,
      ...branchFor(),
      id: `ocr-${String(i + 1).padStart(3, "0")}`,
      namaBerkas: `kwitansi-${isoDate(addDays(startOfToday(), -randInt(0, 5)))}-${i + 1}.jpg`,
      outletId: confident > 0.25 ? pkl.id : null,
      nomorKwitansi: `KW/${randInt(1000, 9999)}/${new Date().getFullYear()}`,
      tanggalKwitansi: isoDate(addDays(startOfToday(), -randInt(0, 5))),
      // Usually the printed total agrees with the items. Occasionally it does
      // not — a smudged digit — and that is what the reviewer is there to catch.
      nominal: rand() > 0.85 ? Math.round(dariLines * 0.9) : dariLines,
      bank: confident > 0.3 ? pick(BANKS) : null,
      keyakinan: 0.55 + confident * 0.44,
      status: i < 5 ? "Menunggu Review" : rand() > 0.75 ? "Ditolak" : "Tervalidasi",
      diunggahPada: atTime(addDays(startOfToday(), -randInt(0, 3)), `${randInt(8, 16)}:20`),
    };
  });
}

function seedOrders(
  outlet: OutletEntity[],
  products: ProductEntity[],
): OrderEntity[] {
  const aktif = outlet.filter((p) => p.status === "Aktif");
  const stapleId = products[0].id;
  return Array.from({ length: 22 }, (_, i) => {
    const pkl = aktif[randInt(0, aktif.length - 1)];
    const diminta = randInt(4, 20) * 10;
    const masuk = addDays(startOfToday(), -randInt(0, 9));
    const status: OrderEntity["status"] =
      i < 6
        ? "Baru"
        : i < 10
          ? "Disetujui"
          : i < 15
            ? "Dijadwalkan"
            : rand() > 0.85
              ? "Ditolak"
              : "Selesai";
    return {
      ...branchFor(),
      id: `ord-${String(i + 1).padStart(3, "0")}`,
      kode: `PO-${isoDate(masuk).replace(/-/g, "")}-${String(i + 1).padStart(3, "0")}`,
      outletId: pkl.id,
      lines: [{ productId: stapleId, jumlah: diminta }],
      jumlahUnit: diminta,
      tanggalMasuk: atTime(masuk, `${randInt(7, 17)}:${pick(["05", "20", "41", "55"])}`),
      tanggalDiminta: isoDate(addDays(masuk, randInt(1, 4))),
      status,
      catatan:
        status === "Ditolak"
          ? "Melebihi kuota bulanan outlet."
          : rand() > 0.75
            ? "Mohon kirim pagi hari."
            : undefined,
      diprosesOleh: status === "Baru" ? undefined : "Alex Lawrence",
      diprosesPada: status === "Baru" ? undefined : atTime(masuk, "16:10"),
    };
  }).sort((a, b) => b.tanggalMasuk.localeCompare(a.tanggalMasuk));
}

function seedUsers(drivers: DriverEntity[]): UserEntity[] {
  const roles: UserEntity["role"][] = [
    "admin",
    "manager",
    "finance",
    "staff",
    "staff",
    "viewer",
    "finance",
    "staff",
  ];
  const staf: UserEntity[] = roles.map((role, i) => ({
    id: `usr-${String(i + 1).padStart(3, "0")}`,
    nama: i === 0 ? "Alex Lawrence" : ORANG[(i * 5 + 2) % ORANG.length],
    email:
      i === 0
        ? "alex@sidistrib.id"
        : `${ORANG[(i * 5 + 2) % ORANG.length].toLowerCase().split(" ")[0]}${i}@sidistrib.id`,
    role,
    telepon: `08${randInt(11, 99)}${randInt(1000000, 9999999)}`,
    // Admin and manager see every branch; the rest are pinned to one.
    branchIds: i <= 1 ? [] : [BRANCHES[i % BRANCHES.length].id],
    scopeType: i <= 1 ? ("tenant" as const) : ("branch" as const),
    cabang: i <= 1 ? "Semua cabang" : BRANCHES[i % BRANCHES.length].nama,
    status: i === 6 ? "Nonaktif" : i === 7 ? "Diundang" : "Aktif",
    terakhirMasuk:
      i === 7 ? undefined : atTime(addDays(startOfToday(), -randInt(0, 9)), "08:32"),
    dibuatPada: isoDate(addDays(startOfToday(), -randInt(60, 800))),
  }));

  // Two of the fleet carry console accounts, so the sopir view has someone to
  // be. They are pinned to their own branch and linked to their truck: a driver
  // signing in must resolve to exactly one run, never to a branch-wide list.
  const berakun = drivers
    .filter((d) => d.branchId === BRANCHES[0].id && d.status !== "Cuti")
    .slice(0, 2);

  const sopir: UserEntity[] = berakun.map((d, i) => ({
    id: `usr-sopir-${String(i + 1).padStart(3, "0")}`,
    nama: d.nama,
    email: `${d.nama.toLowerCase().split(" ")[0]}.sopir@sidistrib.id`,
    role: "driver" as const,
    telepon: d.telepon,
    driverId: d.id,
    cabang: BRANCHES[0].nama,
    branchIds: [d.branchId],
    scopeType: "branch" as const,
    status: "Aktif" as const,
    terakhirMasuk: atTime(startOfToday(), "06:12"),
    dibuatPada: isoDate(addDays(startOfToday(), -randInt(60, 400))),
  }));

  return [...staf, ...sopir];
}

function seedProducts(): ProductEntity[] {
  // `returnable` marks the products where the customer hands back an empty in
  // exchange — cylinders do, accessories do not. The last two are kit
  // accessories (financial-statements plan P3.3) -- what a registration
  // invoice's kit items pick from (gap-closing plan, Phase C) -- mirroring
  // the real backend's own seeded Timbangan/Papan Pangkalan/APAR kit
  // products (seeds/06-outlets/seeder.go).
  const catalog = [
    { nama: "LPG 3 kg Subsidi", ukuran: "3 kg", satuan: "tabung", returnable: true, jual: 15_520, beli: 10_000, kind: "commodity" as const },
    { nama: "LPG 5,5 kg Bright Gas", ukuran: "5,5 kg", satuan: "tabung", returnable: true, jual: 88_000, beli: 79_500, kind: "commodity" as const },
    { nama: "LPG 12 kg", ukuran: "12 kg", satuan: "tabung", returnable: true, jual: 192_000, beli: 175_000, kind: "commodity" as const },
    { nama: "LPG 50 kg", ukuran: "50 kg", satuan: "tabung", returnable: true, jual: 810_000, beli: 742_000, kind: "commodity" as const },
    { nama: "Segel Tabung", ukuran: "1 lusin", satuan: "lusin", returnable: false, jual: 24_000, beli: 18_000, kind: "accessory" as const },
    { nama: "Selang Regulator SNI", ukuran: "1 set", satuan: "set", returnable: false, jual: 95_000, beli: 71_000, kind: "accessory" as const },
  ];
  return catalog.map((c, i) => ({
    id: `prd-${String(i + 1).padStart(3, "0")}`,
    kode: `SKU-${String(i + 1).padStart(4, "0")}`,
    nama: c.nama,
    ukuran: c.ukuran,
    satuan: c.satuan,
    returnable: c.returnable,
    hargaJual: c.jual,
    hargaBeli: c.beli,
    stok: randInt(20, 900),
    stokMinimum: randInt(40, 120),
    aktif: i !== 5,
    productKind: c.kind,
  }));
}

/** Defaults for every configurable block, also used when migrating old data. */
/**
 * The colourless fallback, for a database stored before the lexicon existed.
 * Seeded tenants override it; see `seedSettings`.
 */
export const DEFAULT_LEXICON: LexiconEntity = {
  satuan: "unit",
  outlet: "outlet",
  pemasok: "pemasok",
};

export const DEFAULT_NUMBERING: NumberingEntity = {
  suratJalan: "SJ",
  invoice: "INV",
  rencana: "RD",
  pesanan: "PO",
  sertakanTanggal: true,
};

export const DEFAULT_OPERATIONS: OperationsEntity = {
  rekamLokasi: true,
  // Wide enough for a forecourt and ordinary phone GPS error, tight enough that
  // a drop filed from the next kecamatan still stands out.
  radiusGeofenceMeter: 150,
  // Six-day week: the agency does not dispatch on Sunday.
  hariKerja: [1, 2, 3, 4, 5, 6],
  durasiSinggahMenit: 90,
  leadTimeHari: 14,
};

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  rules: {
    saExpiry: {
      aktif: true,
      ambang: 7,
      penerima: ["admin", "manager"],
      kanal: ["app"],
    },
    quotaLow: {
      aktif: true,
      ambang: 95,
      penerima: ["admin", "manager"],
      kanal: ["app"],
    },
    stockLow: {
      aktif: true,
      ambang: 100,
      penerima: ["admin", "staff"],
      kanal: ["app"],
    },
    paymentPending: {
      aktif: true,
      ambang: 2,
      penerima: ["finance", "admin"],
      kanal: ["app", "email"],
    },
    deliveryDelay: {
      aktif: false,
      ambang: 60,
      penerima: ["admin", "staff"],
      kanal: ["app", "whatsapp"],
    },
    planUnconfirmed: {
      aktif: true,
      ambang: 17,
      penerima: ["admin", "staff"],
      kanal: ["app"],
    },
    orderPending: {
      aktif: true,
      ambang: 5,
      penerima: ["manager", "staff"],
      kanal: ["app"],
    },
  },
  whatsapp: {
    aktif: true,
    nomorPengirim: "0811-9000-142",
    templatePengingat:
      "Halo {outlet}, pengiriman {jumlah} tabung dijadwalkan {tanggal} pukul {jam}. Mohon siapkan penerimaan.",
  },
  email: { aktif: true, pengirim: "ops@sidistrib.id" },
};

function seedSupplier(): SupplierEntity[] {
  return SPBE.map((nama, i) => ({
    id: `supplier-${String(i + 1).padStart(3, "0")}`,
    kode: `SPBE-${String(i + 1).padStart(3, "0")}`,
    nama,
    alamat: `Jl. ${pick(["Lingkar Selatan", "Fatmawati", "Soekarno-Hatta", "Raya Kopeng"])} No. ${randInt(1, 90)}`,
    penanggungJawab: ORANG[(i * 7 + 3) % ORANG.length],
    telepon: `021-${randInt(700, 899)}-${randInt(1000, 9999)}`,
    aktif: true,
  }));
}

function seedBankAccounts(): BankAccountEntity[] {
  const rows: Array<[BankNameEntity, string]> = [
    ["BCA", "Salatiga"],
    ["Mandiri", "Ungaran"],
    ["BRI", "Tambun"],
  ];
  const bankRows: BankAccountEntity[] = rows.map(([bank, cabang], i) => ({
    id: `bank-${String(i + 1).padStart(3, "0")}`,
    bank,
    nomorRekening: `${randInt(100, 999)}-${randInt(100000, 999999)}-${randInt(10, 99)}`,
    atasNama: "PT. Bhakta Dharma Anindita",
    cabang,
    utama: i === 0,
    aktif: true,
    kind: "bank",
    ledgerAccountCode: "1-1100",
  }));
  // A till with no bank of its own -- Kas & Bank console (gap-closing
  // phase, Phase B) is the first feature that needs one to exist. Real
  // tenants get one only once someone creates it via Settings; seeded here
  // so the mock demo has one out of the box the same way it already does
  // for every other "day one" fixture.
  const pettyCash: BankAccountEntity = {
    id: "bank-cash-001",
    bank: "BCA",
    nomorRekening: "KAS-KECIL",
    atasNama: "PT. Bhakta Dharma Anindita",
    cabang: "Salatiga",
    utama: false,
    aktif: true,
    kind: "cash",
    ledgerAccountCode: "1-1000",
  };
  return [...bankRows, pettyCash];
}

/** One starting Pendaftaran Pangkalan template, so the "Buat tagihan"
 *  console (gap-closing plan, Phase C) has something to pick from out of
 *  the box -- "Segel Tabung" is the one active accessory in seedProducts
 *  above. */
function seedRegistrationPackages(products: ProductEntity[]): RegistrationPackageEntity[] {
  const segel = products.find((p) => p.nama === "Segel Tabung");
  const now = isoDate(startOfToday());
  return [
    {
      id: "regpkg-001",
      tenantId: TENANT.id,
      branchId: BRANCHES[0].id,
      name: "Paket Standar",
      feeAmount: 500_000,
      isDefault: true,
      isActive: true,
      items: segel ? [{ productId: segel.id, qty: 1 }] : [],
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/**
 * Three demo register rows -- one per class the console's own Daftar aset
 * tab needs to show, so "Rekonsiliasi" and the kit-item picker on
 * ManualInvoiceDialog both have something real on day one (gap-closing
 * plan, Phase D). `openingAccumulated` on the vehicle and building rows is
 * hand-computed by the same straight-line math `lib/depreciation.ts`
 * exposes (monthly * periods elapsed through `openingAsOf`), so a first
 * live run against this seed charges forward from a realistic baseline
 * rather than from zero on an asset that is actually years into its life.
 */
function seedAssets(accounts: AccountEntity[], vehicles: VehicleEntity[]): AssetEntity[] {
  const byCode = (kode: string) => accounts.find((a) => a.kode === kode)!.id;
  const now = isoDate(startOfToday());
  const scope = branchFor();
  return [
    {
      ...scope,
      id: "ast-001",
      assetCode: "AST-VHC-001",
      name: `Truk ${vehicles[0]?.armada ?? "Angkut"} — ${vehicles[0]?.plat ?? "B 0000 XX"}`,
      assetClass: "vehicle",
      acquisitionDate: "2024-06-01",
      depreciationStartDate: "2024-06-01",
      cost: 350_000_000,
      residualValue: 50_000_000,
      usefulLifeMonths: 60,
      method: "straight_line",
      openingAccumulated: 135_000_000,
      openingAsOf: "2026-09-30",
      assetAccountId: byCode("1-2200"),
      accumulatedAccountId: byCode("1-2900"),
      expenseAccountId: byCode("5-5200"),
      vehicleId: vehicles[0]?.id,
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      ...scope,
      id: "ast-002",
      assetCode: "AST-OFC-001",
      name: "Server & Peralatan Jaringan",
      assetClass: "office_equipment",
      acquisitionDate: "2026-09-01",
      depreciationStartDate: "2026-09-01",
      cost: 45_000_000,
      residualValue: 5_000_000,
      usefulLifeMonths: 36,
      method: "straight_line",
      openingAccumulated: 0,
      assetAccountId: byCode("1-2300"),
      accumulatedAccountId: byCode("1-2900"),
      expenseAccountId: byCode("5-5300"),
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      ...scope,
      id: "ast-003",
      assetCode: "AST-BLD-001",
      name: "Gedung Gudang & Kantor Cabang",
      assetClass: "building",
      acquisitionDate: "2020-01-01",
      depreciationStartDate: "2020-01-01",
      cost: 800_000_000,
      residualValue: 100_000_000,
      usefulLifeMonths: 240,
      method: "straight_line",
      openingAccumulated: 233_333_360,
      openingAsOf: "2026-09-30",
      assetAccountId: byCode("1-2100"),
      accumulatedAccountId: byCode("1-2900"),
      expenseAccountId: byCode("5-5100"),
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/**
 * What each tenant sets for itself.
 *
 * Partial by design: a field absent here is inherited from the parent, which is
 * the browser's mirror of iam.tenant_settings where NULL means "ask my parent".
 *
 * The shape of this seed is the demonstration. The group sets the working day
 * and the holding's identity once; Salatiga and Pati override only what is
 * genuinely theirs — their own legal name and agent number — and follow the
 * group on everything else. Tirta overrides its LEXICON, which is what makes
 * switching into it visibly re-label every screen: galon, depot, pabrik instead
 * of tabung, pangkalan, SPBE.
 *
 * If a subsidiary here restated the working day, the demo would still look
 * right and would prove nothing — inheritance is only observable where a value
 * is absent.
 */
function seedSettingsByTenant(): TenantSettingsEntity[] {
  return [
    {
      // The group. Sets the operating window and the notification rules once,
      // for everyone beneath it.
      tenantId: "tnt-001",
      values: {
        namaPerusahaan: "Bimbo Holdings",
        namaLegal: "PT Bimbo Holdings Indonesia",
        alamat: "Jl. Pemuda No. 118, Semarang Tengah, Kota Semarang 50139",
        zonaWaktu: "Asia/Jakarta",
        jamOperasionalMulai: "06:00",
        jamOperasionalSelesai: "18:00",
        istilah: { satuan: "tabung", outlet: "pangkalan", pemasok: "SPBE" },
      },
    },
    {
      // Its own legal identity, and nothing else. Hours and lexicon come from
      // the group — which is the point.
      tenantId: "tnt-002",
      values: {
        namaPerusahaan: "PT. Bhakta Dharma Anindita",
        namaLegal: "PT. Bhakta Dharma Anindita",
        nomorAgen: "AG-3373-0142",
        nomorRegistrasi: "NIB-3373-0001-2024",
        npwp: "01.234.567.8-508.000",
        pkp: true,
        tarifPajakDefault: 11,
        kantorLat: -7.3305,
        kantorLng: 110.5084,
        alamat: "Jl. Lingkar Selatan No. 42, Sidorejo, Kota Salatiga 50711",
        telepon: "0298-321-4210",
        email: "ops@bimbo.co.id",
      },
    },
    {
      tenantId: "tnt-003",
      values: {
        namaPerusahaan: "PT Bimbo Pati",
        namaLegal: "PT Bimbo Pati Makmur",
        nomorAgen: "AG-3318-0207",
        nomorRegistrasi: "NIB-3318-0004-2024",
        npwp: "02.345.678.9-507.000",
        pkp: true,
        tarifPajakDefault: 11,
        kantorLat: -6.7559,
        kantorLng: 111.0388,
        alamat: "Jl. Raya Pati-Juwana Km. 4, Margorejo, Kab. Pati 59163",
        telepon: "0295-381-7720",
        email: "pati@bimbo.co.id",
      },
    },
    {
      // A different trade under the same holding. The lexicon override is the
      // whole reason this tenant is seeded.
      tenantId: "tnt-004",
      values: {
        namaPerusahaan: "PT Bimbo Tirta",
        namaLegal: "PT Bimbo Tirta Nusantara",
        nomorAgen: "AG-3322-0311",
        nomorRegistrasi: "NIB-3322-0009-2025",
        npwp: "03.456.789.0-506.000",
        // Deliberately not PKP: a tenant below the threshold is the case the
        // ck_tenant_profiles_pkp_tax constraint exists for, and the seed should
        // contain one so the rule is exercised rather than assumed.
        pkp: false,
        tarifPajakDefault: 0,
        alamat: "Jl. Diponegoro No. 118, Ungaran Barat, Kab. Semarang 50517",
        telepon: "024-692-1880",
        email: "tirta@bimbo.co.id",
        istilah: { satuan: "galon", outlet: "depot", pemasok: "pabrik" },
      },
    },
  ];
}

/**
 * The console's own defaults — the last resort beneath every tenant.
 *
 * Exported because getDb() resolves against it on every read and must start
 * from a PRISTINE base each time. Resolving against the previously resolved
 * object instead lets one tenant's values become the next tenant's defaults for
 * any field neither of them sets, which is a cross-tenant leak that looks like
 * inheritance working.
 */
export function seedSettings(): SettingsEntity {
  return {
    // The LAST-RESORT default, not any tenant's identity.
    //
    // Every tenant supplies its own legal identity through settingsByTenant, so
    // these are only reached when nothing up the chain has set them. Putting a
    // real agent number here made the holding company display its subsidiary's
    // — inherited from a fallback rather than from a parent, which is not a
    // thing the hierarchy should be able to express.
    namaPerusahaan: "—",
    nomorAgen: "—",
    alamat: "—",
    telepon: "—",
    email: "—",
    namaLegal: "—",
    nomorRegistrasi: "—",
    npwp: "—",
    // Not PKP by default, and therefore no tax rate. The safe direction: a
    // tenant that has not told us it is registered must not be issuing invoices
    // with PPN on them.
    pkp: false,
    tarifPajakDefault: 0,
    zonaWaktu: "Asia/Jakarta",
    jamOperasionalMulai: "06:00",
    jamOperasionalSelesai: "18:00",
    // The pilot vertical's vocabulary, seeded as data. Changing these three
    // words in Pengaturan re-labels the whole console for another trade.
    istilah: { satuan: "tabung", outlet: "pangkalan", pemasok: "SPBE" },
    targetHarian: 1400,
    notifikasi: structuredClone(DEFAULT_NOTIFICATIONS),
    penomoran: { ...DEFAULT_NUMBERING },
    operasi: { ...DEFAULT_OPERATIONS },
    tema: "sistem",
  };
}

function seedNotifications(
  sas: SAEntity[],
  payments: PaymentEntity[],
  deliveries: DeliveryEntity[],
  products: ProductEntity[],
  settings: SettingsEntity,
): NotificationEntity[] {
  const out: NotificationEntity[] = [];
  // Seeded alerts obey the same switches as live ones, so a rule that starts
  // switched off does not arrive with history behind it.
  const push = (n: Omit<NotificationEntity, "id">) => {
    if (n.rule && !settings.notifikasi.rules[n.rule]?.aktif) return;
    out.push({ id: `ntf-${String(out.length + 1).padStart(3, "0")}`, ...n });
  };

  const limitSa = sas.find((s) => s.status === "Limit");
  if (limitSa) {
    push({
      type: "Alert",
      title: "Kuota SA hampir habis",
      message: `${limitSa.nomorSA} tersisa ${(limitSa.totalKuota - limitSa.terpakai).toLocaleString("id-ID")} tabung. Rencanakan ulang distribusi sebelum periode berakhir.`,
      createdAt: atTime(startOfToday(), "07:10"),
      isRead: false,
      href: "/sa",
      rule: "quotaLow",
    });
  }

  const pending = payments.filter((p) => p.status === "Menunggu Verifikasi");
  if (pending.length > 0) {
    push({
      type: "Pengingat",
      title: `${pending.length} pembayaran menunggu verifikasi`,
      message: `Total ${pending.reduce((s, p) => s + p.jumlah, 0).toLocaleString("id-ID")} rupiah belum diverifikasi tim keuangan.`,
      createdAt: atTime(startOfToday(), "08:00"),
      isRead: false,
      href: "/payments",
      rule: "paymentPending",
    });
  }

  const tertunda = deliveries.filter(
    (d) => d.tanggal === isoDate(startOfToday()) && d.status === "Tertunda",
  );
  if (tertunda.length > 0) {
    push({
      type: "Alert",
      title: "Pengiriman tertunda",
      message: `${tertunda.length} surat jalan hari ini belum dapat diselesaikan armada.`,
      createdAt: atTime(startOfToday(), "11:20"),
      isRead: false,
      href: "/monitoring",
      rule: "deliveryDelay",
    });
  }

  const lowStock = products.filter((p) => p.aktif && p.stok < p.stokMinimum);
  if (lowStock.length > 0) {
    push({
      type: "Alert",
      title: "Stok di bawah minimum",
      message: `${lowStock.map((p) => p.nama).join(", ")} berada di bawah ambang batas stok.`,
      createdAt: atTime(addDays(startOfToday(), -1), "16:45"),
      isRead: false,
      href: "/products",
      rule: "stockLow",
    });
  }

  push({
    type: "Sistem",
    title: "Sinkronisasi SPBE selesai",
    message: "Data realisasi dari SPBE mitra berhasil disinkronkan pagi ini.",
    createdAt: atTime(startOfToday(), "06:05"),
    isRead: true,
    href: "/sa",
  });

  push({
    type: "Pengingat",
    title: "Rencana besok belum dikonfirmasi",
    message: "Rencana distribusi untuk besok masih berstatus draf. Konfirmasi sebelum pukul 17.00.",
    createdAt: atTime(startOfToday(), "13:30"),
    isRead: false,
    href: "/distribution",
      rule: "planUnconfirmed",
  });

  push({
    type: "Sistem",
    title: "Laporan bulan lalu siap diunduh",
    message: "Rekapitulasi distribusi dan keuangan periode sebelumnya telah selesai diproses.",
    createdAt: atTime(addDays(startOfToday(), -2), "07:00"),
    isRead: true,
    href: "/reports",
  });

  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Two fences the demo can show, and no alerts.
 *
 * A circle round the Salatiga pool and a polygon over the district it serves:
 * one of each shape, because they are edited differently and a demo with only
 * circles hides half the screen.
 *
 * geofenceAlerts starts empty, and that is the honest state rather than a
 * missing fixture. Alerts are raised by the backend's evaluator from a
 * driver's own GPS trail; nothing in the browser produces one, and seeding
 * invented breaches would put a name against a driver who did not commit one.
 * The panel says "belum ada pelanggaran tercatat" for exactly this reason.
 */
function seedGeofenceRules(): GeofenceRuleEntity[] {
  const b = BRANCHES[0];
  const scope = { tenantId: b.tenantId, branchId: b.id };
  return [
    {
      ...scope,
      id: "gfr-001",
      kode: "pool-salatiga-500m",
      nama: "Pool Salatiga",
      keterangan: "Armada dianggap berangkat setelah keluar dari radius ini.",
      bentuk: {
        jenis: "Lingkaran",
        pusat: { lat: b.lat, lng: b.lng },
        radiusMeter: 500,
      },
      subjek: "Depot",
      mode: "Keluar",
      keparahan: "Peringatan",
      aktif: true,
      version: 1,
    },
    {
      ...scope,
      id: "gfr-002",
      kode: "wilayah-argomulyo",
      nama: "Wilayah Argomulyo",
      keterangan: "Area layanan yang disepakati untuk rute selatan.",
      bentuk: {
        jenis: "Poligon",
        batas: [
          { lat: -7.3520, lng: 110.4880 },
          { lat: -7.3480, lng: 110.5320 },
          { lat: -7.3820, lng: 110.5280 },
          { lat: -7.3860, lng: 110.4920 },
        ],
      },
      subjek: "Area terlarang",
      mode: "Masuk",
      keparahan: "Kritis",
      aktif: true,
      version: 1,
    },
  ];
}

/**
 * Gap-closing plan, Phase F: the tenant's own expense categories, grouped
 * for the expense form's picker -- mirrors the real backend's own starting
 * twelve (migration 60012_..._alter_core_expenses_category_fk.up.sql),
 * same codes, same group labels, same account mapping, so a mock-mode demo
 * and a freshly-provisioned real tenant read identically.
 */
function seedExpenseCategories(accounts: AccountEntity[]): ExpenseCategoryEntity[] {
  const byCode = (kode: string) => accounts.find((a) => a.kode === kode)!.id;
  const now = isoDate(startOfToday());
  const scope = branchFor();
  const rows: Array<[string, string, string, string, number]> = [
    ["fuel", "BBM", "5-3100", "Biaya Logistik", 1],
    ["toll", "Tol", "5-3200", "Biaya Logistik", 2],
    ["parking", "Parkir", "5-3400", "Biaya Logistik", 3],
    ["shipping", "Biaya Pengiriman ke Customer", "5-2000", "Biaya Logistik", 4],
    ["maintenance", "Perbaikan & Perawatan Kendaraan", "5-3300", "HR & GA", 5],
    ["salary", "Gaji Pokok Staff", "5-4100", "HR & GA", 6],
    ["office", "ATK & Keperluan Kantor", "5-4200", "HR & GA", 7],
    ["dues", "Iuran & Sumbangan", "5-4300", "HR & GA", 8],
    ["telecom", "Telepon & Internet", "5-4400", "HR & GA", 9],
    ["petty_cash", "Kas Kecil", "5-3900", "HR & GA", 10],
    ["other", "Biaya Lainnya", "5-3900", "HR & GA", 11],
    ["bank_charges", "Administrasi Bank", "5-6100", "Biaya di Luar Usaha", 12],
  ];
  return rows.map(([code, name, accountCode, groupLabel, sortOrder]) => ({
    ...scope,
    id: `expcat-${code}`,
    code,
    name,
    accountId: byCode(accountCode),
    groupLabel,
    sortOrder,
    status: "atv",
    version: 1,
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * Gap-closing plan, Phase F: local vendors a general purchase pays, real
 * master data distinct from the SA-issuing "Pemasok" names seedSupplier()
 * seeds above (see VendorEntity's own doc). PERTAMINA mirrors the real
 * backend's own seeded row (every SA-redeemed purchase.RecordPurchase
 * resolves it by this exact code) -- kept even though this console's own
 * purchase form never creates that kind of purchase, so a tenant switching
 * between mock and API data never sees a code the real backend would also
 * have reserved.
 */
function seedVendors(): VendorEntity[] {
  const now = isoDate(startOfToday());
  const scope = branchFor();
  return [
    { ...scope, id: "vnd-pertamina", code: "PERTAMINA", name: "PT. Pertamina Patra Niaga", status: "atv", version: 1, createdAt: now, updatedAt: now },
    { ...scope, id: "vnd-001", code: "VND-001", name: "UD. Sumber Logam", address: "Jl. Industri No. 12, Salatiga", phone: "0298-123-456", status: "atv", version: 1, createdAt: now, updatedAt: now },
    { ...scope, id: "vnd-002", code: "VND-002", name: "CV. Timbangan Jaya", npwp: "01.234.567.8-901.000", address: "Jl. Raya Tengaran No. 45", phone: "0298-654-321", status: "atv", version: 1, createdAt: now, updatedAt: now },
  ];
}

/* ── entry point ───────────────────────────────────────────────────────── */

export function createSeedDatabase(): Database {
  const outlets = seedOutlet();
  const drivers = seedDrivers();
  const vehicles = seedVehicles();
  const scheduleAgreements = seedScheduleAgreements();
  const saDailyTargets = seedDailyTargets(scheduleAgreements);
  const products = seedProducts();
  const { plans, planRows, deliveries } = seedOperations(
    outlets,
    drivers,
    scheduleAgreements,
    products,
  );
  const settings = seedSettings();
  const { invoices, payments, creditNotes, accounts, journals } = seedReceivables(
    deliveries,
    outlets,
    products,
  );
  const receipts = seedReceipts(outlets, products);
  const notifications = seedNotifications(
    scheduleAgreements,
    payments,
    deliveries,
    products,
    settings,
  );

  return {
    version: DB_VERSION,
    seededAt: new Date().toISOString(),
    tenants: TENANTS,
    branches: BRANCHES,
    outlets,
    drivers,
    vehicles,
    geofenceRules: seedGeofenceRules(),
    // Raised by the backend evaluator from a real GPS trail. Nothing in the
    // browser produces one, and inventing breaches would accuse a driver.
    geofenceAlerts: [],
    scheduleAgreements,
    saDailyTargets,
    // Uploads are made in the browser, so the seeded day starts with none.
    saImportBatches: [],
    sim3lonSourceSnapshots: [],
    sim3lonPlanSources: [],
    plans,
    planRows,
    deliveries,
    // Filed by drivers in the browser, so the seeded day starts with none.
    deliveryEvents: [],
    transportationClaims: seedTransportationClaims(deliveries),
    outletWarnings: seedOutletWarnings(outlets),
    payments,
    receipts,
    notifications,
    audit: [],
    users: seedUsers(drivers),
    products,
    orders: seedOrders(outlets, products),
    suppliers: seedSupplier(),
    bankAccounts: seedBankAccounts(),
    accounts,
    journals,
    // Kas & Bank console (gap-closing phase, Phase B): nothing recorded yet
    // at day one, the same reasoning deliveryEvents/audit above follow.
    cashVouchers: [],
    bankStatementImports: [],
    bankStatementRules: [],
    // "Buat tagihan" console (gap-closing plan, Phase C): one starting
    // template, so the demo has something to pick from immediately --
    // mirrors the real backend's own seeded kit products
    // (seeds/06-outlets/seeder.go), minus the two this mock's catalogue
    // never carried (Timbangan/Papan Pangkalan/APAR) in favour of the
    // accessory already in seedProducts above.
    registrationPackages: seedRegistrationPackages(products),
    // Asset register console (gap-closing plan, Phase D): three demo rows,
    // no run posted against them yet -- the seeded day starts with none,
    // the same reasoning deliveryEvents/audit/cashVouchers above follow.
    assets: seedAssets(accounts, vehicles),
    // Tutup Buku / opening-balance console (gap-closing plan, Phase E):
    // no year closed and no opening balance committed yet at day one, the
    // same reasoning deliveryEvents/audit/cashVouchers above follow.
    depreciationRuns: [],
    fiscalYears: [],
    openingBalances: [],
    // Sub-ledger admin console (gap-closing plan, Phase F): the real
    // starting categories and two demo vendors so the forms have something
    // to pick from immediately; no purchase recorded yet at day one, the
    // same reasoning cashVouchers/depreciationRuns above follow.
    expenseCategories: seedExpenseCategories(accounts),
    vendors: seedVendors(),
    purchases: [],
    invoices,
    creditNotes,
    settings,
    settingsByTenant: seedSettingsByTenant(),
  };
}
