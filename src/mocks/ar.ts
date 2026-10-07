/**
 * Accounts receivable.
 *
 * Invoices record what is owed; receipts record cash and are *allocated* to
 * invoices. Keeping the two apart is what allows one transfer to settle several
 * invoices and one invoice to be settled over time — the thing the previous
 * single-record model could not express.
 *
 * Every state change here posts a journal, so the AR sub-ledger and the general
 * ledger cannot drift apart.
 */

import { ApiError, nextId, recordAudit } from "./db";
import { getActiveScope } from "./scope";
import { accountByRole, postJournal } from "./ledger";
import { isoDate, startOfToday } from "./seed";
import {
  blendedUnitPrice,
  costOfGoods,
  priceLines,
  sumRealisasi,
} from "./lines";
import type {
  CreditNoteEntity,
  Database,
  ID,
  InvoiceEntity,
  PaymentEntity,
} from "./types";
import { outletLabel } from "@/lib/lexicon";

const round = (n: number) => Math.round(n * 100) / 100;

/** A receivable belongs to the branch that serves the outlet. */
function scopeFromOutlet(db: Database, outletId: ID) {
  const pkl = db.outlets.find((p) => p.id === outletId);
  return {
    // Falls back to the ACTING tenant, not to "the" tenant: with a hierarchy there
  // is no single one, and stamping a row with the root's id while acting as a
  // subsidiary is a cross-tenant write the backend's WITH CHECK would refuse.
  tenantId: pkl?.tenantId ?? getActiveScope().actingTenantId,
    branchId: pkl?.branchId ?? db.branches[0]?.id ?? "",
  };
}
const fmt = (n: number) => n.toLocaleString("id-ID");

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function docNo(db: Database, prefix: string, tanggal: string, seq: number, pad = 3) {
  const parts = [prefix];
  if (db.settings.penomoran.sertakanTanggal) parts.push(tanggal.replace(/-/g, ""));
  parts.push(String(seq).padStart(pad, "0"));
  return parts.join("-");
}

/** Outstanding on an invoice after payments and credit notes. */
export function invoiceSisa(inv: InvoiceEntity): number {
  return round(inv.total - inv.terbayar - inv.kredit);
}

/**
 * Recomputes what an invoice has been paid, counting only *verified* receipts.
 *
 * Unverified cash must not reduce the receivable, otherwise the AR sub-ledger
 * drifts from the control account in the general ledger — the two are supposed
 * to reconcile to the rupiah.
 */
export function recomputeInvoicePaid(db: Database, invoiceId: ID) {
  const inv = db.invoices.find((i) => i.id === invoiceId);
  if (!inv) return;
  inv.terbayar = round(
    db.payments
      .filter((p) => p.status === "Terverifikasi")
      .flatMap((p) => p.alokasi)
      .filter((a) => a.invoiceId === invoiceId)
      .reduce((s, a) => s + a.jumlah, 0),
  );
  refreshInvoiceStatus(inv);
}

/** Recomputes status from the figures, so it can never contradict them. */
export function refreshInvoiceStatus(inv: InvoiceEntity, today = isoDate(startOfToday())) {
  if (inv.status === "Batal") return;
  const sisa = invoiceSisa(inv);
  if (sisa <= 0) inv.status = "Lunas";
  else if (inv.jatuhTempo < today) inv.status = "Jatuh Tempo";
  else if (inv.terbayar > 0 || inv.kredit > 0) inv.status = "Sebagian";
  else inv.status = "Terbit";
}

/* ── exposure & credit control ─────────────────────────────────────────── */

export interface Exposure {
  /** Everything not yet settled. */
  outstanding: number;
  /** The part already past its due date. */
  jatuhTempo: number;
  batasKredit: number;
  /** Headroom left; negative means over the limit. */
  sisaPlafon: number;
  terblokir: boolean;
  alasan?: string;
}

