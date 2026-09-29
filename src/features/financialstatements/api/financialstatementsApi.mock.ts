/**
 * Generated financial statements, against the mock database -- computed by
 * this feature's own engine (lib/engine.ts), which is a line-for-line port
 * of fortius-backend's internal/usecase/financialstatement engine.go.
 * Financial-statements plan, phase P2.
 */
import { scopedDb } from "@/mocks/scope";
import { latency } from "@/mocks/db";
import { exportExcel, timestampSuffix, type ExcelColumn } from "@/lib/export";
import type {
  BalanceSheetStatement,
  FinancialStatementsApi,
  GeneralLedgerPage,
  NotesStatement,
  ProfitAndLossStatement,
} from "./contract";
import { computeBalanceSheet, computeGeneralLedger, computeNotes, computeProfitAndLoss } from "../lib/engine";
import { defaultLayout, layoutByCode } from "../lib/layouts";

async function getProfitAndLoss(input: { from: string; to: string; layout?: string; branchId?: string }): Promise<ProfitAndLossStatement> {
  await latency("read");
  const layout = (input.layout && layoutByCode(input.layout)) || defaultLayout("profit_loss");
  return computeProfitAndLoss(scopedDb(), input.from, input.to, layout, input.branchId);
}

async function getBalanceSheet(input: { asOf: string; layout?: string; branchId?: string }): Promise<BalanceSheetStatement> {
  await latency("read");
  const layout = (input.layout && layoutByCode(input.layout)) || defaultLayout("balance_sheet");
  return computeBalanceSheet(scopedDb(), input.asOf, layout, input.branchId);
}

async function getBalanceSheetNotes(input: { asOf: string; layout?: string }): Promise<NotesStatement> {
  await latency("read");
  const layout = (input.layout && layoutByCode(input.layout)) || defaultLayout("balance_sheet");
  return computeNotes(scopedDb(), input.asOf, layout);
}

async function getGeneralLedger(input: {
  accountId: string;
  from: string;
  to: string;
  limit?: number;
  offset?: number;
}): Promise<GeneralLedgerPage> {
  await latency("read");
  return computeGeneralLedger(scopedDb(), input.accountId, input.from, input.to, input.limit, input.offset);
}

interface ExportRow {
  seksi: string;
  kode: string;
  label: string;
  jumlah: number | null;
}

/**
 * One consolidated sheet rather than the backend's own three -- exportExcel
 * (src/lib/export.ts) writes a single worksheet per call, and the mock
 * build has never needed more than one; the real workbook (three sheets,
 * the Neraca laid out two columns wide as on the PDF) is
 * internal/usecase/financialstatement/xlsx.go's own job.
 */
async function downloadPackage(input: {
  fiscalYear?: number;
  dateFrom?: string;
  dateTo?: string;
  asOf?: string;
  branchId?: string;
}): Promise<void> {
  await latency("read");
  const from = input.fiscalYear ? `${input.fiscalYear}-01-01` : (input.dateFrom ?? "0001-01-01");
  const to = input.fiscalYear ? `${input.fiscalYear}-12-31` : (input.dateTo ?? new Date().toISOString().slice(0, 10));
  const asOf = input.asOf ?? to;

  const db = scopedDb();
  const pl = computeProfitAndLoss(db, from, to, defaultLayout("profit_loss"), input.branchId);
  const bs = computeBalanceSheet(db, asOf, defaultLayout("balance_sheet"), input.branchId);
  const notes = computeNotes(db, asOf, defaultLayout("balance_sheet"));

  const rows: ExportRow[] = [
    { seksi: "LABA RUGI", kode: "", label: "", jumlah: null },
    ...pl.lines.map((l) => ({ seksi: "", kode: l.code, label: "  ".repeat(l.level) + l.label, jumlah: l.amount })),
    { seksi: "NERACA", kode: "", label: "", jumlah: null },
    ...bs.lines.map((l) => ({ seksi: "", kode: l.code, label: "  ".repeat(l.level) + l.label, jumlah: l.amount })),
    { seksi: "PENJELASAN AKUN", kode: "", label: "", jumlah: null },
    ...notes.notes.flatMap((n) => [
      { seksi: "", kode: String(n.noteNumber), label: n.label, jumlah: n.total },
      ...n.leaves.map((leaf) => ({ seksi: "", kode: leaf.code, label: "  " + leaf.name, jumlah: leaf.amount })),
    ]),
  ];

  const columns: ExcelColumn<ExportRow>[] = [
    { header: "Bagian", value: (r) => r.seksi, width: 16 },
    { header: "Kode", value: (r) => r.kode, width: 10 },
    { header: "Baris", value: (r) => r.label, width: 40 },
    { header: "Jumlah", value: (r) => r.jumlah, type: "currency", width: 18 },
  ];
  exportExcel(`laporan-keuangan-${timestampSuffix()}`, "Laporan Keuangan", columns, rows);
}

export const financialstatementsApiMock: FinancialStatementsApi = {
  getProfitAndLoss,
  getBalanceSheet,
  getBalanceSheetNotes,
  getGeneralLedger,
  downloadPackage,
};
