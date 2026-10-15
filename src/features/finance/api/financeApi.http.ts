/**
 * Invoices, cash receipts and the general ledger, against the real API.
 *
 * Five backend resources sit behind this one console feature -- invoices,
 * payments, payment allocations, credit notes and journals -- all landed by
 * D2's plan (see fortius-backend's docs/flow-gap-analysis.md §F). This file
 * is where their wire shapes meet the console's existing view types, so nine
 * screens built against the mock keep working unchanged against the real
 * service.
 *
 * An invoice carries its surat jalan number (`delivery_number`) and a
 * receipt its allocation lines with invoice numbers -- both were gaps this
 * file used to paper over with "—" and a synthetic line, closed by the
 * accounting parity plan's P2.
 */
import { getList, getOne, send } from "@/lib/api";
import { toApiTimestamp, todayIso } from "@/lib/date";
import { getOutletList } from "@/features/outlet/api/outletApi";
import type { OutletView } from "@/features/outlet/api/contract";
import type { AccountBalance } from "@/features/finance/lib/accounts";
import {
  profitAndLossFromTrialBalance,
  type TrialBalanceRow,
} from "@/features/finance/lib/trialBalance";
import type { AccountEntity, AccountType, InvoiceStatus } from "@/types/domain";
import { AGING_BUCKETS } from "./contract";
import type {
  AgingReport,
  AgingRow,
  AllocationLine,
  ChartUpgradeResult,
  CreateAccountInput,
  CreateManualInvoiceInput,
  CreateManualJournalInput,
  CreditNoteFilters,
  CreditNoteInput,
  CreditNoteView,
  InvoiceDetailView,
  DateRange,
  FinanceApi,
  FundingResult,
  FundStopInput,
  InvoiceFilters,
  InvoiceView,
  JournalQuery,
  JournalView,
  PaymentMethodView,
  PaymentView,
  ProfitAndLossView,
  RecordPaymentInput,
  TrialBalanceView,
} from "./contract";

const PAGE_SIZE = 100;

/* ── shared lookups ────────────────────────────────────────────────────── */

async function outletsById(): Promise<Map<string, OutletView>> {
  const outlets = await getOutletList();
  return new Map(outlets.map((o) => [o.id, o]));
}

/* ── invoices ──────────────────────────────────────────────────────────── */

