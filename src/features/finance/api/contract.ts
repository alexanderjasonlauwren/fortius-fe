import type { Paged } from "@/lib/api";
/**
 * What every finance adapter must provide.
 *
 * The domain shape screens read; the HTTP adapter maps the wire onto it.
 * Larger than most because the backend's finance module is five resources
 * (invoices, payments, allocations, credit notes, journals) behind one
 * console feature.
 *
 * **Adapters return domain types.** The wire shape never escapes the HTTP
 * adapter.
 */
import type { AccountBalance } from "@/features/finance/lib/accounts";
import type { TrialBalanceRow, TrialBalanceTotals } from "@/features/finance/lib/trialBalance";
import type { BankNameEntity, CreditNoteStatus, InvoiceStatus, JournalSourceType } from "@/types/domain";

export const AGING_BUCKETS = [
  "Belum jatuh tempo",
  "1–30 hari",
  "31–60 hari",
  "61–90 hari",
  "> 90 hari",
] as const;

export type AgingBucket = (typeof AGING_BUCKETS)[number];

/** "registration"/"other" (financial-statements plan P5 / gap-closing
 *  plan Phase C) are raised by hand, with no delivery behind them. */
export type InvoiceType = "delivery" | "registration" | "other";

export interface InvoiceView {
  id: string;
  nomor: string;
  outletId: string;
  outlet: string;
  kecamatan: string;
  suratJalan: string;
  invoiceType: InvoiceType;
  tanggal: string;
  jatuhTempo: string;
  /** Negative until due, positive once overdue. */
  umurHari: number;
  bucket: AgingBucket;
  jumlahUnit: number;
  total: number;
  terbayar: number;
  kredit: number;
  sisa: number;
  status: InvoiceStatus;
  termin: number;
  /** The customer's own reference (their PO or request number). */
  referensi?: string;
  keterangan?: string;
  /** Why a voided invoice was voided. */
  alasanBatal?: string;
  version: number;
}

export interface InvoiceLineView {
  /** Product name for a catalogue line, the typed text for a manual one. */
  uraian: string;
  qty: number;
  harga: number;
  jumlah: number;
}

/** One invoice with everything its own page shows and prints. */
export interface InvoiceDetailView extends InvoiceView {
  lines: InvoiceLineView[];
  subtotal: number;
  persenPajak: number;
  pajak: number;
}

/** One kit item on a registration invoice's create payload. */
export interface ManualInvoiceKitItemInput {
  productId: string;
  qty: number;
}

/** One line of an "other" invoice's create payload -- no catalogue
 *  product, just a description and the revenue account it posts to. */
export interface ManualInvoiceLineInput {
  description: string;
  amount: number;
  revenueAccountId: string;
}

/**
 * Raises a "registration" or "other" invoice by hand -- mirrors the real
 * backend's CreateManualInvoiceRequest. For "registration", an explicit
 * feeAmount/kitItems always wins; a named packageId supplies whichever of
 * the two was left out. For "other", lines is required.
 */
export interface CreateManualInvoiceInput {
  invoiceType: "registration" | "other";
  outletId: string;
  issueDate: string;
  dueDate?: string;
  branchId?: string;
  referenceNumber?: string;
  description?: string;
  packageId?: string;
  feeAmount?: number;
  kitItems?: ManualInvoiceKitItemInput[];
  lines?: ManualInvoiceLineInput[];
}

export interface InvoiceFilters {
  status?: InvoiceStatus | "Semua" | "Belum lunas";
  outletId?: string;
  bucket?: string;
  search?: string;
}

export interface AgingRow {
  outletId: string;
  outlet: string;
  termin: number;
  batasKredit: number;
  buckets: Record<string, number>;
  total: number;
  /** Overdue portion — the part that needs chasing. */
  jatuhTempo: number;
  terblokir: boolean;
}

export interface AgingReport {
  rows: AgingRow[];
  totals: Record<string, number>;
  grandTotal: number;
  jatuhTempoTotal: number;
  outletMenunggak: number;
  buckets: readonly string[];
  /** False when an open-invoice list hit the page ceiling: totals are a floor. */
  lengkap: boolean;
}

export interface PaymentView {
  id: string;
  nomor: string;
  outletId: string;
  outlet: string;
  tanggal: string;
  jumlah: number;
  /** What is left to allocate or refund: amount - allocated - refunded. */
  belumDialokasikan: number;
  /** Pending and approved refunds of this receipt (client answer 5). */
  dikembalikan: number;
  bank: string;
  noRekening: string;
  status: string;
  alokasi: { invoiceId: string; nomor: string; jumlah: number }[];
  buktiTransfer?: string;
  keterangan?: string;
  diverifikasiOleh?: string;
  version: number;
}

