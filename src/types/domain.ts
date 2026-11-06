/**
 * Shared domain shapes: the entities more than one feature's adapter maps the
 * API onto, in the console's Indonesian vocabulary.
 *
 * Each feature's `api/<f>Api.http.ts` owns its wire types and maps them here
 * or into its own view types (`src/features/<f>/types.ts`). A shape only one
 * feature uses belongs in that feature, not here.
 */

export type ID = string;

export type { GeoStamp } from "@/lib/geo";

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
  /** Billing details for the pangkalan as a customer (accounting parity P3):
   *  printed on its invoices and statements. */
  provinsi?: string;
  kodePos?: string;
  npwp?: string;
  email?: string;
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
   * per tenant — it is what a dispatcher writes on paper and reads back.
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

/**
 * A priced line on an invoice.
 *
 * Name, unit and price are snapshotted rather than joined: an invoice must
 * reprint identically years later, after the product has been renamed and
 * repriced. Reading them live from the catalogue would silently rewrite issued
 * documents.
 */
export interface InvoiceLine {
  /**
   * Null for a product-less manual line (financial-statements plan P5 /
   * gap-closing plan Phase C) -- a registration fee line or a free-form
   * "other" charge, neither of which names a catalogue product. `nama`
   * carries the line's own description either way, mirroring the real
   * backend's Line.ProductID/Description split.
   */
  productId: ID | null;
  nama: string;
  satuan: string;
  jumlah: number;
  hargaSatuan: number;
  subtotal: number;
}

export type DeliveryStatus = "Antrian" | "Proses" | "Selesai" | "Tertunda";

/* ── transportation claims ─────────────────────────────────────────────── */

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
  /** Tax Pertamina deducted before paying; with settledAmount it settles the claim. */
  taxWithheld?: number;
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
  /**
   * "registration"/"other" (financial-statements plan P5 / gap-closing
   * plan Phase C) raise an invoice by hand, with no delivery behind it --
   * deliveryId is null for both. Mirrors the real backend's own
   * InvoiceResponse.InvoiceType verbatim.
   */
  invoiceType: "delivery" | "registration" | "other";
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

export type CreditNoteStatus = "Terbit" | "Terpakai" | "Batal";

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
  | "pajakJasaGiro"
  // Backend accounts (tenantprovisioning/chart.go 1-1250/4-2000) the
  // financial-statements layouts read.
  | "piutangTransportFee"
  | "pendapatanTransportFee"
  | "bebanBahanBakar"
  | "bebanTol"
  | "bebanPemeliharaan"
  | "bebanOperasionalLainnya"
  // The backend's "payable" role (tenantprovisioning/chart.go, 2-1000 Utang
  // Usaha): a general purchase's credit side.
  | "hutangUsaha";

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
  /**
   * A control account, or under one: receivable, payable, inventory, cash,
   * bank... -- moved only by its own module. The backend refuses it on a
   * voucher or bill line; pickers hide it. Set by getChartOfAccounts.
   */
  kontrol?: boolean;
  aktif: boolean;
}

export type JournalSourceType =
  | "invoice"
  | "payment"
  | "creditNote"
  | "delivery"
  | "manual"
  // Mirrors fin.journals.source_type: the inventory-purchases cross-check
  // tells a purchase journal apart from a hand-entered one.
  | "purchase"
  // Kas & Bank vouchers (financial-statements plan's gap-closing phase,
  // Phase B) -- mirrors the backend's "cash_voucher" source_type.
  | "cashVoucher"
  // Monthly depreciation/amortisation runs (gap-closing plan, Phase D) --
  // mirrors the backend's "depreciation" source_type.
  | "depreciation"
  // Fiscal-year close/reopen and the one-time opening-balance commit
  // (gap-closing plan, Phase E) -- mirror the backend's "closing" and
  // "opening_balance" source_types. Both are the two source_types
  // ReverseJournalRequest itself names as reversible, alongside "manual".
  | "closing"
  | "openingBalance"
  // The rest of the backend's CHECK: expense and transport-fee claim
  // postings, and the SIM3LON cutover's opening revenue. Mapped to "manual"
  // until the ledger showed each journal's source (accounting parity P2).
  | "expense"
  | "transportationClaim"
  | "sim3lonOpening"
  // One instalment paid on a vendor bill (accounting parity P3).
  | "purchasePayment"
  // A fixed asset's purchase ("dikreditkan dari") and its sale or write-off
  // (accounting parity P3).
  | "assetAcquisition"
  | "assetDisposal"
  // The refund of an overpaid receipt (client answer 5); links to the receipt.
  | "paymentRefund";

export type ReceiptStatus = "Menunggu Diperiksa" | "Tervalidasi" | "Ditolak";

export interface AuditEntry {
  id: ID;
  at: string; // ISO datetime
  actor: string;
  action: string;
  entity: string;
  entityId: ID;
  summary: string;
}