interface InvoiceLineResponse {
  product_id?: string;
  product_name?: string;
  description?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

/** Mirrors the backend's InvoiceResponse. */
interface InvoiceResponse {
  id: string;
  invoice_number: string;
  outlet_id: string;
  // Absent for a "registration"/"other" invoice (financial-statements
  // plan P5 / gap-closing plan Phase C) -- see InvoiceResponse's own doc:
  // DeliveryID is nil for either.
  delivery_id?: string;
  /** The surat jalan number of the delivery this invoice bills. */
  delivery_number?: string;
  invoice_type: string;
  description?: string;
  reference_number?: string;
  void_reason?: string;
  voided_at?: string;
  lines: InvoiceLineResponse[];
  subtotal: number;
  tax_percentage: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  credit_amount: number;
  outstanding_amount: number;
  total_qty: number;
  due_date: string;
  payment_status: string;
  issued_at: string;
  paid_at?: string;
  notes?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/**
 * `core.invoices.payment_status` is `unpaid | partial | paid | overdue |
 * waived | credited`; the console's InvoiceStatus is the narrower `Terbit |
 * Sebagian | Lunas | Jatuh Tempo | Batal`, fixed before the ledger existed.
 * `waived` and `credited` both close the receivable without cash changing
 * hands, and neither has a distinct console status -- both read as Lunas,
 * which is what `outstanding_amount` (always the real figure, read
 * separately) already agrees with.
 */
function toInvoiceStatus(paymentStatus: string): InvoiceStatus {
  switch (paymentStatus) {
    case "paid":
    case "waived":
    case "credited":
      return "Lunas";
    case "partial":
      return "Sebagian";
    case "overdue":
      return "Jatuh Tempo";
    case "void":
      return "Batal";
    default:
      return "Terbit";
  }
}

/**
 * Mirrors mocks/ar.ts's own `agingBucket` exactly -- kept as a second copy
 * rather than a shared import because that function takes a full
 * `InvoiceEntity`, and widening its signature to fit both builds is a larger
 * change than five lines of duplicated arithmetic.
 */
function agingBucketFor(dueDateIso: string, today: string): (typeof AGING_BUCKETS)[number] {
  if (dueDateIso >= today) return "Belum jatuh tempo";
  const days = Math.floor(
    (new Date(today).getTime() - new Date(dueDateIso).getTime()) / 86_400_000,
  );
  if (days <= 30) return "1–30 hari";
  if (days <= 60) return "31–60 hari";
  if (days <= 90) return "61–90 hari";
  return "> 90 hari";
}

function toInvoiceView(
  row: InvoiceResponse,
  outlets: Map<string, OutletView>,
  today: string,
): InvoiceView {
  const outlet = outlets.get(row.outlet_id);
  const dueDate = row.due_date.slice(0, 10);
  return {
    id: row.id,
    nomor: row.invoice_number,
    outletId: row.outlet_id,
    outlet: outlet?.nama ?? "—",
    kecamatan: outlet?.kecamatan ?? "—",
    suratJalan: row.delivery_number ?? "—",
    invoiceType: row.invoice_type === "registration" || row.invoice_type === "other"
      ? row.invoice_type
      : "delivery",
    tanggal: row.issued_at.slice(0, 10),
    jatuhTempo: dueDate,
    umurHari: Math.floor(
      (new Date(today).getTime() - new Date(dueDate).getTime()) / 86_400_000,
    ),
    bucket: agingBucketFor(dueDate, today),
    jumlahUnit: row.total_qty,
    total: row.total_amount,
    terbayar: row.amount_paid,
    kredit: row.credit_amount,
    sisa: row.outstanding_amount,
    status: toInvoiceStatus(row.payment_status),
    termin: outlet?.termin ?? 0,
    referensi: row.reference_number,
    keterangan: row.description,
    alasanBatal: row.void_reason,
    version: row.version,
  };
}

async function getInvoice(id: string): Promise<InvoiceDetailView> {
  const [row, outlets] = await Promise.all([getOne<InvoiceResponse>(`/invoices/${id}`), outletsById()]);
  const view = toInvoiceView(row, outlets, todayIso());
  return {
    ...view,
    lines: (row.lines ?? []).map((l) => ({
      uraian: l.product_name ?? l.description ?? "—",
      qty: l.quantity,
      harga: l.unit_price,
      jumlah: l.subtotal,
    })),
    subtotal: row.subtotal,
    persenPajak: row.tax_percentage,
    pajak: row.tax_amount,
  };
}

async function voidInvoice(id: string, version: number, reason: string): Promise<InvoiceView> {
  const row = await send<InvoiceResponse>("post", `/invoices/${id}/void`, { version, reason });
  return toInvoiceView(row, await outletsById(), todayIso());
}

/** 100 is every list definition's MaxPageSize; the server refuses more. */
async function fetchInvoices(filters?: { outletId?: string; search?: string }) {
  const page = await getList<InvoiceResponse>("/invoices", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "issued_at", direction: "desc" }],
    search: filters?.search,
    filters:
      filters?.outletId && filters.outletId !== "Semua"
        ? [{ field: "outlet_id", operator: "eq" as const, value: filters.outletId }]
        : [],
  });
  return page.items;
}

