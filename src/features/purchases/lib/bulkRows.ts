/**
 * The "Input banyak" table (partner doc C8): many bill lines at once, each
 * with its own date, vendor and Keterangan. Rows sharing date, vendor and
 * vendor invoice number become one bill on the server.
 */
import type { Violation } from "@/lib/api";

export interface BulkRow {
  key: number;
  date: string;
  supplierId: string;
  vendorInvoiceNumber: string;
  kind: "product" | "account";
  productId: string;
  accountId: string;
  quantity: number;
  unitCost: number;
  description: string;
}

let keySeq = 0;

/** A new row; it copies Tanggal and Vendor from the row above it. */
export function nextBulkRow(above: BulkRow | undefined, today: string): BulkRow {
  keySeq += 1;
  return {
    key: keySeq,
    date: above?.date ?? today,
    supplierId: above?.supplierId ?? "",
    vendorInvoiceNumber: above?.vendorInvoiceNumber ?? "",
    kind: above?.kind ?? "product",
    productId: "",
    accountId: "",
    quantity: 0,
    unitCost: 0,
    description: "",
  };
}

/** A line's amount, rounded to the cent as the server rounds it. */
export function lineAmount(quantity: number, unitCost: number): number {
  return Math.round(quantity * unitCost * 100) / 100;
}

/** What is still missing on a row, by field; empty means it can be sent. */
export function rowProblems(row: BulkRow): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!row.date) problems.date = "Isi tanggal";
  if (!row.supplierId) problems.supplier_id = "Pilih vendor";
  if (row.kind === "product" && !row.productId) problems.product_id = "Pilih produk";
  if (row.kind === "account" && !row.accountId) problems.account_id = "Pilih akun";
  if (row.kind === "account" && !row.description.trim()) problems.description = "Baris akun perlu keterangan";
  if (!(row.quantity > 0)) problems.quantity = "Qty harus lebih dari 0";
  if (!(row.unitCost > 0)) problems.unit_cost = "Harga harus lebih dari 0";
  return problems;
}

/** The server's `rows[i].field` violations, grouped by row index. */
export function violationsByRow(violations: Violation[]): Map<number, Record<string, string>> {
  const byRow = new Map<number, Record<string, string>>();
  for (const v of violations) {
    const match = /^rows\[(\d+)\]\.(\w+)$/.exec(v.field);
    if (!match) continue;
    const index = Number(match[1]);
    byRow.set(index, { ...byRow.get(index), [match[2]]: v.message });
  }
  return byRow;
}

/** How many bills the rows will make: one per date, vendor and invoice number. */
export function billCount(rows: BulkRow[]): number {
  return new Set(rows.map((r) => `${r.date}|${r.supplierId}|${r.vendorInvoiceNumber.trim()}`)).size;
}
