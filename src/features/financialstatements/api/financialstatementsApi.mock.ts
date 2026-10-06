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
import {
  mergeExternalCompare,
  mergeExternalNotesCompare,
  mergeOwnCompare,
  mergeOwnNotesCompare,
  parseCompare,
  scopeKeyBS,
  scopeKeyPL,
  shiftBSAsOf,
  shiftPLWindow,
} from "../lib/compare";

async function getProfitAndLoss(input: {
  from: string;
  to: string;
  layout?: string;
  branchId?: string;
  compare?: string;
}): Promise<ProfitAndLossStatement> {
  await latency("read");
  const layout = (input.layout && layoutByCode(input.layout)) || defaultLayout("profit_loss");
  const stmt = computeProfitAndLoss(scopedDb(), input.from, input.to, layout, input.branchId);
  const src = parseCompare(input.compare);
  if (!src) return stmt;
  const scopeKey = scopeKeyPL(input.from, input.to);
  if (src.kind === "external") return mergeExternalCompare(stmt, src.externalId!, scopeKey);
  const [pFrom, pTo] = shiftPLWindow(input.from, input.to, src.kind);
  const compareStmt = computeProfitAndLoss(scopedDb(), pFrom, pTo, layout, input.branchId);
  return mergeOwnCompare(stmt, compareStmt, src.kind, `${pFrom} - ${pTo}`, scopeKey);
}

async function getBalanceSheet(input: {
  asOf: string;
  layout?: string;
  branchId?: string;
  compare?: string;
}): Promise<BalanceSheetStatement> {
  await latency("read");
  const layout = (input.layout && layoutByCode(input.layout)) || defaultLayout("balance_sheet");
  const stmt = computeBalanceSheet(scopedDb(), input.asOf, layout, input.branchId);
  const src = parseCompare(input.compare);
  if (!src) return stmt;
  const scopeKey = scopeKeyBS(input.asOf);
  if (src.kind === "external") return mergeExternalCompare(stmt, src.externalId!, scopeKey);
  const pAsOf = shiftBSAsOf(input.asOf, src.kind);
  const compareStmt = computeBalanceSheet(scopedDb(), pAsOf, layout, input.branchId);
  return mergeOwnCompare(stmt, compareStmt, src.kind, pAsOf, scopeKey);
}

async function getBalanceSheetNotes(input: { asOf: string; layout?: string; compare?: string }): Promise<NotesStatement> {
  await latency("read");
  const layout = (input.layout && layoutByCode(input.layout)) || defaultLayout("balance_sheet");
  const notes = computeNotes(scopedDb(), input.asOf, layout);
  const src = parseCompare(input.compare);
  if (!src) return notes;
  const scopeKey = scopeKeyBS(input.asOf);
  if (src.kind === "external") return mergeExternalNotesCompare(notes, src.externalId!, scopeKey);
  const pAsOf = shiftBSAsOf(input.asOf, src.kind);
  const compareNotes = computeNotes(scopedDb(), pAsOf, layout);
  return mergeOwnNotesCompare(notes, compareNotes, src.kind, pAsOf, scopeKey);
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
  pembanding?: number | null;
  selisih?: number | null;
}

/**
 * One consolidated sheet rather than the backend's own three (or six,
 * with a compare) -- exportExcel (src/lib/export.ts) writes a single
 * worksheet per call, and the mock build has never needed more than one;
 * the real workbook (three or six sheets, the Neraca laid out two columns
 * wide as on the PDF) is internal/usecase/financialstatement/xlsx.go's
 * own job. `compare`, when given, adds a Pembanding/Selisih column to
 * this same sheet rather than three more sheets.
 */
async function downloadPackage(input: {
  fiscalYear?: number;
  dateFrom?: string;
  dateTo?: string;
  asOf?: string;
  branchId?: string;
  compare?: string;
}): Promise<void> {
  await latency("read");
  const from = input.fiscalYear ? `${input.fiscalYear}-01-01` : (input.dateFrom ?? "0001-01-01");
  const to = input.fiscalYear ? `${input.fiscalYear}-12-31` : (input.dateTo ?? new Date().toISOString().slice(0, 10));
  const asOf = input.asOf ?? to;

  const pl = await getProfitAndLoss({ from, to, branchId: input.branchId, compare: input.compare });
  const bs = await getBalanceSheet({ asOf, branchId: input.branchId, compare: input.compare });
  const notes = await getBalanceSheetNotes({ asOf, compare: input.compare });

  const rows: ExportRow[] = [
    { seksi: "LABA RUGI", kode: "", label: "", jumlah: null },
    ...pl.lines.map((l) => ({ seksi: "", kode: l.code, label: "  ".repeat(l.level) + l.label, jumlah: l.amount, pembanding: l.compareAmount ?? null, selisih: l.variance ?? null })),
    { seksi: "NERACA", kode: "", label: "", jumlah: null },
    ...bs.lines.map((l) => ({ seksi: "", kode: l.code, label: "  ".repeat(l.level) + l.label, jumlah: l.amount, pembanding: l.compareAmount ?? null, selisih: l.variance ?? null })),
    { seksi: "PENJELASAN AKUN", kode: "", label: "", jumlah: null },
    ...notes.notes.flatMap((n) => [
      { seksi: "", kode: String(n.noteNumber), label: n.label, jumlah: n.total, pembanding: null, selisih: null },
      ...n.leaves.map((leaf) => ({ seksi: "", kode: leaf.code, label: "  " + leaf.name, jumlah: leaf.amount, pembanding: leaf.compareAmount ?? null, selisih: leaf.variance ?? null })),
    ]),
  ];

  const columns: ExcelColumn<ExportRow>[] = [
    { header: "Bagian", value: (r) => r.seksi, width: 16 },
    { header: "Kode", value: (r) => r.kode, width: 10 },
    { header: "Baris", value: (r) => r.label, width: 40 },
    { header: "Jumlah", value: (r) => r.jumlah, type: "currency", width: 18 },
    ...(input.compare
      ? ([
          { header: "Pembanding", value: (r) => r.pembanding ?? null, type: "currency", width: 18 },
          { header: "Selisih", value: (r) => r.selisih ?? null, type: "currency", width: 18 },
        ] as ExcelColumn<ExportRow>[])
      : []),
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