async function getInvoices(filters?: InvoiceFilters): Promise<InvoiceView[]> {
  const [rows, outlets] = await Promise.all([
    fetchInvoices({ outletId: filters?.outletId, search: filters?.search }),
    outletsById(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  let views = rows.map((r) => toInvoiceView(r, outlets, today));

  // payment_status only supports `eq` server-side (see
  // fortius-backend/internal/repository/invoice/list_definition.go), so
  // "Belum lunas" and bucket filtering both happen here, the same as the
  // mock does over its own in-memory rows.
  views = views.filter((inv) => {
    if (filters?.status === "Belum lunas") {
      if (inv.sisa <= 0 || inv.status === "Batal") return false;
    } else if (filters?.status && filters.status !== "Semua") {
      if (inv.status !== filters.status) return false;
    }
    if (filters?.bucket && filters.bucket !== "Semua" && inv.bucket !== filters.bucket) {
      return false;
    }
    return true;
  });
  return views.sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

async function getOpenInvoices(outletId: string): Promise<InvoiceView[]> {
  const [rows, outlets] = await Promise.all([fetchInvoices({ outletId }), outletsById()]);
  const today = new Date().toISOString().slice(0, 10);
  return rows
    .map((r) => toInvoiceView(r, outlets, today))
    .filter((inv) => inv.status !== "Batal" && inv.sisa > 0)
    .sort((a, b) => a.jatuhTempo.localeCompare(b.jatuhTempo));
}

async function createManualInvoice(input: CreateManualInvoiceInput): Promise<InvoiceView> {
  const row = await send<InvoiceResponse>("post", "/invoices/manual", {
    invoice_type: input.invoiceType,
    outlet_id: input.outletId,
    issue_date: input.issueDate,
    due_date: input.dueDate || undefined,
    branch_id: input.branchId || undefined,
    reference_number: input.referenceNumber || undefined,
    description: input.description,
    package_id: input.packageId,
    fee_amount: input.feeAmount,
    kit_items: input.kitItems?.map((k) => ({ product_id: k.productId, qty: k.qty })),
    lines: input.lines?.map((l) => ({
      description: l.description, amount: l.amount, revenue_account_id: l.revenueAccountId,
    })),
  });
  const outlets = await outletsById();
  const today = new Date().toISOString().slice(0, 10);
  return toInvoiceView(row, outlets, today);
}

/* ── ageing ────────────────────────────────────────────────────────────── */

async function getAgingReport(): Promise<AgingReport> {
  const [rows, outlets] = await Promise.all([fetchInvoices(), outletsById()]);
  const today = new Date().toISOString().slice(0, 10);
  const views = rows.map((r) => toInvoiceView(r, outlets, today));

  const byOutlet = new Map<string, AgingRow>();
  const totals: Record<string, number> = Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0]));

  for (const inv of views) {
    if (inv.status === "Batal" || inv.sisa <= 0) continue;
    const outlet = outlets.get(inv.outletId);

    let row = byOutlet.get(inv.outletId);
    if (!row) {
      row = {
        outletId: inv.outletId,
        outlet: inv.outlet,
        termin: outlet?.termin ?? 0,
        batasKredit: outlet?.batasKredit ?? 0,
        buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])),
        total: 0,
        jatuhTempo: 0,
        // Mirrors mocks/ar.ts's outletExposure: blocked only when the
        // outlet opted into auto-blocking and is actually overdue.
        terblokir: false,
      };
      byOutlet.set(inv.outletId, row);
    }

    row.buckets[inv.bucket] += inv.sisa;
    row.total += inv.sisa;
    if (inv.bucket !== "Belum jatuh tempo") {
      row.jatuhTempo += inv.sisa;
      if (outlet?.blokirOtomatis) row.terblokir = true;
    }
    totals[inv.bucket] += inv.sisa;
  }

  const outRows = [...byOutlet.values()].sort((a, b) => b.total - a.total);
  return {
    rows: outRows,
    totals,
    grandTotal: outRows.reduce((s, r) => s + r.total, 0),
    jatuhTempoTotal: outRows.reduce((s, r) => s + r.jatuhTempo, 0),
    outletMenunggak: outRows.filter((r) => r.jatuhTempo > 0).length,
    buckets: AGING_BUCKETS,
  };
}

/* ── cash receipts ─────────────────────────────────────────────────────── */

/** Mirrors the backend's PaymentResponse. */
interface PaymentResponse {
  id: string;
  payment_number: string;
  outlet_id: string;
  amount: number;
  payment_method_id: string;
  bank_name?: string;
  bank_account_last4?: string;
  bank_reference?: string;
  payment_date: string;
  payment_status: string;
  verified_at?: string;
  rejection_reason?: string;
  notes?: string;
  allocated: number;
  allocations?: { invoice_id: string; invoice_number: string; amount: number }[];
  version: number;
  created_at: string;
  updated_at: string;
}

interface PaymentMethodResponse {
  id: string;
  code: string;
  name: string;
  settles_immediately: boolean;
  requires_reference: boolean;
  requires_verification: boolean;
  sort_order: number;
  status: string;
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu Verifikasi",
  verified: "Terverifikasi",
  rejected: "Ditolak",
};

const PAYMENT_STATUS_CODE: Record<string, string> = {
  "Menunggu Verifikasi": "pending",
  Terverifikasi: "verified",
  Ditolak: "rejected",
};

function toPaymentView(row: PaymentResponse, outlets: Map<string, OutletView>): PaymentView {
  return {
    id: row.id,
    nomor: row.payment_number,
    outletId: row.outlet_id,
    outlet: outlets.get(row.outlet_id)?.nama ?? "—",
    tanggal: row.payment_date.slice(0, 10),
    jumlah: row.amount,
    belumDialokasikan: row.amount - row.allocated,
    bank: row.bank_name ?? "—",
    // The full account number never leaves the server unencrypted -- see
    // core.payments.bank_account_number_encrypted's own column comment.
    noRekening: row.bank_account_last4 ? `•••• ${row.bank_account_last4}` : "—",
    status: PAYMENT_STATUS_LABEL[row.payment_status] ?? row.payment_status,
    alokasi: (row.allocations ?? []).map((a) => ({
      invoiceId: a.invoice_id,
      nomor: a.invoice_number,
      jumlah: a.amount,
    })),
    keterangan: row.notes,
    diverifikasiOleh: row.verified_at ? "Terverifikasi" : undefined,
  };
}