export function outletExposure(db: Database, outletId: ID): Exposure {
  const today = isoDate(startOfToday());
  const pkl = db.outlets.find((p) => p.id === outletId);
  const open = db.invoices.filter(
    (i) => i.outletId === outletId && i.status !== "Batal" && invoiceSisa(i) > 0,
  );

  const outstanding = round(open.reduce((s, i) => s + invoiceSisa(i), 0));
  const jatuhTempo = round(
    open.filter((i) => i.jatuhTempo < today).reduce((s, i) => s + invoiceSisa(i), 0),
  );
  const batasKredit = pkl?.batasKredit ?? 0;
  const sisaPlafon = batasKredit === 0 ? Infinity : round(batasKredit - outstanding);

  let terblokir = false;
  let alasan: string | undefined;
  if (pkl?.blokirOtomatis) {
    if (jatuhTempo > 0) {
      terblokir = true;
      alasan = `Tunggakan jatuh tempo Rp ${fmt(jatuhTempo)}.`;
    } else if (batasKredit > 0 && outstanding > batasKredit) {
      terblokir = true;
      alasan = `Piutang Rp ${fmt(outstanding)} melebihi plafon Rp ${fmt(batasKredit)}.`;
    }
  }

  return { outstanding, jatuhTempo, batasKredit, sisaPlafon, terblokir, alasan };
}

/** Standard ageing buckets, measured from the due date. */
export function agingBucket(inv: InvoiceEntity, today = isoDate(startOfToday())) {
  if (inv.jatuhTempo >= today) return "Belum jatuh tempo" as const;
  const days = Math.floor(
    (new Date(today).getTime() - new Date(inv.jatuhTempo).getTime()) / 86_400_000,
  );
  if (days <= 30) return "1–30 hari" as const;
  if (days <= 60) return "31–60 hari" as const;
  if (days <= 90) return "61–90 hari" as const;
  return "> 90 hari" as const;
}

export const AGING_BUCKETS = [
  "Belum jatuh tempo",
  "1–30 hari",
  "31–60 hari",
  "61–90 hari",
  "> 90 hari",
] as const;

/* ── invoicing ─────────────────────────────────────────────────────────── */

/**
 * Raises the invoice for a completed delivery and posts it.
 *
 * Dr Piutang Usaha / Cr Penjualan, plus Dr HPP / Cr Persediaan so gross margin
 * is real rather than assumed.
 */
export function issueInvoiceForDelivery(
  db: Database,
  deliveryId: ID,
  aktor: string,
): InvoiceEntity | null {
  if (db.invoices.some((i) => i.deliveryId === deliveryId)) return null;

  const d = db.deliveries.find((x) => x.id === deliveryId);
  if (!d) throw new ApiError("Surat jalan tidak ditemukan.", 404);

  const pkl = db.outlets.find((p) => p.id === d.outletId);
  // Priced per product from the catalogue. The global `hargaPerTabung` this
  // used to read applied one price to every line in the book — a 50 kg
  // cylinder was billed at the 3 kg rate.
  const lines = priceLines(
    db.products,
    d.lines.map((l) => ({ productId: l.productId, jumlah: l.realisasi })),
  );
  const subtotal = round(lines.reduce((s, l) => s + l.subtotal, 0));
  const termin = pkl?.termin ?? 0;

  const seq = db.invoices.length + 1;
  const inv: InvoiceEntity = {
    // Inherit the delivery's branch rather than the active one: an invoice
    // belongs where the goods went.
    tenantId: d.tenantId,
    branchId: d.branchId,
    id: nextId("inv"),
    nomor: docNo(db, db.settings.penomoran.invoice, d.tanggal, seq),
    outletId: d.outletId,
    deliveryId: d.id,
    invoiceType: "delivery",
    tanggal: d.tanggal,
    jatuhTempo: addDaysIso(d.tanggal, termin),
    lines,
    jumlahUnit: sumRealisasi(d.lines),
    hargaSatuan: blendedUnitPrice(lines),
    subtotal,
    pajak: 0,
    total: subtotal,
    terbayar: 0,
    kredit: 0,
    status: "Terbit",
    catatan: `Tagihan otomatis dari ${d.kode}.`,
    dibuatOleh: aktor,
  };
  refreshInvoiceStatus(inv);
  db.invoices.unshift(inv);

  // Cost of goods per line, from each product's own purchase price.
  const hpp = costOfGoods(db.products, d.lines);

  postJournal(db, {
    scope: { tenantId: inv.tenantId, branchId: inv.branchId },
    tanggal: inv.tanggal,
    keterangan: `${inv.nomor} — penjualan ke ${pkl?.nama ?? "${outletLabel()}"}`,
    sumber: { tipe: "invoice", id: inv.id },
    aktor,
    lines: [
      { akunId: accountByRole(db, "piutang").id, debit: inv.total, kredit: 0 },
      { akunId: accountByRole(db, "pendapatan").id, debit: 0, kredit: inv.subtotal },
      ...(inv.pajak > 0
        ? [{ akunId: accountByRole(db, "ppnKeluaran").id, debit: 0, kredit: inv.pajak }]
        : []),
      ...(hpp > 0
        ? [
            { akunId: accountByRole(db, "hpp").id, debit: hpp, kredit: 0 },
            { akunId: accountByRole(db, "persediaan").id, debit: 0, kredit: hpp },
          ]
        : []),
    ],
  });

  return inv;
}

