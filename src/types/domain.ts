/**
 * Entity model for the in-browser mock backend.
 *
 * These are the *storage* shapes — normalised, id-linked, and close to what a
 * real API would return. Feature APIs map them into the view shapes that pages
 * already consume (`src/features/<x>/types.ts`), so swapping in a real backend
 * means rewriting only `src/features/<x>/api/*`.
 */

export type ID = string;

export type { GeoStamp } from "@/lib/geo";
import type { GeoStamp } from "@/lib/geo";

/* ── tenancy ───────────────────────────────────────────────────────────── */

/**
 * Mirrors iam.tenants / core.branches in the Go schema.
 *
 * Tenant is the isolation boundary and is fixed by the session — it is never
 * user-switchable here. Branch is the operational node inside it and is what
 * the scope switcher changes.
 */
export interface TenantEntity {
  id: ID;
  kode: string;
  nama: string;
  aktif: boolean;

  /**
   * The tenant this one sits under. `null` for a root.
   *
   * A tenant may own sub-tenants running different businesses, which may in
   * turn own sub-tenants and branches — an LPG holding with a water-depot
   * subsidiary is the case the model exists for.
   */
  indukId: ID | null;

  /**
   * How deep in the tree, counted from the ROOT — not from whoever is looking.
   *
   * Also the number of ancestors it has. Absolute on purpose, so two people
   * acting as different tenants describe the same tenant the same way. The
   * scope switcher renders this absolute depth as a numbered level. That
   * keeps a parent visibly above its subsidiaries even when the active tenant
   * is itself a subsidiary.
   */
  level: number;

  /**
   * What business this tenant runs, which decides its starting vocabulary and
   * the product categories available to it.
   *
   * Deliberately does NOT inherit: a water-depot subsidiary of an LPG holding
   * must not pick up "LPG" from its parent. Contrast with `SettingsEntity`,
   * which does inherit.
   */
  jenisUsaha: string;

  /** 'grup' owns others and runs nothing itself; 'operasional' does both. */
  jenis: "grup" | "operasional";
}

/**
 * A settings value, and where it came from.
 *
 * Settings inherit per FIELD: `null` means "not set here, ask my parent", so a
 * subsidiary that renames only its lexicon still follows its group's working
 * week. Rendering only the effective value loses that distinction — and a form
 * that saved it back would turn every inherited value into an override the
 * parent could never change again.
 *
 * So the shape carries both: what applies, and whether this tenant chose it.
 */
export interface Inherited<T> {
  /** What applies, after inheritance. Never null once anything up the tree set it. */
  nilai: T | null;
  /** The tenant that supplied it, or `null` when this tenant set it itself. */
  diwarisiDari: { id: ID; kode: string; nama: string } | null;
}

export interface BranchEntity {
  id: ID;
  tenantId: ID;
  kode: string;
  nama: string;
  kota: string;
  provinsi: string;
  alamat: string;
  penanggungJawab: string;
  telepon: string;
  /** Depot coordinates — core.branches.location in the schema. */
  lat: number;
  lng: number;
  /** The branch loaded at login when none is specified. */
  utama: boolean;
  aktif: boolean;
  /**
   * core.branches.planning_start_date: the first date this branch plans in
   * the system. Earlier SIM3LON days are the Base quota's opening balance.
   */
  planningStartDate?: string;
}

/** The four authorisation levels the backend defines on iam.user_roles. */
export type ScopeType = "global" | "tenant" | "branch" | "outlet";

/** Everything that scopes a row. Present on every operational entity. */
export interface Scoped {
  tenantId: ID;
  branchId: ID;
}

export type OutletStatus = "Aktif" | "Nonaktif" | "Ditangguhkan";

export interface OutletEntity extends Scoped {
  id: ID;
  kode: string;
  nama: string;
  alamat: string;
  kecamatan: string;
  kota: string;
  lat: number;
  lng: number;
  penanggungJawab: string;
  telepon: string;
  status: OutletStatus;
  kuotaBulanan: number;
  terdaftarPada: string;

  /* ── credit control ── */
  /** Payment terms in days. 0 means cash on delivery. */
  termin: number;
  /** Credit ceiling in rupiah. 0 means no limit. */
  batasKredit: number;
  /** Refuse to dispatch when the outlet is over limit or overdue. */
  blokirOtomatis: boolean;

  /* ── expected receiving account ── */
  /** The account a receipt from this outlet is expected to arrive from --
   *  what recording a payment for it defaults to. Absent for an outlet whose
   *  account is not on file yet, which is a real state, not an error. */
  bank?: BankNameEntity;
  noRekening?: string;
}

export type DriverStatusEntity =
  | "Standby"
  | "Dalam Perjalanan"
  | "Bongkar Muat"
  | "Selesai"
  | "Cuti";