async function getPayments(status?: string, search?: string): Promise<PaymentView[]> {
  const [page, outlets] = await Promise.all([
    getList<PaymentResponse>("/payments", {
      pageSize: PAGE_SIZE,
      sort: [{ field: "payment_date", direction: "desc" }],
      search,
    }),
    outletsById(),
  ]);
  const wireStatus = status && status !== "Semua" ? PAYMENT_STATUS_CODE[status] : undefined;
  return page.items
    .filter((r) => !wireStatus || r.payment_status === wireStatus)
    .map((r) => toPaymentView(r, outlets));
}

async function getPaymentMethods(): Promise<PaymentMethodView[]> {
  const page = await getList<PaymentMethodResponse>("/payment-methods", { pageSize: PAGE_SIZE });
  return page.items
    .filter((m) => m.status !== "ina")
    .sort((x, y) => x.sort_order - y.sort_order)
    .map((m) => ({ id: m.id, kode: m.code, nama: m.name, butuhReferensi: m.requires_reference }));
}

/** Bank transfer, or the first method -- for a caller that names none. */
async function defaultPaymentMethodId(): Promise<string> {
  const methods = await getPaymentMethods();
  const chosen = methods.find((m) => m.kode === "bank_transfer") ?? methods[0];
  if (!chosen) {
    throw new Error("Tidak ada metode pembayaran terdaftar untuk tenant ini.");
  }
  return chosen.id;
}

/**
 * Records a receipt and, when the form allocated it, applies it in the
 * same step -- the bookkeeper's one action. The two are separate requests
 * (record, then allocate); a failure applying leaves a recorded,
 * unallocated receipt, which the list flags and Alokasikan finishes.
 *
 * The reference is the bank's transaction number from the slip. A form
 * that has none falls back to the sender account number, which is what
 * every receipt carried before the field existed.
 */
async function submitPayment(input: RecordPaymentInput): Promise<PaymentView> {
  const [paymentMethodId, outlets] = await Promise.all([
    input.metodeId ? Promise.resolve(input.metodeId) : defaultPaymentMethodId(),
    outletsById(),
  ]);
  const created = await send<PaymentResponse>("post", "/payments", {
    outlet_id: input.outletId,
    amount: input.jumlah,
    payment_method_id: paymentMethodId,
    bank_name: input.bank,
    bank_account_number: input.noRekening,
    bank_reference: input.referensi?.trim() || input.noRekening,
    payment_date: toApiTimestamp(input.tanggal),
    notes: input.keterangan,
    destination_bank_account_id: input.rekeningTujuanId || undefined,
  });
  const lines = (input.alokasi ?? []).filter((a) => a.jumlah > 0);
  if (lines.length === 0) return toPaymentView(created, outlets);
  return submitAllocation(created.id, lines);
}

async function submitAllocation(
  paymentId: string,
  alokasi: AllocationLine[],
): Promise<PaymentView> {
  const outlets = await outletsById();
  const updated = await send<PaymentResponse>("post", `/payments/${paymentId}/allocations`, {
    lines: alokasi.map((a) => ({ invoice_id: a.invoiceId, amount: a.jumlah })),
  });
  return toPaymentView(updated, outlets);
}

async function submitPaymentDecision(
  paymentId: string,
  action: "verify" | "reject",
  keterangan?: string,
): Promise<PaymentView> {
  const [current, outlets] = await Promise.all([
    getOne<PaymentResponse>(`/payments/${paymentId}`),
    outletsById(),
  ]);
  const body =
    action === "verify"
      ? { version: current.version }
      : { version: current.version, reason: keterangan?.trim() || "Ditolak dari konsol." };
  const updated = await send<PaymentResponse>(
    "post",
    `/payments/${paymentId}/${action}`,
    body,
  );
  return toPaymentView(updated, outlets);
}

/* ── distribution funding ──────────────────────────────────────────────── */

/** Mirrors the backend's FundingResponse. */
interface FundingResponseWire {
  payment: PaymentResponse;
  distribution_order_id: string;
  outlet_id: string;
  lines_affected: number;
  available_balance: number;
}

function toFundingResult(
  wire: FundingResponseWire,
  outlets: Map<string, OutletView>,
): FundingResult {
  return {
    payment: toPaymentView(wire.payment, outlets),
    distributionOrderId: wire.distribution_order_id,
    outletId: wire.outlet_id,
    linesAffected: wire.lines_affected,
    availableBalance: wire.available_balance,
  };
}

/** Every unrejected receipt for this outlet -- a rejected one is refused by
 *  FundStop itself, so there is no point offering it in the picker. */