/** One kit item on a registration invoice's create payload. */
export interface ManualInvoiceKitItemInput {
  productId: ID;
  qty: number;
}

/** One line of an "other" invoice's create payload. */
export interface ManualInvoiceLineInput {
  description: string;
  amount: number;
  revenueAccountId: ID;
}

/** Create payload for raiseManualInvoice -- mirrors the real backend's
 *  CreateManualInvoiceRequest. No branchId override: neither this mock nor
 *  the console's own dialog offers one yet, the same "every read is
 *  tenant-wide" gap financialstatements' own DATA_SOURCES.md row names. */
export interface CreateManualInvoiceInput {
  invoiceType: "registration" | "other";
  outletId: ID;
  issueDate: string;
  dueDate?: string;
  description?: string;
  packageId?: ID;
  feeAmount?: number;
  kitItems?: ManualInvoiceKitItemInput[];
  lines?: ManualInvoiceLineInput[];
}

/**
 * Raises a "registration" or "other" invoice by hand -- a Pendaftaran
 * Pangkalan package fee plus kit items, or a free-form charge against
 * whatever revenue account each line names (financial-statements plan P5
 * / gap-closing plan Phase C). Mirrors issueInvoiceForDelivery's own
 * create-then-post shape; the two creation paths never share a function
 * because nothing else about them overlaps -- one prices from a
 * delivery's realized lines, this one prices from what the caller typed.
 *
 * `pajak` is always 0, the same simplification issueInvoiceForDelivery's
 * own comment on InvoiceEntity.pajak already documents -- PPN is not
 * modelled anywhere in this mock yet.
 */