/**
 * A person who drives, and nothing about a truck.
 *
 * # Why the vehicle is not on here
 *
 * `core.drivers` and `core.vehicles` have no link column anywhere. The pairing
 * lives on `core.dispatch_trips` (`driver_id` + `vehicle_id`), which is right:
 * a driver swaps trucks and a truck swaps drivers, so a `default_vehicle_id`
 * would be a second source of truth for something a trip already records.
 *
 * This entity used to carry `plat`, `armada` and `kapasitas`, and the screens
 * built on it asked questions with no answer — "what is this driver's
 * capacity?" is a question about a truck on a particular day. They now read
 * `VehicleEntity`, and capacity comes from the vehicle the driver is crewed
 * with.
 */
export interface DriverEntity extends Scoped {
  id: ID;
  /**
   * The depot's own reference, DRV-0001. Required by the service and unique
   * per tenant — it is what a dispatcher writes on paper and reads back, and
   * the console had never modelled it because the mock never needed one.
   */
  kode: string;
  nama: string;
  telepon: string;
  nomorSim: string;
  status: DriverStatusEntity;
  bergabungPada: string;
  /**
   * The mobile-app login this driver signs into, when they have one. A driver
   * is always a person, and a person here is always a user — so this is set on
   * every driver created through the registration form, which now provisions
   * the login in the same step rather than leaving it to be wired up later
   * from the Users page.
   */
  userId?: ID;
}

export type VehicleStatusEntity = "Aktif" | "Perawatan" | "Nonaktif";

/**
 * A truck. Carries the capacity, because that is a property of the vehicle and
 * of nothing else.
 *
 * `kapasitasKg` is nullable on purpose and mirrors the schema: `capacity_qty`
 * is NOT NULL and `capacity_kg` is not, because "unknown weight limit, check
 * the count only" is a real configuration rather than a missing field.
 */
export interface VehicleEntity extends Scoped {
  id: ID;
  plat: string;
  /** Make and model, as the depot says it: "Isuzu Elf NMR". */
  armada: string;
  /** Units of product one load holds. Never zero — a truck that carries
   * nothing is not a truck. */
  kapasitas: number;
  kapasitasKg?: number;
  status: VehicleStatusEntity;
  terdaftarPada: string;
}

/**
 * A geofence, as the console holds it.
 *
 * The shape is a discriminated pair rather than four loose numbers because the
 * service refuses a circle carrying a boundary and a polygon carrying a
 * centre: rule_type decides which half of the row may be populated, and
 * ck_geofence_rules_shape enforces it underneath.
 */
export type GeofenceShapeEntity =
  | { jenis: "Lingkaran"; pusat: { lat: number; lng: number }; radiusMeter: number }
  | { jenis: "Poligon"; batas: { lat: number; lng: number }[] };

export interface GeofenceRuleEntity extends Scoped {
  id: ID;
  kode: string;
  nama: string;
  keterangan?: string;
  bentuk: GeofenceShapeEntity;
  subjek: "Rute" | "Wilayah outlet" | "Depot" | "Area terlarang";
  outletId?: ID;
  mode: "Keluar" | "Masuk";
  keparahan: "Info" | "Peringatan" | "Kritis";
  aktif: boolean;
  version: number;
}

/**
 * A breach recorded against a fence.
 *
 * There is no route back to "Terbuka" once it has moved: reopening is the
 * evaluator's job, by filing a fresh alert, not an operator's by rewriting an
 * old one.
 */
export interface GeofenceAlertEntity extends Scoped {
  id: ID;
  ruleId: ID;
  pelanggaran: "Keluar" | "Masuk";
  posisi: { lat: number; lng: number };
  jarakMeter?: number;
  terdeteksi: string;
  status: "Terbuka" | "Ditinjau" | "Selesai" | "Bukan pelanggaran";
  driverId?: ID;
  catatan?: string;
  version: number;
}

export type SAStatusEntity = "Draft" | "Aktif" | "Limit" | "Selesai";

export interface SAEntity extends Scoped {
  id: ID;
  nomorSA: string;
  supplier: string;
  periodeMulai: string; // ISO date
  periodeBerakhir: string; // ISO date
  totalKuota: number;
  /** Quota reserved by draft and confirmed plan rows. */
  dialokasikan: number;
  terpakai: number;
  status: SAStatusEntity;
  catatan?: string;
  namaDokumen?: string;
  diunggahOleh: string;
  diunggahPada: string;
  // Absent for an agreement typed by hand: the mock only models a single
  // product per agreement (the real backend's SIM3LON import is the same,
  // one product per batch), and a manual entry has no product quota at all
  // until one is imported or added.
  productId?: ID;
  productName?: string;
  /**
   * Mock parity for core.sa_quota_opening_balances: outlet -> units delivered
   * before the branch's planning start date. Folded into `dialokasikan` and
   * `terpakai` the way the backend folds it into allocated and used.
   */
  saldoAwal?: Record<ID, number>;
}