async function getOutletReceipts(outletId: string): Promise<PaymentView[]> {
  const [page, outlets] = await Promise.all([
    getList<PaymentResponse>("/payments", {
      pageSize: PAGE_SIZE,
      sort: [{ field: "payment_date", direction: "desc" }],
      filters: [{ field: "outlet_id", operator: "eq" as const, value: outletId }],
    }),
    outletsById(),
  ]);
  return page.items
    .filter((r) => r.payment_status !== "rejected")
    .map((r) => toPaymentView(r, outlets));
}

async function fundDistributionStop(input: FundStopInput): Promise<FundingResult> {
  const outlets = await outletsById();
  const wire = await send<FundingResponseWire>(
    "post",
    `/payments/${input.paymentId}/funding`,
    { distribution_order_id: input.distributionOrderId, outlet_id: input.outletId },
  );
  return toFundingResult(wire, outlets);
}

async function releaseDistributionStop(input: FundStopInput): Promise<FundingResult> {
  const outlets = await outletsById();
  const params = new URLSearchParams({
    distribution_order_id: input.distributionOrderId,
    outlet_id: input.outletId,
  });
  const wire = await send<FundingResponseWire>(
    "delete",
    `/payments/${input.paymentId}/funding?${params.toString()}`,
  );
  return toFundingResult(wire, outlets);
}

/* ── credit notes ──────────────────────────────────────────────────────── */

interface CreditNoteResponse {
  id: string;
  credit_note_number: string;
  outlet_id: string;
  invoice_id?: string;
  invoice_number?: string;
  amount: number;
  reason_code: string;
  reason: string;
  issue_date: string;
  credit_note_status: string;
  applied_at?: string;
  cancellation_reason?: string;
  version: number;
}

const CREDIT_NOTE_STATUS: Record<string, CreditNoteView["status"]> = {
  issued: "Terbit",
  applied: "Terpakai",
  cancelled: "Batal",
};

function toCreditNoteView(row: CreditNoteResponse): CreditNoteView {
  return {
    id: row.id,
    nomor: row.credit_note_number,
    outletId: row.outlet_id,
    invoiceId: row.invoice_id ?? null,
    invoiceNomor: row.invoice_number,
    jumlah: row.amount,
    alasan: row.reason,
    kodeAlasan: row.reason_code,
    status: CREDIT_NOTE_STATUS[row.credit_note_status] ?? "Terbit",
    tanggal: row.issue_date.slice(0, 10),
    alasanBatal: row.cancellation_reason,
    version: row.version,
  };
}

const CREDIT_NOTE_STATUS_CODE: Record<CreditNoteView["status"], string> = {
  Terbit: "issued",
  Terpakai: "applied",
  Batal: "cancelled",
};

async function getCreditNotes(filters?: CreditNoteFilters): Promise<CreditNoteView[]> {
  const wire: { field: string; operator: "eq"; value: string }[] = [];
  if (filters?.status && filters.status !== "Semua") {
    wire.push({ field: "credit_note_status", operator: "eq", value: CREDIT_NOTE_STATUS_CODE[filters.status] });
  }
  if (filters?.outletId && filters.outletId !== "Semua") {
    wire.push({ field: "outlet_id", operator: "eq", value: filters.outletId });
  }
  const page = await getList<CreditNoteResponse>("/credit-notes", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "issue_date", direction: "desc" }],
    search: filters?.search,
    filters: wire,
  });
  return page.items.map(toCreditNoteView);
}

async function applyCreditNote(id: string, version: number, invoiceId?: string): Promise<CreditNoteView> {
  return toCreditNoteView(
    await send<CreditNoteResponse>("post", `/credit-notes/${id}/apply`, { version, invoice_id: invoiceId }),
  );
}

async function cancelCreditNote(id: string, version: number, reason: string): Promise<CreditNoteView> {
  return toCreditNoteView(
    await send<CreditNoteResponse>("post", `/credit-notes/${id}/cancel`, { version, reason }),
  );
}

async function submitCreditNote(input: CreditNoteInput): Promise<CreditNoteView> {
  const created = await send<CreditNoteResponse>("post", "/credit-notes", {
    outlet_id: input.outletId,
    invoice_id: input.invoiceId ?? undefined,
    amount: input.jumlah,
    reason_code: input.kodeAlasan,
    reason: input.alasan,
    issue_date: toApiTimestamp(input.tanggal),
  });
  return toCreditNoteView(created);
}

/* ── general ledger ────────────────────────────────────────────────────── */

interface JournalLineResponse {
  account_id: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  memo?: string;
}