export interface RecordPaymentInput {
  outletId: string;
  jumlah: number;
  tanggal: string;
  bank: BankNameEntity;
  noRekening: string;
  rekeningTujuanId?: string;
  buktiTransfer?: string;
  keterangan?: string;
  /** Payment method; omitted means bank transfer. */
  metodeId?: string;
  /** The bank's transaction reference, from the transfer slip. */
  referensi?: string;
  /** Invoices this receipt pays, applied in the same step. */
  alokasi?: AllocationLine[];
}

export interface PaymentMethodView {
  id: string;
  kode: string;
  nama: string;
  /** The method needs a transaction reference (a transfer, a giro). */
  butuhReferensi: boolean;
}

export interface AllocationLine {
  invoiceId: string;
  jumlah: number;
}

/**
 * Fund/release act on one stop -- one pangkalan, one plan, one date -- not a
 * line, because that is the granularity the truck loads at and the payment
 * board already collapses to. See fortius-backend's
 * docs/open-findings.md #5.
 */
export interface FundStopInput {
  paymentId: string;
  distributionOrderId: string;
  outletId: string;
}

export interface FundingResult {
  payment: PaymentView;
  distributionOrderId: string;
  outletId: string;
  linesAffected: number;
  /** What the receipt has left after this action. */
  availableBalance: number;
}

/** The backend's closed reason_code vocabulary, in the console's words. */
export const CREDIT_NOTE_REASONS = {
  goods_return: "Retur tabung",
  billing_correction: "Koreksi tagihan",
  price_adjustment: "Penyesuaian harga",
  quality_claim: "Klaim kualitas",
  goodwill: "Kebijakan (goodwill)",
} as const;

export type CreditNoteReason = keyof typeof CREDIT_NOTE_REASONS;

export interface CreditNoteInput {
  outletId: string;
  invoiceId: string | null;
  jumlah: number;
  alasan: string;
  kodeAlasan: CreditNoteReason;
  tanggal: string;
}

export interface CreditNoteView {
  id: string;
  nomor: string;
  outletId: string;
  invoiceId: string | null;
  /** The number of the invoice it reduces, when it names one. */
  invoiceNomor?: string;
  jumlah: number;
  alasan: string;
  kodeAlasan: string;
  status: CreditNoteStatus;
  tanggal: string;
  alasanBatal?: string;
  version: number;
}

export interface CreditNoteFilters {
  status?: CreditNoteStatus | "Semua";
  outletId?: string;
  search?: string;
}

export interface JournalLineView {
  akun?: { id: string; kode: string; nama: string };
  debit: number;
  kredit: number;
  memo?: string;
}

export interface JournalView {
  id: string;
  nomor: string;
  tanggal: string;
  keterangan: string;
  sourceType: JournalSourceType;
  /** The document that posted this journal, when it is not the journal itself. */
  sourceId?: string;
  sourceNumber?: string;
  status: "Diposting" | "Dibatalkan";
  lines: JournalLineView[];
  total: number;
  version: number;
  branchId?: string;
  branchName?: string;
}

/** Narrows the journal list beyond its date range (accounting parity P3). */
export interface JournalQuery {
  /** Journal number or description. */
  search?: string;
  /** Only journals with a line on this account. */
  accountId?: string;
}

export interface ManualJournalLineInput {
  accountId: string;
  debit: number;
  kredit: number;
  memo?: string;
}

/** A hand-entered correction (gap-closing plan, Phase E / financial-
 *  statements plan P7.4). There is deliberately no update or delete on a
 *  journal -- a mistake is fixed with a second entry (reverseJournal),
 *  not an edit of the first. */
export interface CreateManualJournalInput {
  branchId?: string;
  journalDate: string;
  description: string;
  lines: ManualJournalLineInput[];
}

export interface DateRange {
  from?: string;
  to?: string;
}

/** A value-only stock opname: what an inventory asset account holding no
 *  product stock was counted at, as of a date. The server posts each line's
 *  difference from the ledger against 5-1900 Selisih Persediaan. */
export interface InventoryAdjustmentInput {
  date: string;
  description?: string;
  lines: { accountId: string; countedValue: number }[];
}

export interface InventoryAdjustmentResult {
  journalId: string;
  /** Signed: positive when the count was above the ledger. */
  totalAdjustment: number;
}

export interface TrialBalanceView {
  rows: TrialBalanceRow[];
  totals: TrialBalanceTotals;
  seimbang: boolean;
}

export interface ProfitAndLossView {
  pendapatan: AccountBalance[];
  beban: AccountBalance[];
  totalPendapatan: number;
  totalBeban: number;
  labaKotor: number;
  labaBersih: number;
}