/**
 * One date's stated obligation under an agreement.
 *
 * Kept per date rather than as a monthly total because a shortfall is argued
 * day by day: "the 24th was 300 and we delivered 210" is a claim, and a month's
 * figure divided by its working days is not.
 *
 * A target of zero is a real row. Sundays and public holidays are stated zeros,
 * and the distinction between "nothing was due" and "nobody entered it" is
 * exactly what this table exists to keep.
 */
export interface SADailyTargetEntity {
  id: ID;
  saId: ID;
  tanggal: string; // ISO date
  target: number;
  /**
   * How the number arrived, not who typed it.
   *
   * A figure the supplier stated and one a person keyed from a PDF are
   * different kinds of evidence, and only the file can be produced in an
   * argument. `importBatchId` names which file.
   */
  sumber: "manual" | "file_import";
  importBatchId: ID | null;
}

/**
 * An upload, and what applying it would do.
 *
 * The parsed rows are held on the batch so applying writes what was reviewed:
 * re-reading the file at apply time would let a different file be applied than
 * the one whose diff someone approved.
 */
export interface SAImportBatchEntity {
  id: ID;
  saId: ID;
  namaBerkas: string;
  /** SHA-256 of the bytes read. */
  checksum: string;
  status: "parsed" | "applied";
  dibuatPada: string;
  diterapkanPada?: string;
  rows: { tanggal: string; target: number }[];
  barisDitulis: number;
}

/** Immutable outlet/day rows behind one applied SIM3LON monthly batch. */
export interface SIM3LONSourceSnapshotEntity extends Scoped {
  batchId: ID;
  saId: ID;
  productId: ID;
  periodMonth: string;
  status: "parsed" | "applied";
  complete: boolean;
  createdAt: string;
  fileName?: string;
  checksum?: string;
  supplierName?: string;
  rows: { date: string; outletId: ID; qty: number }[];
}

/** Mock parity for integration.sim3lon_plan_sources. */
export interface SIM3LONPlanSourceEntity extends Scoped {
  planId: ID;
  batchId: ID;
  productId: ID;
  operationalDate: string;
}

export type PlanStatusEntity = "Draft" | "Terkonfirmasi" | "Selesai" | "Batal";

export interface PlanEntity extends Scoped {
  id: ID;
  version: number;
  kode: string;
  tanggal: string; // ISO date
  saId: ID;
  status: PlanStatusEntity;
  catatan?: string;
  dibuatOleh: string;
  dibuatPada: string;
  dikonfirmasiOleh?: string;
  dikonfirmasiPada?: string;
}

export interface PlanRowEntity {
  id: ID;
  planId: ID;
  outletId: ID;
  driverId: ID | null;
  /**
   * The truck this stop rides on. Null until the run is crewed.
   *
   * A driver and a vehicle are both properties of the run, not of the stop, so
   * every row on one trip carries the same pair — the row is where they are
   * stored because the console edits a plan as a list of stops.
   *
   * It exists because the service will not accept a run without one:
   * `dispatch_trips.vehicle_id` and `deliveries.vehicle_id` are both NOT NULL.
   * A board with drivers and no trucks cannot be applied, and the delivery it
   * would produce cannot be written.
   */
  vehicleId?: ID | null;
  lines: PlanRowLine[];
  /** Derived: total units across `lines`. */
  jumlahUnit: number;
  jamPengiriman: string; // "HH:mm"
  /**
   * Which of the driver's depot cycles carries this stop. Null when nobody has
   * been given it yet.
   *
   * Optional so every board saved before trips existed still loads; such a row
   * reads as trip 1, which is what it was.
   */
  tripNo?: number | null;
  /**
   * Position within its run, 1-based. Optional for the same reason as
   * `tripNo` -- a board saved before ordering was tracked has none, and such a
   * stop sorts last rather than first.
   */
  urutan?: number | null;
}

/* ── transaction lines ─────────────────────────────────────────────────── */

/**
 * What is being moved, and how much of it.
 *
 * Lines are the source of truth on every transaction. The scalar totals beside
 * them (`jumlahUnit`, `target`, `realisasi`) are derived and kept in step by
 * the rules layer — they exist so the many screens that only need "how many
 * units" do not each have to sum a line set.
 *
 * Before this, a transaction carried a bare quantity of an *implicit* product
 * and every invoice was priced from one global setting. A catalogue with 3 kg,
 * 12 kg and 50 kg cylinders in it was therefore billed entirely at the 3 kg
 * price, and posted cost of goods at the 3 kg cost.
 */