interface JournalResponse {
  id: string;
  journal_number: string;
  journal_date: string;
  description: string;
  source_type: string;
  journal_status: string;
  lines: JournalLineResponse[];
  source_id?: string;
  source_number?: string;
  version: number;
  branch_id?: string;
  branch_name?: string;
}

// Mirrors fin.journals.source_type's own CHECK constraint values, renamed
// to this build's camelCase JournalSourceType. An unrecognised wire value
// (a source_type added on the backend before this map catches up) falls
// back to "manual" rather than throwing -- close enough for display, and
// reverseJournal's own eligibility check treats it the same as a real
// manual entry would.
const SOURCE_TYPE: Record<string, JournalView["sourceType"]> = {
  invoice: "invoice", payment: "payment", credit_note: "creditNote", delivery: "delivery",
  manual: "manual", purchase: "purchase", cash_voucher: "cashVoucher", depreciation: "depreciation",
  closing: "closing", opening_balance: "openingBalance", expense: "expense",
  transportation_claim: "transportationClaim", sim3lon_opening: "sim3lonOpening",
  purchase_payment: "purchasePayment",
  asset_acquisition: "assetAcquisition",
  asset_disposal: "assetDisposal",
};

function toJournalView(row: JournalResponse): JournalView {
  const lines = row.lines ?? [];
  return {
    id: row.id,
    nomor: row.journal_number,
    tanggal: row.journal_date.slice(0, 10),
    keterangan: row.description,
    sourceType: SOURCE_TYPE[row.source_type] ?? "manual",
    sourceId: row.source_id,
    sourceNumber: row.source_number,
    status: row.journal_status === "reversed" ? "Dibatalkan" : "Diposting",
    total: lines.reduce((s, l) => s + l.debit, 0),
    lines: lines.map((l) => ({
      akun: { id: l.account_id, kode: l.account_code, nama: l.account_name },
      debit: l.debit,
      kredit: l.credit,
      memo: l.memo,
    })),
    version: row.version,
    branchId: row.branch_id,
    branchName: row.branch_name,
  };
}

// A range with more than this many journals stops paginating rather than
// walking forever against a fat-fingered date range -- 20 pages at
// PAGE_SIZE is 2,000 journals, already more than LedgerPage's own table
// renders usefully in one screen.
const MAX_JOURNAL_PAGES = 20;

/**
 * Every journal in the range, not just the first 100.
 *
 * Was capped at one page (PAGE_SIZE), silently dropping anything past it
 * for a range that crossed that many journals -- the ledger's own trial
 * balance and P&L are unaffected (they sum server-side), but this list is
 * what LedgerPage's Jurnal tab and the financial-statements Buku Besar tab
 * both render directly.
 */
async function getJournals(range?: DateRange, query?: JournalQuery): Promise<JournalView[]> {
  const filters: { field: string; operator: "eq" | "gte" | "lte"; value: string }[] = [];
  if (range?.from) filters.push({ field: "journal_date", operator: "gte", value: range.from });
  if (range?.to) filters.push({ field: "journal_date", operator: "lte", value: range.to });
  if (query?.accountId) filters.push({ field: "account_id", operator: "eq", value: query.accountId });

  const items: JournalResponse[] = [];
  for (let pageNumber = 1; pageNumber <= MAX_JOURNAL_PAGES; pageNumber++) {
    const page = await getList<JournalResponse>("/journals", {
      page: pageNumber,
      pageSize: PAGE_SIZE,
      sort: [{ field: "journal_date", direction: "desc" }],
      filters,
      search: query?.search?.trim() || undefined,
    });
    items.push(...page.items);
    if (!page.pagination.has_next) break;
  }
  // The list carries each journal's lines and its source document, so the
  // range is one request per page -- it used to be one more per journal.
  return items.map(toJournalView);
}

async function createManualJournal(input: CreateManualJournalInput): Promise<JournalView> {
  const row = await send<JournalResponse>("post", "/journals", {
    branch_id: input.branchId,
    journal_date: toApiTimestamp(input.journalDate),
    description: input.description,
    lines: input.lines.map((l) => ({
      account_id: l.accountId,
      debit: l.debit || undefined,
      credit: l.kredit || undefined,
      memo: l.memo?.trim() || undefined,
    })),
  });
  return toJournalView(row);
}

async function reverseJournal(id: string, version: number): Promise<JournalView> {
  const row = await send<JournalResponse>("post", `/journals/${id}/reverse`, { version });
  return toJournalView(row);
}

/* ── accounts / trial balance / P&L ───────────────────────────────────── */

interface AccountResponse {
  id: string;
  code: string;
  name: string;
  account_type: string;
  normal_balance: "dr" | "cr";
  is_system: boolean;
  role?: string;
  parent_id?: string;
}

