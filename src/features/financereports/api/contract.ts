/**
 * The report pack (accounting parity P5): Arus Kas, Perubahan Modal, aging,
 * sales, purchases, expenses, kas & bank and asset summaries.
 *
 * Every report comes back in one shape -- columns, rows and tie-out checks
 * -- so one table renders, prints and exports all of them. Mirrors
 * fortius-backend's internal/entities/financialstatement Report*.
 */

export type ReportCategory = "ikhtisar" | "penjualan" | "pembelian" | "biaya" | "kas_bank" | "aset" | "persediaan";

export interface ReportDefinition {
  key: string;
  title: string;
  category: ReportCategory;
  description: string;
  /** "range" takes a from/to window, "as_of" one date. */
  periodKind: "range" | "as_of";
  /** Whether a branch filter applies. */
  branched: boolean;
  /** What else it needs: "product" for Kartu Stok. */
  params: string[];
}

export type ReportColumnKind = "text" | "money" | "number" | "percent" | "date";

export interface ReportColumn {
  key: string;
  label: string;
  kind: ReportColumnKind;
}

/** Where a row drills down to. */
export interface ReportLink {
  type: "invoice" | "purchase" | "outlet" | "supplier" | "account" | "claim" | "asset" | "product";
  id: string;
}

export interface ReportRow {
  kind: "section" | "line" | "subtotal" | "total";
  level: number;
  cells: Record<string, string | number | undefined>;
  link?: ReportLink;
}

/** A total the report computed set against the ledger figure it must equal. */
export interface ReportCheck {
  label: string;
  expected: number;
  actual: number;
  ok: boolean;
}

export interface Report {
  key: string;
  title: string;
  period: { from?: string; to?: string; asOf?: string };
  company: { legalName: string };
  columns: ReportColumn[];
  rows: ReportRow[];
  checks: ReportCheck[];
  notes: string[];
}

export interface ReportQuery {
  from?: string;
  to?: string;
  asOf?: string;
  branchId?: string;
  productId?: string;
}

export interface FinanceReportsApi {
  getCatalogue(): Promise<ReportDefinition[]>;
  getReport(key: string, query: ReportQuery): Promise<Report>;
  downloadReport(key: string, query: ReportQuery): Promise<void>;
}

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  ikhtisar: "Ikhtisar Bisnis",
  penjualan: "Penjualan",
  pembelian: "Pembelian",
  biaya: "Biaya",
  kas_bank: "Kas & Bank",
  aset: "Aset",
  persediaan: "Persediaan",
};

export const CATEGORY_ORDER: ReportCategory[] = ["ikhtisar", "penjualan", "pembelian", "biaya", "persediaan", "kas_bank", "aset"];
