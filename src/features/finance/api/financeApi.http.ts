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
 * # Two known gaps, deliberately not papered over
 *
 * **Surat jalan.** `InvoiceResponse` carries `delivery_id`, a UUID, not the
 * delivery's own document number -- resolving it would mean one extra
 * request per row. `suratJalan` reads "—" here rather than the UUID, which
 * is honest about what the list endpoint actually returns.
 *
 * **Which invoices a receipt was applied to.** `PaymentResponse` carries
 * `allocated`, the total applied -- correct, and `belumDialokasikan` uses it
 * directly. But no route returns the allocation *lines* themselves; the
 * only one that touches them is `POST /payments/:id/allocations`, which
 * creates and returns nothing to read back. So `alokasi` cannot name which
 * invoices were paid in this build; it carries one synthetic line summing
 * the allocated amount so `alokasi.length === 0` still means "nothing
 * applied yet" (the one thing PaymentPage actually branches on), rather than
 * showing invoice numbers the API cannot supply. A real fix needs a route
 * such as `GET /payments/:id/allocations`.
 */
import { getList, getOne, send } from "@/lib/api";
import { getOutletList } from "@/features/outlet/api/outletApi";
import type { OutletView } from "@/features/outlet/api/contract";
import type { AccountBalance } from "@/mocks/ledger";
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
  CreditNoteInput,
  CreditNoteView,
  DateRange,
  FinanceApi,
  FundingResult,
  FundStopInput,
  InvoiceFilters,
  InvoiceView,
  JournalView,
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
  product_id: string;
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
  invoice_type: string;
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
    // See this file's header: not resolvable without a per-row request.
    suratJalan: "—",
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
  };
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
    due_date: input.dueDate,
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
    // See this file's header: which invoices were paid is not resolvable
    // from any route this build can call, only the total.
    alokasi:
      row.allocated > 0
        ? [{ invoiceId: "", nomor: "(lihat tagihan)", jumlah: row.allocated }]
        : [],
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

/** The tenant's payment methods, so a receipt can be recorded without a
 *  method picker the console does not have yet -- see submitPayment. */
async function resolvePaymentMethodId(): Promise<string> {
  const page = await getList<PaymentMethodResponse>("/payment-methods", { pageSize: PAGE_SIZE });
  const bankTransfer = page.items.find((m) => m.code === "bank_transfer");
  const chosen = bankTransfer ?? page.items[0];
  if (!chosen) {
    throw new Error("Tidak ada metode pembayaran terdaftar untuk tenant ini.");
  }
  return chosen.id;
}

/**
 * The console's record-receipt form collects a sender bank name and account
 * number, not a payment method or a transaction reference -- there is no
 * method picker yet (payment_methods is Step 1c's addition, still without
 * console UI). Every receipt this build records goes in as `bank_transfer`,
 * and the account number the form already collects doubles as the
 * transaction reference `bank_transfer` requires, since the form has
 * nothing else to send for it. Both are real limitations of the current
 * form, not of the API.
 */
async function submitPayment(input: RecordPaymentInput): Promise<PaymentView> {
  const [paymentMethodId, outlets] = await Promise.all([
    resolvePaymentMethodId(),
    outletsById(),
  ]);
  const created = await send<PaymentResponse>("post", "/payments", {
    outlet_id: input.outletId,
    amount: input.jumlah,
    payment_method_id: paymentMethodId,
    bank_name: input.bank,
    bank_account_number: input.noRekening,
    bank_reference: input.noRekening,
    payment_date: input.tanggal,
    notes: input.keterangan,
  });
  return toPaymentView(created, outlets);
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
    jumlah: row.amount,
    alasan: row.reason,
    status: CREDIT_NOTE_STATUS[row.credit_note_status] ?? "Terbit",
    tanggal: row.issue_date.slice(0, 10),
  };
}

/**
 * `reason_code` is a required, closed CHECK on the backend
 * (`goods_return | billing_correction | price_adjustment | quality_claim |
 * goodwill`); ReceivablesPage's dialog collects only free-text `alasan`, so
 * this build always sends `billing_correction`, the closest generic code, a
 * console screen with no reason picker yet cannot choose more precisely.
 */