export interface OrderLine {
  productId: ID;
  jumlah: number;
}

export type PlanRowLine = OrderLine;

export interface DeliveryLine {
  productId: ID;
  /** Loaded onto the truck. */
  target: number;
  /** Accepted at the drop — what the invoice is raised from. */
  realisasi: number;
  /** Empty containers collected in exchange, for returnable products. */
  kembali?: number;
}

/**
 * A priced line on an invoice.
 *
 * Name, unit and price are snapshotted rather than joined: an invoice must
 * reprint identically years later, after the product has been renamed and
 * repriced. Reading them live from the catalogue would silently rewrite issued
 * documents.
 */
export interface InvoiceLine {
  productId: ID;
  nama: string;
  satuan: string;
  jumlah: number;
  hargaSatuan: number;
  subtotal: number;
}

export type DeliveryStatus = "Antrian" | "Proses" | "Selesai" | "Tertunda";

export interface DeliveryEntity extends Scoped {
  id: ID;
  kode: string; // surat jalan number
  planId: ID;
  planRowId: ID;
  outletId: ID;
  driverId: ID;
  tanggal: string; // ISO date
  jamRencana: string; // "HH:mm"
  lines: DeliveryLine[];
  /** Derived from `lines`: total units loaded, accepted, and collected back. */
  target: number;
  realisasi: number;
  status: DeliveryStatus;
  mulaiPada?: string;
  /**
   * When the truck reached the gate, filed separately from closing the drop.
   *
   * The two are separate facts: a driver can wait at a pangkalan for an hour
   * while somebody finds the person who signs, and that gap is the whole of
   * what a delay report is made of. Without this the wait reads as zero,
   * because the arrival gets stamped at the same instant as the completion.
   */
  tibaPada?: string;
  selesaiPada?: string;
  driverLat?: number;
  driverLng?: number;
  /**
   * Empty cylinders collected at the drop.
   *
   * Recorded by the sopir, not derived: an outlet rarely returns exactly what
   * it receives, and the difference is what cylinder reconciliation is about.
   */
  unitKembali?: number;
  /** Who signed for the load — the proof-of-delivery the driver captures. */
  diterimaOleh?: string;
  catatan?: string;
}

/* ── delivery events ───────────────────────────────────────────────────── */

export type DeliveryEventType = "berangkat" | "tiba" | "selesai" | "tertunda";

/**
 * One thing the sopir filed, and where they were when they filed it.
 *
 * An append-only log rather than fields on the delivery, because a drop can be
 * departed, attempted, held and re-attempted — and the position at each of
 * those is a separate fact. Overwriting one slot would keep only the last.
 *
 * Mirrors core.delivery_events in the Go schema.
 */
export interface DeliveryEventEntity extends Scoped {
  id: ID;
  deliveryId: ID;
  driverId: ID;
  tipe: DeliveryEventType;
  at: string;
  aktor: string;
  posisi: GeoStamp;
  /**
   * Metres between the fix and the outlet, frozen at the time of filing.
   *
   * Stored rather than derived: re-pinning a outlet later would silently
   * rewrite history, and this figure is what an auditor reads.
   */
  jarakMeter?: number;
  catatan?: string;
}

/**
 * A claim for the transportation fee -- a BAST covering one calendar month.
 * Opened empty for a period; its lines and its amount are DERIVED from
 * actual deliveries in that period (see the transportation feature's own
 * `generateLines`), not typed by hand. See D3's own plan, A-Step 1/5, for
 * why the schema underneath calls this a "transportation claim" and a
 * "handover reference" while every screen reading this type says "BAST".
 */
export type ClaimStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "paid";