export function raiseManualInvoice(
  db: Database,
  input: CreateManualInvoiceInput,
  aktor: string,
): InvoiceEntity {
  const outlet = db.outlets.find((o) => o.id === input.outletId);
  if (!outlet) throw new ApiError("Outlet tidak ditemukan.", 400);
  const scope = scopeFromOutlet(db, input.outletId);
  const dueDate = input.dueDate ?? addDaysIso(input.issueDate, outlet.termin ?? 0);

  let lines: InvoiceEntity["lines"];
  let subtotal: number;
  let totalQty = 0;
  let journalLines: { akunId: ID; debit: number; kredit: number }[];

  if (input.invoiceType === "registration") {
    let feeAmount = input.feeAmount;
    let kitSpecs = input.kitItems;
    if (input.packageId) {
      const pkg = db.registrationPackages.find((p) => p.id === input.packageId);
      if (!pkg) throw new ApiError("Paket pendaftaran tidak ditemukan.", 400);
      if (feeAmount === undefined) feeAmount = pkg.feeAmount;
      if (kitSpecs === undefined) {
        kitSpecs = pkg.items.map((i) => ({ productId: i.productId, qty: i.qty }));
      }
    }
    if (!feeAmount || feeAmount <= 0) {
      throw new ApiError("Pendaftaran memerlukan nilai pendaftaran atau paket.", 422);
    }

    const resolvedKit = (kitSpecs ?? []).map((k) => {
      const product = db.products.find((p) => p.id === k.productId);
      if (!product) throw new ApiError("Produk kit tidak ditemukan.", 400);
      if (product.productKind !== "accessory") {
        throw new ApiError(`"${product.nama}" bukan produk aksesori/perlengkapan.`, 422);
      }
      return { product, qty: k.qty };
    });
    totalQty = resolvedKit.reduce((s, k) => s + k.qty, 0);

    lines = [
      {
        productId: null, nama: "Pendaftaran Pangkalan", satuan: "paket",
        jumlah: 1, hargaSatuan: feeAmount, subtotal: feeAmount,
      },
      // Zero-price record lines -- the kit is included in the fee above,
      // not a second revenue source (mirrors the real backend's own
      // KitItemRequest doc).
      ...resolvedKit.map((k) => ({
        productId: k.product.id, nama: k.product.nama, satuan: k.product.satuan,
        jumlah: k.qty, hargaSatuan: 0, subtotal: 0,
      })),
    ];
    subtotal = feeAmount;
    journalLines = [
      { akunId: accountByRole(db, "piutangPendaftaran").id, debit: subtotal, kredit: 0 },
      { akunId: accountByRole(db, "pendapatanPendaftaran").id, debit: 0, kredit: subtotal },
    ];
    // COGS per kit item, from each product's own purchase price -- posted
    // to the generic hpp/persediaan roles rather than a per-product
    // override, unlike the real backend's own inventory_account_id
    // override (seeds/06-outlets/seeder.go): that per-kind sub-ledger
    // split is Phase F's own job, not modelled here.
    for (const k of resolvedKit) {
      const cogsAmount = round(k.product.hargaBeli * k.qty);
      if (cogsAmount > 0) {
        journalLines.push({ akunId: accountByRole(db, "hpp").id, debit: cogsAmount, kredit: 0 });
        journalLines.push({ akunId: accountByRole(db, "persediaan").id, debit: 0, kredit: cogsAmount });
      }
    }
  } else {
    if (!input.lines || input.lines.length === 0) {
      throw new ApiError("Tagihan lain-lain memerlukan minimal satu baris.", 422);
    }
    const resolved = input.lines.map((l) => {
      const account = db.accounts.find((a) => a.id === l.revenueAccountId);
      if (!account) throw new ApiError("Akun pendapatan pada salah satu baris tidak ditemukan.", 400);
      if (account.tipe !== "Pendapatan") {
        throw new ApiError("Akun pada baris harus akun pendapatan.", 422);
      }
      if (l.amount <= 0) throw new ApiError("Nilai baris harus lebih dari nol.", 422);
      return { description: l.description, amount: l.amount, accountId: account.id };
    });
    lines = resolved.map((r) => ({
      productId: null, nama: r.description, satuan: "—",
      jumlah: 1, hargaSatuan: r.amount, subtotal: r.amount,
    }));
    subtotal = round(resolved.reduce((s, r) => s + r.amount, 0));
    journalLines = [
      { akunId: accountByRole(db, "piutang").id, debit: subtotal, kredit: 0 },
      ...resolved.map((r) => ({ akunId: r.accountId, debit: 0, kredit: r.amount })),
    ];
  }

  const seq = db.invoices.length + 1;
  const inv: InvoiceEntity = {
    ...scope,
    id: nextId("inv"),
    nomor: docNo(db, db.settings.penomoran.invoice, input.issueDate, seq),
    outletId: outlet.id,
    deliveryId: null,
    invoiceType: input.invoiceType,
    tanggal: input.issueDate,
    jatuhTempo: dueDate,
    lines,
    jumlahUnit: totalQty,
    hargaSatuan: blendedUnitPrice(lines),
    subtotal,
    pajak: 0,
    total: subtotal,
    terbayar: 0,
    kredit: 0,
    status: "Terbit",
    catatan: input.description,
    dibuatOleh: aktor,
  };
  refreshInvoiceStatus(inv);
  db.invoices.unshift(inv);

  postJournal(db, {
    scope: { tenantId: inv.tenantId, branchId: inv.branchId },
    tanggal: inv.tanggal,
    keterangan: `${inv.nomor} — ${input.invoiceType === "registration" ? "Pendaftaran Pangkalan" : "Tagihan lain-lain"} ${outlet.nama}`,
    sumber: { tipe: "invoice", id: inv.id },
    aktor,
    lines: journalLines,
  });

  return inv;
}

/* ── cash receipts ─────────────────────────────────────────────────────── */

/** Unapplied cash still sitting on a receipt. */
export function unallocated(p: PaymentEntity): number {
  return round(p.jumlah - p.alokasi.reduce((s, a) => s + a.jumlah, 0));
}

