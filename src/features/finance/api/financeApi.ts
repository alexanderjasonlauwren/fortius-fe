import { exportExcel, timestampSuffix, type ExcelColumn } from "@/lib/export";
import { outletLabelTitle } from "@/lib/lexicon";
import { financeApiHttp } from "./financeApi.http";
import type { AgingRow, FinanceApi } from "./contract";

export type {
  AgingReport,
  AgingRow,
  ChartUpgradeConflict,
  ChartUpgradeResult,
  CreateAccountInput,
  CreateManualInvoiceInput,
  CreateManualJournalInput,
  CreditNoteFilters,
  CreditNoteInput,
  CreditNoteReason,
  CreditNoteView,
  InvoiceDetailView,
  InvoiceLineView,
  FundingResult,
  FundStopInput,
  InvoiceFilters,
  InvoiceType,
  InvoiceView,
  JournalView,
  ManualJournalLineInput,
  ManualInvoiceKitItemInput,
  ManualInvoiceLineInput,
  PaymentView,
  ProfitAndLossView,
  RecordPaymentInput,
  TrialBalanceView,
} from "./contract";

const api: FinanceApi = financeApiHttp;

export const getInvoices = api.getInvoices.bind(api);
export const getAgingReport = api.getAgingReport.bind(api);
export const getPayments = api.getPayments.bind(api);
export const getOpenInvoices = api.getOpenInvoices.bind(api);
export const createManualInvoice = api.createManualInvoice.bind(api);
export const submitPayment = api.submitPayment.bind(api);
export const submitAllocation = api.submitAllocation.bind(api);
export const submitPaymentDecision = api.submitPaymentDecision.bind(api);
export const getOutletReceipts = api.getOutletReceipts.bind(api);
export const fundDistributionStop = api.fundDistributionStop.bind(api);
export const releaseDistributionStop = api.releaseDistributionStop.bind(api);
export const submitCreditNote = api.submitCreditNote.bind(api);
export const getCreditNotes = api.getCreditNotes.bind(api);
export const applyCreditNote = api.applyCreditNote.bind(api);
export const cancelCreditNote = api.cancelCreditNote.bind(api);
export const getInvoice = api.getInvoice.bind(api);
export const voidInvoice = api.voidInvoice.bind(api);
export { CREDIT_NOTE_REASONS } from "./contract";
export const getJournals = api.getJournals.bind(api);
export const createManualJournal = api.createManualJournal.bind(api);
export const reverseJournal = api.reverseJournal.bind(api);
export const getTrialBalance = api.getTrialBalance.bind(api);
export const getProfitAndLoss = api.getProfitAndLoss.bind(api);
export const getChartOfAccounts = api.getChartOfAccounts.bind(api);
export const createAccount = api.createAccount.bind(api);
export const upgradeChart = api.upgradeChart.bind(api);

export async function exportAging(): Promise<number> {
  const report = await getAgingReport();
  const columns: ExcelColumn<AgingRow>[] = [
    { header: outletLabelTitle(), value: (r) => r.outlet, width: 26 },
    { header: "Termin (hari)", value: (r) => r.termin, type: "number", width: 12 },
    { header: "Plafon", value: (r) => r.batasKredit, type: "currency", width: 16 },
    ...report.buckets.map((b) => ({
      header: b,
      value: (r: AgingRow) => r.buckets[b] ?? 0,
      type: "currency" as const,
      width: 16,
    })),
    { header: "Total piutang", value: (r) => r.total, type: "currency", width: 18 },
    { header: "Jatuh tempo", value: (r) => r.jatuhTempo, type: "currency", width: 18 },
    { header: "Diblokir", value: (r) => (r.terblokir ? "Ya" : "Tidak"), width: 10 },
  ];
  exportExcel(`umur-piutang-${timestampSuffix()}`, "Umur Piutang", columns, report.rows);
  return report.rows.length;
}
