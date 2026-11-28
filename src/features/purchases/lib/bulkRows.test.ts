import { describe, expect, it } from "vitest";
import { billCount, lineAmount, nextBulkRow, rowProblems, violationsByRow } from "./bulkRows";

describe("the bulk purchase table", () => {
  it("copies Tanggal and Vendor from the row above, and starts blank otherwise", () => {
    const first = nextBulkRow(undefined, "2026-11-26");
    expect(first).toMatchObject({ date: "2026-11-26", supplierId: "", quantity: 0 });
    const second = nextBulkRow({ ...first, date: "2026-11-16", supplierId: "v-1", productId: "p-1", quantity: 560 }, "2026-11-26");
    expect(second).toMatchObject({ date: "2026-11-16", supplierId: "v-1", productId: "", quantity: 0 });
    expect(second.key).not.toBe(first.key);
  });

  it("rounds a line to the cent as the server does", () => {
    expect(lineAmount(560, 11584.4594)).toBe(6487297.26);
    expect(lineAmount(360, 11584.4594)).toBe(4170405.38);
  });

  it("names what a row still lacks", () => {
    const row = { ...nextBulkRow(undefined, "2026-11-26"), kind: "account" as const };
    expect(Object.keys(rowProblems(row)).sort()).toEqual(["account_id", "description", "quantity", "supplier_id", "unit_cost"]);
    expect(rowProblems({ ...row, supplierId: "v", accountId: "a", description: "BBM", quantity: 1, unitCost: 5000 })).toEqual({});
  });

  it("puts the server's rows[i].field refusals back on their rows", () => {
    const byRow = violationsByRow([
      { field: "rows[1].supplier_id", rule: "exists", message: "Vendor tidak ditemukan" },
      { field: "rows[3].account_id", rule: "line", message: "Akun kontrol" },
      { field: "rows[3].description", rule: "required", message: "Perlu keterangan" },
      { field: "branch_id", rule: "required", message: "x" },
    ]);
    expect([...byRow.keys()]).toEqual([1, 3]);
    expect(byRow.get(3)).toEqual({ account_id: "Akun kontrol", description: "Perlu keterangan" });
  });

  it("counts one bill per date, vendor and vendor invoice number", () => {
    const base = nextBulkRow(undefined, "2026-11-16");
    expect(billCount([
      { ...base, supplierId: "v" }, { ...base, supplierId: "v" },
      { ...base, supplierId: "v", date: "2026-11-17" }, { ...base, supplierId: "w" },
    ])).toBe(3);
  });
});