export interface FinanceApi {
  /** One server page; `page` is 1-based. */
  getInvoices(filters?: InvoiceFilters, page?: number): Promise<Paged<InvoiceView>>;
  getAgingReport(): Promise<AgingReport>;
  /** One server page; `page` is 1-based. */
  getPayments(status?: string, search?: string, page?: number): Promise<Paged<PaymentView>>;
  /** Every receipt waiting for verification. */
  getPendingPayments(): Promise<PaymentView[]>;
  /** Open invoices for the allocation picker. */
  getOpenInvoices(outletId: string): Promise<InvoiceView[]>;
  /** "Buat tagihan" (financial-statements plan P5 / gap-closing plan
   *  Phase C): a registration or other manual invoice. */
  createManualInvoice(input: CreateManualInvoiceInput): Promise<InvoiceView>;
  getPaymentMethods(): Promise<PaymentMethodView[]>;
  /** Records a receipt, then applies it to input.alokasi when given. */
  submitPayment(input: RecordPaymentInput): Promise<PaymentView>;
  submitAllocation(paymentId: string, alokasi: AllocationLine[]): Promise<PaymentView>;
  submitPaymentDecision(
    paymentId: string,
    action: "verify" | "reject",
    keterangan?: string,
  ): Promise<PaymentView>;
  /** Candidate receipts for funding one outlet's stop -- unrejected, newest
   *  first, so the operator can see what is available without a separate
   *  screen. */
  getOutletReceipts(outletId: string): Promise<PaymentView[]>;
  /** Links a receipt to every live line of one outlet on one plan, releasing
   *  it for dispatch once the receipt is verified (or verifying it in the
   *  same call -- see fortius-backend's payment.FundStop). */
  fundDistributionStop(input: FundStopInput): Promise<FundingResult>;
  /** Reverses fundDistributionStop for a stop not yet dispatched. */
  releaseDistributionStop(input: FundStopInput): Promise<FundingResult>;
  submitCreditNote(input: CreditNoteInput): Promise<CreditNoteView>;
  /** One server page; `page` is 1-based. */
  getCreditNotes(filters?: CreditNoteFilters, page?: number): Promise<Paged<CreditNoteView>>;
  /** Lands an issued credit note on its invoice (or on invoiceId, for a
   *  credit on account). */
  applyCreditNote(id: string, version: number, invoiceId?: string): Promise<CreditNoteView>;
  cancelCreditNote(id: string, version: number, reason: string): Promise<CreditNoteView>;
  getInvoice(id: string): Promise<InvoiceDetailView>;
  /** One server page of the range's journals; `page` is 1-based. */
  getJournals(range?: DateRange, query?: JournalQuery, page?: number): Promise<Paged<JournalView>>;
  /** "Jurnal umum" (gap-closing plan, Phase E). Refused by the real
   *  backend's own finance.create.journals grant for anyone but
   *  tenant_admin -- the same tier manual journal entry has always sat
   *  at. */
  createManualJournal(input: CreateManualJournalInput): Promise<JournalView>;
  /** Posts the mirror of an existing journal. Refused unless the
   *  original's sourceType is "manual" or "openingBalance" -- every other
   *  source type already has its own module-specific void/cancel path. */
  reverseJournal(id: string, version: number): Promise<JournalView>;
  /** Refused for an account products are stocked on (USE_STOCK_COUNT):
   *  those are counted per product, on the inventory page. */
  postInventoryAdjustment(input: InventoryAdjustmentInput): Promise<InventoryAdjustmentResult>;
  getTrialBalance(range: { from: string; to: string }): Promise<TrialBalanceView>;
  getProfitAndLoss(range: { from: string; to: string }): Promise<ProfitAndLossView>;
  getChartOfAccounts(): Promise<AccountBalance[]>;
  /** Adds a plain sub-account to the chart -- never a system account, which
   *  only the starting chart (or an upgrade) can create. */
  createAccount(input: CreateAccountInput): Promise<void>;
  /** Brings this tenant's chart of accounts and statement layouts up to the
   *  current chart-v2 seed (financial-statements plan, phase P1). dryRun
   *  defaults true: preview before writing. Only ever adds. */
  upgradeChart(dryRun?: boolean): Promise<ChartUpgradeResult>;
}

export interface CreateAccountInput {
  kode: string;
  nama: string;
  tipe: "Aset" | "Kewajiban" | "Ekuitas" | "Pendapatan" | "Beban";
  indukId?: string;
  deskripsi?: string;
}

export interface ChartUpgradeConflict {
  kode: string;
  alasan: string;
}

export interface ChartUpgradeResult {
  dryRun: boolean;
  akunDitambahkan: string[];
  layoutDitambahkan: string[];
  konflik: ChartUpgradeConflict[];
}