async function submitCreditNote(input: CreditNoteInput): Promise<CreditNoteView> {
  const created = await send<CreditNoteResponse>("post", "/credit-notes", {
    outlet_id: input.outletId,
    invoice_id: input.invoiceId ?? undefined,
    amount: input.jumlah,
    reason_code: "billing_correction",
    reason: input.alasan,
    issue_date: new Date().toISOString().slice(0, 10),
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
  version: number;
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
  closing: "closing", opening_balance: "openingBalance",
};

function toJournalView(row: JournalResponse): JournalView {
  const lines = row.lines ?? [];
  return {
    id: row.id,
    nomor: row.journal_number,
    tanggal: row.journal_date.slice(0, 10),
    keterangan: row.description,
    sourceType: SOURCE_TYPE[row.source_type] ?? "manual",
    status: row.journal_status === "reversed" ? "Dibatalkan" : "Diposting",
    total: lines.reduce((s, l) => s + l.debit, 0),
    lines: lines.map((l) => ({
      akun: { id: l.account_id, kode: l.account_code, nama: l.account_name },
      debit: l.debit,
      kredit: l.credit,
      memo: l.memo,
    })),
    version: row.version,
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
async function getJournals(range?: DateRange): Promise<JournalView[]> {
  const filters: { field: string; operator: "gte" | "lte"; value: string }[] = [];
  if (range?.from) filters.push({ field: "journal_date", operator: "gte", value: range.from });
  if (range?.to) filters.push({ field: "journal_date", operator: "lte", value: range.to });

  const items: JournalResponse[] = [];
  for (let pageNumber = 1; pageNumber <= MAX_JOURNAL_PAGES; pageNumber++) {
    const page = await getList<JournalResponse>("/journals", {
      page: pageNumber,
      pageSize: PAGE_SIZE,
      sort: [{ field: "journal_date", direction: "desc" }],
      filters,
    });
    items.push(...page.items);
    if (!page.pagination.has_next) break;
  }
  // ListJournals never carries lines (same N+1-avoidance the registration
  // packages list applies to its own items) -- the detail read is the only
  // place they're real. The ledger's own date-range view is what this page
  // is for, so it fetches every row's detail rather than showing accounts
  // with no amounts against them.
  const withLines = await Promise.all(
    items.map((item) => getOne<JournalResponse>(`/journals/${item.id}`)),
  );
  return withLines.map(toJournalView);
}

async function createManualJournal(input: CreateManualJournalInput): Promise<JournalView> {
  const row = await send<JournalResponse>("post", "/journals", {
    branch_id: input.branchId,
    // CreateManualJournalRequest.JournalDate is a real time.Time, unlike
    // every other date field this adapter sends (asset/depreciation-run
    // requests all declare theirs as a plain validated string) -- Go's
    // JSON unmarshal rejects a bare "YYYY-MM-DD" against time.Time with a
    // decode error the binding layer reports as "Request body is not
    // valid JSON", caught live against the real API.
    journal_date: `${input.journalDate}T00:00:00Z`,
    description: input.description,
    lines: input.lines.map((l) => ({
      account_id: l.accountId,
      debit: l.debit || undefined,
      credit: l.kredit || undefined,
      memo: l.memo,
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
 * Swallows a 403 rather than letting it fail the trial balance or P&L
 * outright. Only tenant_admin holds `finance.read.accounts` -- confirmed
 * live: signed in as finance_officer, GET /accounts answered 403 while
 * finance_officer legitimately holds `finance.read.journals` and must still
 * see a working trial balance and P&L. `toAccountBalances`/`toPnlRows` fall
 * back to signing by account_type when no account row is available; the
 * chart of accounts itself (which genuinely needs this list) is gated on
 * `PERMISSIONS.ACCOUNTS_VIEW` at the LedgerPage tab, not here.
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

/** asset/expense increase on the debit side, everything else on credit --
 *  mirrors the backend's own normalBalance (internal/usecase/account/services.go),
 *  used only when the account itself could not be read to ask directly. */
function defaultNormalBalance(accountType: string): "dr" | "cr" {
  return accountType === "asset" || accountType === "expense" ? "dr" : "cr";
}

interface TrialBalanceRowResponse {
  account_code: string;
  account_name: string;
  account_type: string;
  debit: number;
  credit: number;
}

interface TrialBalanceResponse {
  as_of: string;
  rows: TrialBalanceRowResponse[];
  total_debit: number;
  total_credit: number;
}

/**
 * Signs each row by the account's own `normal_balance` when it can be read
 * -- a contra account (sales_returns) shares its account_type with a normal
 * one and only the account itself knows which side it actually increases
 * on. Falls back to `defaultNormalBalance(account_type)` when `/accounts`
 * could not be read at all (see fetchAccounts's own comment) -- wrong only
 * for the rare contra account, and still signed, rather than every row
 * defaulting to debit-normal and every liability/equity/revenue balance
 * coming out negated.
 */
function toAccountBalances(
  rows: TrialBalanceRowResponse[],
  accounts: Map<string, AccountResponse>,
  idToCode: Map<string, string>,
): AccountBalance[] {
  return rows.map((r) => {
    const account = accounts.get(r.account_code);
    const normalBalance = account?.normal_balance ?? defaultNormalBalance(r.account_type);
    const saldo = normalBalance === "dr" ? r.debit - r.credit : r.credit - r.debit;
    return {
      akun: account
        ? toAccountEntity(account, idToCode)
        : {
            id: r.account_code,
            kode: r.account_code,
            nama: r.account_name,
            tipe: ACCOUNT_TYPE[r.account_type] ?? "Aset",
            saldoNormal: normalBalance === "dr" ? "debit" : "kredit",
            sistem: false,
            aktif: true,
          },
      debit: r.debit,
      kredit: r.credit,
      saldo,
    };
  });
}

/**
 * The ledger's own trial balance is lifetime-to-date **as of one date**
 * (`GET /journals/trial-balance?as_of=`), not a movement-within-a-range
 * figure the way the mock's `trialBalance(db, {from, to})` is. LedgerPage
 * shares one date-range control across all four tabs, so on this tab "Dari"
 * has no effect against the real API -- only "Sampai" is sent, as `as_of`.
 */
async function getTrialBalance(range: { from: string; to: string }): Promise<TrialBalanceView> {
  const [response, accountRows] = await Promise.all([
    getOne<TrialBalanceResponse>(`/journals/trial-balance?as_of=${range.to}`),
    fetchAccounts(),
  ]);
  const accounts = new Map(accountRows.map((a) => [a.code, a]));
  const idToCode = new Map(accountRows.map((a) => [a.id, a.code]));
  const rows = toAccountBalances(response.rows, accounts, idToCode).filter(
    (r) => r.debit !== 0 || r.kredit !== 0,
  );
  return {
    rows,
    totalDebit: response.total_debit,
    totalKredit: response.total_credit,
  };
}

interface ProfitAndLossRowResponse {
  account_code: string;
  account_name: string;
  amount: number;
}

interface ProfitAndLossResponse {
  revenue: ProfitAndLossRowResponse[];
  total_revenue: number;
  cogs: ProfitAndLossRowResponse[];
  total_cogs: number;
  gross_profit: number;
  expenses: ProfitAndLossRowResponse[];
  total_expenses: number;
  net_income: number;
}

function toPnlRows(
  rows: ProfitAndLossRowResponse[],
  accounts: Map<string, AccountResponse>,
  idToCode: Map<string, string>,
): AccountBalance[] {
  return rows.map((r) => {
    const account = accounts.get(r.account_code);
    return {
      akun: account
        ? toAccountEntity(account, idToCode)
        : {
            id: r.account_code,
            kode: r.account_code,
            nama: r.account_name,
            tipe: "Beban",
            saldoNormal: "debit",
            sistem: false,
            aktif: true,
          },
      // The backend already nets revenue and expense rows to one signed
      // amount per account; debit/credit turnover is not broken out here,
      // unlike the trial balance's own rows.
      debit: 0,
      kredit: 0,
      saldo: r.amount,
    };
  });
}

async function getProfitAndLoss(range: { from: string; to: string }): Promise<ProfitAndLossView> {
  const [response, accountRows] = await Promise.all([
    getOne<ProfitAndLossResponse>(
      `/journals/profit-and-loss?date_from=${range.from}&date_to=${range.to}`,
    ),
    fetchAccounts(),
  ]);
  const accounts = new Map(accountRows.map((a) => [a.code, a]));
  const idToCode = new Map(accountRows.map((a) => [a.id, a.code]));
  return {
    pendapatan: toPnlRows(response.revenue, accounts, idToCode),
    beban: toPnlRows([...response.cogs, ...response.expenses], accounts, idToCode),
    totalPendapatan: response.total_revenue,
    totalBeban: response.total_cogs + response.total_expenses,
    labaKotor: response.gross_profit,
    labaBersih: response.net_income,
  };
}

async function getChartOfAccounts(): Promise<AccountBalance[]> {
  const [accountRows, tb] = await Promise.all([
    fetchAccounts(),
    getOne<TrialBalanceResponse>("/journals/trial-balance"),
  ]);
  const accounts = new Map(accountRows.map((a) => [a.code, a]));
  const idToCode = new Map(accountRows.map((a) => [a.id, a.code]));
  const balances = toAccountBalances(tb.rows, accounts, idToCode);
  const balanceByCode = new Map(balances.map((b) => [b.akun.kode, b]));

  // Every account in the chart, not only the ones with lifetime movement --
  // mocks/ledger.ts's own accountBalances includes untouched accounts too,
  // and ChartSection is the "every account exists" screen, unlike the trial
  // balance which only shows ones with a nonzero figure.
  return accountRows
    .filter((a) => !a.code.endsWith("-0000"))
    .map(
      (a) =>
        balanceByCode.get(a.code) ?? {
          akun: toAccountEntity(a, idToCode),
          debit: 0,
          kredit: 0,
          saldo: 0,
        },
    );
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
  submitPayment,
  submitAllocation,
  submitPaymentDecision,
  getOutletReceipts,
  fundDistributionStop,
  releaseDistributionStop,
  submitCreditNote,
  getJournals,
  createManualJournal,
  reverseJournal,
  getTrialBalance,
  getProfitAndLoss,
  getChartOfAccounts,
  createAccount,
  upgradeChart,
};