export function recordPayment(
  db: Database,
  input: {
    outletId: ID;
    jumlah: number;
    tanggal: string;
    bank: PaymentEntity["bank"];
    noRekening: string;
    rekeningTujuanId?: ID;
    buktiTransfer?: string;
    keterangan?: string;
    /** Applied immediately when the operator picks the invoices. */
    alokasi?: { invoiceId: ID; jumlah: number }[];
  },
  aktor: string,
): PaymentEntity {
  if (input.jumlah <= 0) throw new ApiError("Nominal penerimaan harus lebih dari nol.");

  const seq = db.payments.length + 1;
  const payment: PaymentEntity = {
    ...scopeFromOutlet(db, input.outletId),
    id: nextId("pay"),
    nomor: docNo(db, "BKM", input.tanggal, seq),
    outletId: input.outletId,
    tanggal: input.tanggal,
    jumlah: round(input.jumlah),
    bank: input.bank,
    noRekening: input.noRekening,
    rekeningTujuanId: input.rekeningTujuanId,
    status: "Menunggu Verifikasi",
    alokasi: [],
    buktiTransfer: input.buktiTransfer,
    keterangan: input.keterangan,
  };
  db.payments.unshift(payment);

  if (input.alokasi?.length) applyAllocation(db, payment.id, input.alokasi, aktor);
  return payment;
}

/**
 * Applies receipt money to invoices.
 *
 * Validates against both sides — you cannot apply more than was received, nor
 * more than an invoice still owes.
 */
export function applyAllocation(
  db: Database,
  paymentId: ID,
  alokasi: { invoiceId: ID; jumlah: number }[],
  aktor: string,
) {
  const payment = db.payments.find((p) => p.id === paymentId);
  if (!payment) throw new ApiError("Penerimaan tidak ditemukan.", 404);
  if (payment.status === "Ditolak") {
    throw new ApiError("Penerimaan yang ditolak tidak dapat dialokasikan.");
  }

  const rows = alokasi.filter((a) => a.jumlah > 0);
  const total = round(rows.reduce((s, a) => s + a.jumlah, 0));
  if (total === 0) throw new ApiError("Tentukan jumlah alokasi terlebih dahulu.");

  const tersedia = unallocated(payment);
  if (total > tersedia + 0.001) {
    throw new ApiError(
      `Alokasi Rp ${fmt(total)} melebihi sisa penerimaan Rp ${fmt(tersedia)}.`,
    );
  }

  for (const row of rows) {
    const inv = db.invoices.find((i) => i.id === row.invoiceId);
    if (!inv) throw new ApiError("Tagihan tidak ditemukan.", 404);
    if (inv.outletId !== payment.outletId) {
      throw new ApiError(`${inv.nomor} milik ${outletLabel()} lain.`);
    }
    // Money already pledged by receipts still awaiting verification counts
    // against the invoice too, or it could be over-allocated twice.
    const pending = db.payments
      .filter((p) => p.status === "Menunggu Verifikasi" && p.id !== payment.id)
      .flatMap((p) => p.alokasi)
      .filter((a) => a.invoiceId === inv.id)
      .reduce((s, a) => s + a.jumlah, 0);
    const sisa = round(invoiceSisa(inv) - pending);
    if (row.jumlah > sisa + 0.001) {
      throw new ApiError(
        `Alokasi ke ${inv.nomor} sebesar Rp ${fmt(row.jumlah)} melebihi sisa tagihan Rp ${fmt(sisa)}.`,
      );
    }
  }

  for (const row of rows) {
    const existing = payment.alokasi.find((a) => a.invoiceId === row.invoiceId);
    if (existing) existing.jumlah = round(existing.jumlah + row.jumlah);
    else payment.alokasi.push({ invoiceId: row.invoiceId, jumlah: round(row.jumlah) });
  }

  // Cash only hits the ledger — and only reduces the receivable — once finance
  // has verified it.
  if (payment.status === "Terverifikasi") {
    postAllocationJournal(db, payment, rows, aktor);
  }
  for (const row of rows) recomputeInvoicePaid(db, row.invoiceId);

  recordAudit(db, {
    action: "payment.allocate",
    entity: "Payment",
    entityId: payment.id,
    summary: `Mengalokasikan Rp ${fmt(total)} dari ${payment.nomor} ke ${rows.length} tagihan.`,
  });

  return payment;
}

function postAllocationJournal(
  db: Database,
  payment: PaymentEntity,
  rows: { invoiceId: ID; jumlah: number }[],
  aktor: string,
) {
  const total = round(rows.reduce((s, a) => s + a.jumlah, 0));
  const pkl = db.outlets.find((p) => p.id === payment.outletId);
  postJournal(db, {
    scope: { tenantId: payment.tenantId, branchId: payment.branchId },
    tanggal: payment.tanggal,
    keterangan: `${payment.nomor} — penerimaan dari ${pkl?.nama ?? "${outletLabel()}"}`,
    sumber: { tipe: "payment", id: payment.id },
    aktor,
    lines: [
      { akunId: accountByRole(db, "bank").id, debit: total, kredit: 0 },
      { akunId: accountByRole(db, "piutang").id, debit: 0, kredit: total },
    ],
  });
}