const ACCOUNT_TYPE: Record<string, AccountType> = {
  asset: "Aset",
  liability: "Kewajiban",
  equity: "Ekuitas",
  revenue: "Pendapatan",
  expense: "Beban",
};

/**
 * `idToCode` resolves `parent_id` (a uuid) to the parent's own code --
 * `induk` stores the code, same as the mock (see mocks/ledger.ts's own
 * accounts), so `leafAccounts()` can compare it against sibling codes
 * without caring which adapter produced the row. Omitting this lookup left
 * every API-mode account's `induk` undefined, which made `leafAccounts()` a
 * silent no-op against the real backend -- caught live posting a manual
 * journal to "5-4000 Beban Umum dan Administrasi", a grouping header still
 * listed as selectable (gap-closing plan, Phase E).
 */
function toAccountEntity(row: AccountResponse, idToCode: Map<string, string>): AccountEntity {
  return {
    id: row.id,
    kode: row.code,
    nama: row.name,
    tipe: ACCOUNT_TYPE[row.account_type] ?? "Aset",
    saldoNormal: row.normal_balance === "dr" ? "debit" : "kredit",
    induk: row.parent_id ? idToCode.get(row.parent_id) : undefined,
    // "payable" (Step 6) has no equivalent in the console's AccountRole
    // union yet, and nothing here reads .role, so an unrecognised role is
    // left undefined rather than widening that type for no consumer.
    sistem: row.is_system,
    aktif: true,
  };
}

/**
 * Swallows a 403 rather than failing its caller outright. Only tenant_admin
 * holds `finance.read.accounts` -- confirmed live: signed in as
 * finance_officer, GET /accounts answered 403. The trial balance and P&L no
 * longer read it at all (each row carries its own type and role); the chart
 * of accounts, which genuinely needs it, is gated on
 * `PERMISSIONS.ACCOUNTS_VIEW` at the LedgerPage tab.
 */
async function fetchAccounts(): Promise<AccountResponse[]> {
  try {
    const page = await getList<AccountResponse>("/accounts", {
      pageSize: PAGE_SIZE,
      sort: [{ field: "code" }],
    });
    return page.items;
  } catch {
    return [];
  }
}

interface TrialBalanceRowResponse {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: string;
  account_role?: string;
  opening_debit: number;
  opening_credit: number;
  debit: number;
  credit: number;
  closing_debit: number;
  closing_credit: number;
}

interface TrialBalanceTotalsResponse {
  opening_debit: number;
  opening_credit: number;
  debit: number;
  credit: number;
  closing_debit: number;
  closing_credit: number;
}

interface TrialBalanceResponse {
  rows: TrialBalanceRowResponse[];
  totals: TrialBalanceTotalsResponse;
  balanced: boolean;
}

function toTrialBalanceRow(r: TrialBalanceRowResponse): TrialBalanceRow {
  const tipe = ACCOUNT_TYPE[r.account_type] ?? "Aset";
  return {
    // Enough of the account to render and to split the P&L by; the trial
    // balance deliberately does not need /accounts, which only tenant_admin
    // may read (see fetchAccounts).
    akun: {
      id: r.account_id,
      kode: r.account_code,
      nama: r.account_name,
      tipe,
      saldoNormal: tipe === "Aset" || tipe === "Beban" ? "debit" : "kredit",
      sistem: false,
      aktif: true,
    },
    role: r.account_role || undefined,
    saldoAwalDebit: r.opening_debit,
    saldoAwalKredit: r.opening_credit,
    debit: r.debit,
    kredit: r.credit,
    saldoAkhirDebit: r.closing_debit,
    saldoAkhirKredit: r.closing_credit,
  };
}

/**
 * The Neraca Saldo for a range: opening balance, movement and closing
 * balance per account, on the same rules as the Neraca (closing journals
 * excluded; revenue and expense open from 1 January). Replaces the ledger's
 * own `/journals/trial-balance`, which ignored "Dari" and counted closing
 * journals, so it disagreed with the Neraca after a year was closed.
 */
async function getTrialBalance(range: { from: string; to: string }): Promise<TrialBalanceView> {
  const response = await getOne<TrialBalanceResponse>(
    `/financial-statements/trial-balance?date_from=${range.from}&date_to=${range.to}`,
  );
  const t = response.totals;
  return {
    rows: response.rows.map(toTrialBalanceRow),
    totals: {
      saldoAwalDebit: t.opening_debit,
      saldoAwalKredit: t.opening_credit,
      debit: t.debit,
      kredit: t.credit,
      saldoAkhirDebit: t.closing_debit,
      saldoAkhirKredit: t.closing_credit,
    },
    seimbang: response.balanced,
  };
}

