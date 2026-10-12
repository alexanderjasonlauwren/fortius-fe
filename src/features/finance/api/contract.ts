/**
 * What every finance adapter must provide.
 *
 * Same reason as `features/vehicles/api/contract.ts`: without a contract the
 * mock and the HTTP adapter drift, and the drift shows up only in whichever
 * screen happens to read the field one of them forgot. This one is larger
 * than most because the backend's finance module is five real resources
 * (invoices, payments, allocations, credit notes, journals) behind one
 * console feature.
 *
 * **Adapters return domain types.** The wire shape never escapes the HTTP
 * adapter -- mapping there is what keeps every component unaware of which
 * source it is running against.
 */
import type { AccountBalance } from "@/features/finance/lib/accounts";
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
}

export interface PaymentView {
  id: string;
  nomor: string;
  outletId: string;
  outlet: string;
  tanggal: string;
  jumlah: number;
  belumDialokasikan: number;
  bank: string;
  noRekening: string;
  status: string;
  alokasi: { invoiceId: string; nomor: string; jumlah: number }[];
  buktiTransfer?: string;
  keterangan?: string;
  diverifikasiOleh?: string;
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

export interface CreditNoteInput {
  outletId: string;
  invoiceId: string | null;
  jumlah: number;
  alasan: string;
}

export interface CreditNoteView {
  id: string;
  nomor: string;
  outletId: string;
  invoiceId: string | null;
  jumlah: number;
  alasan: string;
  status: CreditNoteStatus;
  tanggal: string;
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
  status: "Diposting" | "Dibatalkan";
  lines: JournalLineView[];
  total: number;
  version: number;
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

export interface TrialBalanceView {
  rows: AccountBalance[];
  totalDebit: number;
  totalKredit: number;
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
  getInvoices(filters?: InvoiceFilters): Promise<InvoiceView[]>;
  getAgingReport(): Promise<AgingReport>;
  getPayments(status?: string, search?: string): Promise<PaymentView[]>;
  /** Open invoices for the allocation picker. */
  getOpenInvoices(outletId: string): Promise<InvoiceView[]>;
  /** "Buat tagihan" (financial-statements plan P5 / gap-closing plan
   *  Phase C): a registration or other manual invoice. */
  createManualInvoice(input: CreateManualInvoiceInput): Promise<InvoiceView>;
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
  getJournals(range?: DateRange): Promise<JournalView[]>;
  /** "Jurnal umum" (gap-closing plan, Phase E). Refused by the real
   *  backend's own finance.create.journals grant for anyone but
   *  tenant_admin -- the same tier manual journal entry has always sat
   *  at. */
  createManualJournal(input: CreateManualJournalInput): Promise<JournalView>;
  /** Posts the mirror of an existing journal. Refused unless the
   *  original's sourceType is "manual" or "openingBalance" -- every other
   *  source type already has its own module-specific void/cancel path. */
  reverseJournal(id: string, version: number): Promise<JournalView>;
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