/** Finance signs off the receipt; only then does cash reach the ledger. */
export function verifyPaymentRecord(
  db: Database,
  paymentId: ID,
  action: "verify" | "reject",
  keterangan: string | undefined,
  aktor: string,
): PaymentEntity {
  const payment = db.payments.find((p) => p.id === paymentId);
  if (!payment) throw new ApiError("Penerimaan tidak ditemukan.", 404);
  if (payment.status !== "Menunggu Verifikasi") {
    throw new ApiError(`${payment.nomor} sudah diputuskan sebelumnya.`);
  }
  if (action === "reject" && !keterangan?.trim()) {
    throw new ApiError("Alasan penolakan wajib diisi.");
  }

  const touched = payment.alokasi.map((a) => a.invoiceId);

  if (action === "reject") {
    payment.alokasi = [];
    payment.status = "Ditolak";
  } else {
    payment.status = "Terverifikasi";
    if (payment.alokasi.length > 0) {
      postAllocationJournal(db, payment, payment.alokasi, aktor);
    }
  }

  // Verification is the moment the receivable actually moves.
  for (const id of touched) recomputeInvoicePaid(db, id);

  if (keterangan?.trim()) payment.keterangan = keterangan.trim();
  payment.diverifikasiOleh = aktor;
  payment.diverifikasiPada = new Date().toISOString();
  return payment;
}

/* ── credit notes ──────────────────────────────────────────────────────── */

export function issueCreditNote(
  db: Database,
  input: { outletId: ID; invoiceId: ID | null; jumlah: number; alasan: string },
  aktor: string,
): CreditNoteEntity {
  if (input.jumlah <= 0) throw new ApiError("Nilai nota kredit harus lebih dari nol.");
  if (!input.alasan.trim()) throw new ApiError("Alasan nota kredit wajib diisi.");

  if (input.invoiceId) {
    const inv = db.invoices.find((i) => i.id === input.invoiceId);
    if (!inv) throw new ApiError("Tagihan tidak ditemukan.", 404);
    const sisa = invoiceSisa(inv);
    if (input.jumlah > sisa + 0.001) {
      throw new ApiError(
        `Nota kredit Rp ${fmt(input.jumlah)} melebihi sisa tagihan Rp ${fmt(sisa)}.`,
      );
    }
  }

  const today = isoDate(startOfToday());
  const seq = db.creditNotes.length + 1;
  const note: CreditNoteEntity = {
    ...scopeFromOutlet(db, input.outletId),
    id: nextId("cn"),
    nomor: docNo(db, "NK", today, seq),
    outletId: input.outletId,
    invoiceId: input.invoiceId,
    tanggal: today,
    jumlah: round(input.jumlah),
    alasan: input.alasan.trim(),
    status: input.invoiceId ? "Terpakai" : "Terbit",
    dibuatOleh: aktor,
  };
  db.creditNotes.unshift(note);

  if (input.invoiceId) {
    const inv = db.invoices.find((i) => i.id === input.invoiceId)!;
    inv.kredit = round(inv.kredit + note.jumlah);
    refreshInvoiceStatus(inv);
  }

  // Contra-revenue rather than a negative sale, so gross turnover stays honest.
  postJournal(db, {
    scope: { tenantId: note.tenantId, branchId: note.branchId },
    tanggal: note.tanggal,
    keterangan: `${note.nomor} — ${note.alasan}`,
    sumber: { tipe: "creditNote", id: note.id },
    aktor,
    lines: [
      { akunId: accountByRole(db, "returPenjualan").id, debit: note.jumlah, kredit: 0 },
      { akunId: accountByRole(db, "piutang").id, debit: 0, kredit: note.jumlah },
    ],
  });

  return note;
}

/** Marks overdue invoices, so status reflects the calendar without a cron job. */
export function refreshOverdue(db: Database) {
  const today = isoDate(startOfToday());
  for (const inv of db.invoices) refreshInvoiceStatus(inv, today);
}