/** The laba rugi for a range, from the trial balance's movement -- see
 *  profitAndLossFromTrialBalance for why there is no second P&L engine. */
async function getProfitAndLoss(range: { from: string; to: string }): Promise<ProfitAndLossView> {
  const tb = await getTrialBalance(range);
  return profitAndLossFromTrialBalance(tb.rows);
}

/**
 * Every account in the chart with its current balance: balance-sheet
 * accounts lifetime, revenue and expense this year -- the trial balance's
 * closing column from 1 January to today.
 *
 * The balances are a courtesy: most callers want the account list for a
 * picker, and a role that may read the chart but not the statements must
 * still get it, so a refused trial balance leaves every balance at zero
 * rather than failing the picker.
 */
/** Roles the backend reserves for one module (cashvoucher's
 *  controlAccountModule, purchase's controlRoles). */
const CONTROL_ROLES = new Set([
  "receivable", "registration_receivable", "transport_receivable", "customer_deposit",
  "payable", "payable_pertamina", "inventory", "output_vat", "retained_earnings", "opening_balance_equity", "cash", "bank",
]);

/** Ids of accounts that carry a control role or sit under one. */
function controlAccountIds(rows: AccountResponse[]): Set<string> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = new Set<string>();
  for (const row of rows) {
    for (let cur: AccountResponse | undefined = row, depth = 0; cur && depth < 10; depth++) {
      if (cur.role && CONTROL_ROLES.has(cur.role)) {
        out.add(row.id);
        break;
      }
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
  }
  return out;
}

async function getChartOfAccounts(): Promise<AccountBalance[]> {
  const today = todayIso();
  const [accountRows, tb] = await Promise.all([
    fetchAccounts(),
    getTrialBalance({ from: `${today.slice(0, 4)}-01-01`, to: today }).catch(() => null),
  ]);
  const idToCode = new Map(accountRows.map((a) => [a.id, a.code]));
  const control = controlAccountIds(accountRows);
  const closingByCode = new Map((tb?.rows ?? []).map((r) => [r.akun.kode, r]));

  return accountRows
    .filter((a) => !a.code.endsWith("-0000"))
    .map((a) => {
      const row = closingByCode.get(a.code);
      const debit = row?.saldoAkhirDebit ?? 0;
      const kredit = row?.saldoAkhirKredit ?? 0;
      return {
        akun: { ...toAccountEntity(a, idToCode), kontrol: control.has(a.id) },
        debit,
        kredit,
        saldo: a.normal_balance === "dr" ? debit - kredit : kredit - debit,
      };
    });
}

const ACCOUNT_TYPE_REVERSE: Record<CreateAccountInput["tipe"], string> = {
  Aset: "asset",
  Kewajiban: "liability",
  Ekuitas: "equity",
  Pendapatan: "revenue",
  Beban: "expense",
};

async function createAccount(input: CreateAccountInput): Promise<void> {
  await send("post", "/accounts", {
    code: input.kode,
    name: input.nama,
    account_type: ACCOUNT_TYPE_REVERSE[input.tipe],
    parent_id: input.indukId,
    description: input.deskripsi,
  });
}

interface ChartUpgradeConflictResponse {
  code: string;
  reason: string;
}

interface ChartUpgradeApiResponse {
  dry_run: boolean;
  accounts_added: string[] | null;
  layouts_added: string[] | null;
  conflicts: ChartUpgradeConflictResponse[] | null;
}

async function upgradeChart(dryRun = true): Promise<ChartUpgradeResult> {
  const result = await send<ChartUpgradeApiResponse>("post", "/accounts/chart-upgrade", {
    dry_run: dryRun,
  });
  return {
    dryRun: result.dry_run,
    akunDitambahkan: result.accounts_added ?? [],
    layoutDitambahkan: result.layouts_added ?? [],
    konflik: (result.conflicts ?? []).map((c) => ({ kode: c.code, alasan: c.reason })),
  };
}

export const financeApiHttp: FinanceApi = {
  getInvoices,
  getAgingReport,
  getPayments,
  getOpenInvoices,
  createManualInvoice,
  getPaymentMethods,
  submitPayment,
  submitAllocation,
  submitPaymentDecision,
  getOutletReceipts,
  fundDistributionStop,
  releaseDistributionStop,
  submitCreditNote,
  getCreditNotes,
  applyCreditNote,
  cancelCreditNote,
  getInvoice,
  voidInvoice,
  getJournals,
  createManualJournal,
  reverseJournal,
  getTrialBalance,
  getProfitAndLoss,
  getChartOfAccounts,
  createAccount,
  upgradeChart,
};