export interface TransportationClaimEntity extends Scoped {
  id: ID;
  claimNumber: string;
  /** Absent until the BAST paper is actually handed over. */
  handoverReference?: string;
  handoverDate: string; // ISO date
  /** The calendar month this claim covers -- both absent only for a claim predating this field. */
  periodStart?: string;
  periodEnd?: string;
  /** Written by `generateLines`; all three are zero on a draft nothing has been generated for yet. */
  claimedAmount: number;
  totalQty: number;
  totalWeightKg: number;
  principalInvoiceNumber?: string;
  claimStatus: ClaimStatus;
  statusNote?: string;
  statusUpdatedAt?: string;
  /** Settlement facts -- present only once claimStatus is "paid". */
  settledAt?: string;
  settledAmount?: number;
  settlementMode?: "cash" | "bank";
  /** Which deliveries this claim's generated lines actually cover. */
  deliveryIds: ID[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One Surat Peringatan (SP) issued to an outlet — D3 A-Step 3. A plain,
 * append-only log: no status, no version, no update or delete. A warning is
 * corrected by issuing a new entry, not editing one already handed to the
 * outlet.
 */
export interface OutletWarningEntity extends Scoped {
  id: ID;
  outletId: ID;
  issuedOn: string; // ISO date
  reason: string;
  notes?: string;
  createdAt: string;
}

export type BankNameEntity = "BCA" | "BNI" | "Mandiri" | "BRI" | "BSI";

/* ── accounts receivable ───────────────────────────────────────────────── */

export type InvoiceStatus =
  | "Terbit"
  | "Sebagian"
  | "Lunas"
  | "Jatuh Tempo"
  | "Batal";

/**
 * What a outlet owes. Separate from the cash that settles it: one transfer
 * can pay several invoices, and one invoice can be settled by several
 * transfers, so the two cannot share a record.
 */
export interface InvoiceEntity extends Scoped {
  id: ID;
  nomor: string;
  outletId: ID;
  deliveryId: ID | null;
  tanggal: string;
  /** Derived from the outlet's payment terms at the time of issue. */
  jatuhTempo: string;
  lines: InvoiceLine[];
  /** Derived from `lines`. `hargaSatuan` is a blended average once mixed. */
  jumlahUnit: number;
  hargaSatuan: number;
  subtotal: number;
  /** Zero for now; the column exists so adding PPN is not another migration. */
  pajak: number;
  total: number;
  /** Sum of allocations against this invoice. */
  terbayar: number;
  /** Credit notes applied. */
  kredit: number;
  status: InvoiceStatus;
  catatan?: string;
  dibuatOleh: string;
}

export type PaymentStatusEntity =
  | "Menunggu Verifikasi"
  | "Terverifikasi"
  | "Ditolak";

/** Money applied from one receipt to one invoice. */
export interface PaymentAllocation {
  invoiceId: ID;
  jumlah: number;
}

/** Cash received from a outlet, which may settle several invoices. */
export interface PaymentEntity extends Scoped {
  id: ID;
  nomor: string;
  outletId: ID;
  tanggal: string;
  jumlah: number;
  bank: BankNameEntity;
  noRekening: string;
  rekeningTujuanId?: ID;
  status: PaymentStatusEntity;
  /** Empty until the receipt is applied to invoices. */
  alokasi: PaymentAllocation[];
  buktiTransfer?: string;
  keterangan?: string;
  diverifikasiOleh?: string;
  diverifikasiPada?: string;
}

export type CreditNoteStatus = "Terbit" | "Terpakai" | "Batal";

/** A reduction of what is owed — returned cylinders, or a billing correction. */
export interface CreditNoteEntity extends Scoped {
  id: ID;
  nomor: string;
  outletId: ID;
  invoiceId: ID | null;
  tanggal: string;
  jumlah: number;
  alasan: string;
  status: CreditNoteStatus;
  dibuatOleh: string;
}

/* ── general ledger ────────────────────────────────────────────────────── */

export type AccountType =
  | "Aset"
  | "Kewajiban"
  | "Ekuitas"
  | "Pendapatan"
  | "Beban";

/**
 * Roles let the posting rules find an account without hardcoding its code, so
 * the chart can be renumbered without touching business logic.
 */
export type AccountRole =
  | "kas"
  | "bank"
  | "piutang"
  | "persediaan"
  | "pendapatan"
  | "returPenjualan"
  | "hpp"
  | "ppnKeluaran"
  | "labaDitahan"
  // Chart v2 (financial-statements plan, phase P1) -- mirrors
  // fortius-backend's own new fin.accounts roles one for one; see
  // tenantprovisioning/chart.go for the backend names these translate.
  | "piutangPendaftaran"
  | "hutangTitipan"
  | "uangMuka"
  | "saldoAwalEkuitas"
  | "pendapatanPendaftaran"
  | "jasaGiro"
  | "pendapatanLain"
  | "selisihPersediaan"
  | "administrasiBank"
  | "pajakJasaGiro";

export interface AccountEntity {
  id: ID;
  kode: string;
  nama: string;
  tipe: AccountType;
  /** Which side increases this account. */
  saldoNormal: "debit" | "kredit";
  /** Parent account code, for the indented chart. */
  induk?: string;
  role?: AccountRole;
  /** Accounts the posting rules depend on cannot be deleted. */
  sistem: boolean;
  aktif: boolean;
}

export interface JournalLine {
  akunId: ID;
  debit: number;
  kredit: number;
  memo?: string;
}

export type JournalSourceType =
  | "invoice"
  | "payment"
  | "creditNote"
  | "delivery"
  | "manual";

/**
 * A posted journal is immutable. Corrections are made by posting a reversal,
 * which is what an auditor expects to see.
 */
export interface JournalEntity extends Scoped {
  id: ID;
  nomor: string;
  tanggal: string;
  keterangan: string;
  sumber: { tipe: JournalSourceType; id: ID };
  lines: JournalLine[];
  status: "Diposting" | "Dibatalkan";
  /** Set on a reversal, pointing at the entry it cancels. */
  reversalDari?: ID;
  dibuatOleh: string;
  dibuatPada: string;
}

export type ReceiptStatus = "Menunggu Review" | "Tervalidasi" | "Ditolak";

/**
 * One item read off a scanned receipt.
 *
 * `productId` is nullable on purpose. A scan reads text, not identifiers, and
 * "LPG 3KG SUBS." may match nothing in the catalogue — the same honest
 * unmatched state `outletId` and `bank` already carry. Forcing every line
 * onto a default product would silently bill the wrong item at the wrong price,
 * which is precisely the failure a review step exists to prevent.
 *
 * `namaTerbaca` keeps the raw text so the reviewer can see what the matcher was
 * working from, rather than only its conclusion.
 *
 * Mirrors ocr.receipt_items in the Go schema.
 */
export interface ReceiptLine {
  productId: ID | null;
  namaTerbaca: string;
  jumlah: number;
  /** As printed on the paper — what the customer was actually charged. */
  hargaSatuan: number;
}

export interface ReceiptEntity extends Scoped {
  id: ID;
  namaBerkas: string;
  outletId: ID | null;
  nomorKwitansi: string;
  tanggalKwitansi: string;
  lines: ReceiptLine[];
  /** Derived from `lines`. Named for units, not cylinders — a receipt may
   *  itemise anything the agency sells. */
  jumlahUnit: number;
  /**
   * The total the document states, read separately from the items.
   *
   * Deliberately not derived: OCR reads the printed total and the line items as
   * two independent facts, and a disagreement between them is the strongest
   * signal that the scan is wrong. Computing one from the other would destroy
   * the check.
   */
  nominal: number;
  bank: BankNameEntity | null;
  keyakinan: number; // OCR confidence 0..1
  status: ReceiptStatus;
  diunggahPada: string;
  ditinjauOleh?: string;
  ditinjauPada?: string;
  paymentId?: ID;
}

export type NotificationTypeEntity = "Pengingat" | "Alert" | "Sistem";

export interface NotificationEntity {
  id: ID;
  type: NotificationTypeEntity;
  title: string;
  message: string;
  createdAt: string; // ISO datetime
  isRead: boolean;
  /** Where the "Buka" action should navigate. */
  href?: string;
  /** The reminder rule that produced this, when one did. */
  rule?: ReminderRuleKey;
}

export interface AuditEntry {
  id: ID;
  at: string; // ISO datetime
  actor: string;
  action: string;
  entity: string;
  entityId: ID;
  summary: string;
}

export type UserStatusEntity = "Aktif" | "Nonaktif" | "Diundang";

export interface UserEntity {
  id: ID;
  nama: string;
  email: string;
  role: "admin" | "manager" | "finance" | "staff" | "viewer" | "driver";
  /** Stable backend role codes used by access filters. */
  roleCodes?: string[];
  /** Tenant-owned role names shown verbatim. */
  roleNames?: string[];
  telepon: string;
  /**
   * The fleet record this account drives, for `driver` accounts.
   *
   * A console user and a truck are different things — a dispatcher covering a
   * route is still not the driver — so the link is explicit rather than matched
   * on name. Without it a sopir signs in and the console cannot tell whose run
   * to show.
   */
  driverId?: ID;
  cabang: string;
  /** Empty = tenant-wide. One entry = a single-branch user. */
  branchIds: ID[];
  scopeType: ScopeType;
  status: UserStatusEntity;
  terakhirMasuk?: string;
  dibuatPada: string;
}

export interface ProductEntity {
  id: ID;
  kode: string;
  nama: string;
  ukuran: string;
  /**
   * The counting noun for one unit: tabung, botol, dus, sak.
   *
   * The single concession to businesses other than LPG at this stage. Kept on
   * the product rather than in a global setting because a catalogue can mix
   * them, and deliberately not built out further until a real second business
   * says what else needs to vary.
   */
  satuan: string;
  /** Whether the customer hands back an empty in exchange for a full one. */
  returnable: boolean;
  hargaJual: number;
  hargaBeli: number;
  stok: number;
  stokMinimum: number;
  aktif: boolean;
}

export type OrderStatus =
  | "Baru"
  | "Disetujui"
  | "Dijadwalkan"
  | "Selesai"
  | "Ditolak";

/** An order placed by a outlet. Approved orders feed distribution planning. */
export interface OrderEntity extends Scoped {
  id: ID;
  kode: string;
  outletId: ID;
  lines: OrderLine[];
  /** Derived: total units across `lines`. */
  jumlahUnit: number;
  tanggalMasuk: string; // ISO datetime
  tanggalDiminta: string; // ISO date
  status: OrderStatus;
  planId?: ID;
  catatan?: string;
  diprosesOleh?: string;
  diprosesPada?: string;
}

/* ── system configuration ──────────────────────────────────────────────── */

/** A supply source the agency draws quota from. Referenced by Schedule Agreements. */
export interface SupplierEntity {
  id: ID;
  kode: string;
  nama: string;
  alamat: string;
  penanggungJawab: string;
  telepon: string;
  aktif: boolean;
}

/** An account outlets transfer into. Finance reconciles against these. */
export interface BankAccountEntity {
  id: ID;
  bank: BankNameEntity;
  nomorRekening: string;
  atasNama: string;
  cabang: string;
  /** The account printed on invoices by default. */
  utama: boolean;
  aktif: boolean;
}

/** Document prefixes. Visible on every table row and printout. */
export interface NumberingEntity {
  suratJalan: string;
  invoice: string;
  rencana: string;
  pesanan: string;
  /** Whether the running number is scoped per day, e.g. SJ-20260804-01. */
  sertakanTanggal: boolean;
}

export interface OperationsEntity {
  /**
   * Whether the console records where the sopir was when they filed a drop.
   *
   * A switch rather than an assumption: this is location data about employees,
   * and whether to collect it is the agency's decision to make and to be able
   * to answer for.
   */
  rekamLokasi: boolean;
  /**
   * How close to the outlet a submission has to be to count as "at the drop".
   *
   * Mirrors geofence_rules.radius_meter — per-outlet radii belong there
   * eventually; this is the agency-wide default.
   */
  radiusGeofenceMeter: number;
  /** Days the agency dispatches, 0 = Sunday. */
  hariKerja: number[];
  /** Minutes budgeted per stop — drives the width of a block on the rail. */
  durasiSinggahMenit: number;
  /** How many days ahead a plan may be created. */
  leadTimeHari: number;
}

/* ── notification rules ────────────────────────────────────────────────── */

export type ReminderRuleKey =
  | "saExpiry"
  | "quotaLow"
  | "stockLow"
  | "paymentPending"
  | "deliveryDelay"
  | "planUnconfirmed"
  | "orderPending";

export type NotifChannel = "app" | "whatsapp" | "email";

export interface ReminderRule {
  aktif: boolean;
  /** Threshold; the unit differs per rule and is stated in the UI. */
  ambang: number;
  /** Roles that receive it. */
  penerima: UserEntity["role"][];
  kanal: NotifChannel[];
}

export interface WhatsappSettings {
  aktif: boolean;
  nomorPengirim: string;
  templatePengingat: string;
}

export interface NotificationSettings {
  rules: Record<ReminderRuleKey, ReminderRule>;
  whatsapp: WhatsappSettings;
  email: { aktif: boolean; pengirim: string };
}

/**
 * What this tenant calls the three things every screen has to name.
 *
 * The console's own words are role names — outlet, supplier, unit — because
 * the roles are what generalise across verticals. The nouns on screen are the
 * tenant's: an LPG agency reads pangkalan / SPBE / tabung, a water depot reads
 * depot / pabrik / galon. Read through `lib/lexicon`, never inlined.
 *
 * `satuan` also replaced a global `hargaPerTabung`, which priced every product
 * in the catalogue identically and stopped meaning anything once invoices
 * carried lines. Prices belong on products; only the noun is agency-wide.
 */
export interface LexiconEntity {
  /** One unit of the thing moved: tabung, galon, dus, sak. */
  satuan: string;
  /** A delivery destination: pangkalan, depot, toko, gerai. */
  outlet: string;
  /** A supply source drawn against: SPBE, pabrik, distributor pusat. */
  pemasok: string;
}

export interface SettingsEntity {
  /** Absent inherits; only the effective manual policy permits order intake. */
  orderIntakeMode?: "manual" | "external_schedule";
  namaPerusahaan: string;
  nomorAgen: string;
  alamat: string;
  telepon: string;
  email: string;

  /* ── legal identity ──────────────────────────────────────────────────────
   * Never inherited. A sub-tenant that is its own PT has its own tax identity,
   * and falling back to its parent's would put the wrong one on an invoice —
   * which is not a valid tax document. Mirrors iam.tenant_profiles.
   */

  /** As registered, for documents. `namaPerusahaan` is the trading name. */
  namaLegal: string;
  /** NIB / SIUP. */
  nomorRegistrasi: string;
  /**
   * Tax identification number, as it appears on a faktur pajak.
   *
   * Encrypted at rest in the backend (`npwp_encrypted`), like every other piece
   * of personal or fiscal identity in this schema.
   */
  npwp: string;
  /**
   * Registered for VAT.
   *
   * Not cosmetic: an invoice from a non-PKP entity must not carry PPN at all,
   * so this decides whether `tarifPajakDefault` may be non-zero.
   */
  pkp: boolean;
  tarifPajakDefault: number;

  /**
   * The registered OFFICE.
   *
   * Not the distribution origin — branches carry that, and a multi-branch PT has
   * several. Here to render the tenant on a map and to seed a branch that
   * arrives without coordinates.
   */
  kantorLat?: number;
  kantorLng?: number;
  zonaWaktu: string;
  jamOperasionalMulai: string;
  jamOperasionalSelesai: string;
  /** The tenant's own vocabulary. See `LexiconEntity`. */
  istilah: LexiconEntity;
  targetHarian: number;
  notifikasi: NotificationSettings;
  penomoran: NumberingEntity;
  operasi: OperationsEntity;
  tema: "terang" | "gelap" | "sistem";
}

/**
 * One tenant's own settings, with the fields it has chosen to set.
 *
 * `Partial`, and that is the whole design: a field absent here means "not set
 * for this tenant, ask its parent". It mirrors iam.tenant_settings, where every
 * column is nullable and NULL means inherit — so a subsidiary that renames only
 * its lexicon still follows its group's working week.
 *
 * Flattening this to a full SettingsEntity per tenant would lose the
 * distinction, and saving the resolved values back would silently turn every
 * inherited value into an override the parent could never change again.
 */
export interface TenantSettingsEntity {
  tenantId: ID;
  values: Partial<SettingsEntity>;
}

/**
 * Where a settings field came from, for one tenant.
 *
 * Mirrors the backend's GET /tenants/:id/settings, which returns the same three
 * parts for the same reason: a form that only had the effective values would
 * save them back and turn every inherited value into an override.
 */
export interface ResolvedSettingsEntity {
  /** What this tenant has set for itself. Absent field = inherited. */
  own: Partial<SettingsEntity>;
  /** What actually applies, after inheritance. Always complete. */
  effective: SettingsEntity;
  /**
   * The tenant each inherited field came from, keyed by field name. A field
   * absent from this map was either set here or is unset everywhere.
   */
  inheritedFrom: Partial<Record<keyof SettingsEntity, TenantEntity>>;
}

export interface Database {
  version: number;
  seededAt: string;
  /**
   * Every tenant in the tree, not one.
   *
   * Was `tenant: TenantEntity` while tenancy was flat and fixed by the session.
   * The console now switches between them, so the store has to hold the shape
   * the switcher renders.
   */
  tenants: TenantEntity[];
  branches: BranchEntity[];
  outlets: OutletEntity[];
  drivers: DriverEntity[];
  vehicles: VehicleEntity[];
  geofenceRules: GeofenceRuleEntity[];
  geofenceAlerts: GeofenceAlertEntity[];
  scheduleAgreements: SAEntity[];
  /** Daily obligations under an agreement. Follow their SA, like plan rows. */
  saDailyTargets: SADailyTargetEntity[];
  /** Uploads awaiting a decision, and the applied ones they became. */
  saImportBatches: SAImportBatchEntity[];
  sim3lonSourceSnapshots: SIM3LONSourceSnapshotEntity[];
  sim3lonPlanSources: SIM3LONPlanSourceEntity[];
  plans: PlanEntity[];
  planRows: PlanRowEntity[];
  deliveries: DeliveryEntity[];
  deliveryEvents: DeliveryEventEntity[];
  transportationClaims: TransportationClaimEntity[];
  outletWarnings: OutletWarningEntity[];
  payments: PaymentEntity[];
  receipts: ReceiptEntity[];
  notifications: NotificationEntity[];
  audit: AuditEntry[];
  users: UserEntity[];
  products: ProductEntity[];
  orders: OrderEntity[];
  suppliers: SupplierEntity[];
  bankAccounts: BankAccountEntity[];
  accounts: AccountEntity[];
  journals: JournalEntity[];
  invoices: InvoiceEntity[];
  creditNotes: CreditNoteEntity[];
  /**
   * The acting tenant's settings, already resolved up the tree.
   *
   * Kept as a plain SettingsEntity because a dozen readers across the console
   * want the effective value and nothing else — a print header wants the agency
   * name, not the question of who set it. `getDb()` resolves it from
   * `settingsByTenant` on every read.
   */
  settings: SettingsEntity;
  /** Per-tenant overrides. The stored truth; `settings` above is derived. */
  settingsByTenant: TenantSettingsEntity[];
}