export type UserStatusEntity = "Aktif" | "Nonaktif";

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
  /** Category code from the tenant's business type (GET /products/categories). */
  kategori?: string;
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
  /**
   * Separates a weighed LPG commodity from a kit accessory (financial-
   * statements plan P3.3) -- an accessory has no weight of its own and is
   * what a registration invoice's kit items pick from. Read-only in this
   * build: no product form writes it yet (that is the gap-closing plan's
   * own Phase F) -- Phase C's "Buat tagihan" kit-item picker is this
   * field's only consumer today.
   */
  /**
   * Gap-closing plan, Phase F: now writable at create (immutable after --
   * mirrors the backend's own UpdateProductRequest carrying no ProductKind
   * field at all).
   */
  /** "container" is an empty cylinder: counted by quantity only, never
   *  bought or sold (client answer 2). */
  productKind: "commodity" | "accessory" | "container";
  /** The measurement unit (core.units): tabung, kg, pcs... -- what `satuan`
   *  reads from. Accounting parity P3. */
  unitId?: string;
  deskripsi?: string;
  merek?: string;
  barcode?: string;
  /**
   * Overrides the tenant's own inventory/revenue/cogs role account for this
   * product specifically (financial-statements plan P3.3) -- absent means
   * "use the role". Stored as the
   * account's own code, not id, matching the real backend's response shape
   * (ProductResponse carries `*_account_code`, never an id) -- the HTTP
   * adapter resolves code to id only at the create/update boundary.
   */
  inventoryAccountCode?: string;
  revenueAccountCode?: string;
  cogsAccountCode?: string;
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
  /**
   * Which ledger sub-account this account posts to: "bank" under 1-1100
   * (receiving accounts), "cash" under 1-1000 (petty cash, a till with no
   * bank of its own). Immutable after creation -- backend's own
   * BankAccountResponse.Kind. Kas & Bank console (gap-closing phase, Phase
   * B) is the first feature that needs a "cash" one to exist at all; every
   * account created before this field existed is "bank".
   */
  kind: "bank" | "cash";
  /** The fin.accounts leaf this account posts to -- read-only, set by the
   *  backend at creation. */
  ledgerAccountCode: string;
}

/* ── Kas & Bank (financial-statements plan's gap-closing phase, Phase B) ─ */

export type CashVoucherType = "receipt" | "disbursement" | "transfer";
export type CashVoucherStatus = "draft" | "posted" | "void";

export type BankStatementLineStatus = "unmatched" | "matched" | "posted" | "ignored";

/* ── asset register & depreciation runs (gap-closing plan, Phase D) ─────── */

export type AssetClass = "building" | "vehicle" | "office_equipment" | "intangible" | "prepaid";
export type AssetStatus = "active" | "fully_depreciated" | "disposed";

export type DepreciationRunStatus = "posted" | "void";

/* ── fiscal years & opening balance (gap-closing plan, Phase E) ─────────── */

export type FiscalYearStatus = "open" | "closed";

/* ── sub-ledger admin (gap-closing plan, Phase F) ────────────────────────── */

/** A local vendor a general purchase (no Schedule Agreement behind it) pays
 *  -- mirrors supplier.SupplierResponse. Deliberately NOT the same concept
 *  SupplierEntity/SupplierSection names: that one is a free-text name off
 *  `core.schedule_agreements.supplier_name`, read through the tenant's own
 *  configurable "Pemasok" lexicon term (SPBE/distributor) with no real
 *  master table behind it at all. This is a real `core.suppliers` row, for
 *  Pembelian Umum only -- the two share no row even when they happen to
 *  read the same word in Indonesian. */
export interface VendorEntity extends Scoped {
  id: ID;
  code: string;
  name: string;
  npwp?: string;
  address?: string;
  phone?: string;
  status: "atv" | "ina";
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type PurchasePaymentStatus = "unpaid" | "paid";

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

/** A channel a reminder is sent over besides the inbox, which it always reaches. */
export type OutsideChannel = Exclude<NotifChannel, "app">;

export interface ReminderRule {
  aktif: boolean;
  /** Threshold; the unit differs per rule and is stated in the UI. */
  ambang: number;
  /**
   * Role codes that narrow who receives it. Empty is everyone already allowed
   * to see what the reminder is about; a role never widens that.
   */
  penerima: string[];
  /** Outside channels it is also sent over. */
  kanal: OutsideChannel[];
}

export interface WhatsappSettings {
  aktif: boolean;
  nomorPengirim: string;
  templatePengingat: string;
  /** The installation can send WhatsApp at all; off until a provider is chosen. */
  tersedia: boolean;
}

export interface NotificationSettings {
  rules: Record<ReminderRuleKey, ReminderRule>;
  whatsapp: WhatsappSettings;
  /** `pengirim` is the display name on the installation's own address. */
  email: { aktif: boolean; pengirim: string; tersedia: boolean };
  /** The versions read, sent back so a concurrent save is refused, not overwritten. */
  versi: { aturan: number; kanal: number };
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
  /** Who signs the tenant's outgoing paperwork; the BA LO prints both. */
  penandatanganNama?: string;
  penandatanganJabatan?: string;
  /**
   * The profile version this copy was read at. Saving sends it back, so a save
   * over someone else's edit is refused (409 STALE_VERSION) instead of
   * silently undoing it.
   */
  profilVersi?: number;
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
