import { describe, expect, it } from "vitest";
import type { Report } from "@/features/financereports/api/financereportsApi";
import type { StatementLine } from "@/features/financialstatements/api/financialstatementsApi";
import { addDaysIso, agingSplit, monthWindows, profitSummary, reportTotal } from "./summary";

const report = (cells: Record<string, number>): Report => ({
  key: "k", title: "t", period: {}, company: { legalName: "PT" }, columns: [], checks: [], notes: [],
  rows: [
    { kind: "line", level: 1, cells: { total: 999, current: 999 } },
    { kind: "total", level: 0, cells },
  ],
});

const line = (code: string, amount: number): StatementLine => ({
  code, label: code, kind: "subtotal", parentCode: null, level: 0, isBold: true,
  noteNumber: null, amount, ratio: null, accounts: [],
});

describe("dashboard figures", () => {
  it("read a report's grand total, never a line", () => {
    expect(reportTotal(report({ closing: 50 }), "closing")).toBe(50);
    expect(reportTotal(undefined, "closing")).toBe(0);
  });

  it("split aging into not yet due and past due", () => {
    const s = agingSplit(report({ total: 2_700_000, current: 1_500_000, d61_90: 1_200_000 }));
    expect(s).toMatchObject({ total: 2_700_000, current: 1_500_000, overdue: 1_200_000 });
    expect(s.buckets.map((b) => b.amount)).toEqual([1_500_000, 0, 0, 1_200_000, 0]);
  });

  it("read the Laba Rugi by line code, costs as positive, a missing line as unknown", () => {
    const s = profitSummary([
      line("total_pendapatan", 3_500_000), line("hpp", -1_000_000), line("laba_kotor", 2_500_000),
      line("total_biaya_operasional", -600_000), line("laba_bersih", 1_900_000),
    ]);
    expect(s).toEqual({ pendapatan: 3_500_000, hpp: 1_000_000, labaKotor: 2_500_000, biayaOperasional: 600_000, ebitda: null, labaBersih: 1_900_000 });
  });

  it("window twelve months back across a year end, the current month running to today", () => {
    const w = monthWindows("2026-02-10", 12);
    expect(w).toHaveLength(12);
    expect(w[0]).toEqual({ from: "2025-03-01", to: "2025-03-31", label: "Mar 25" });
    expect(w[10]).toEqual({ from: "2026-01-01", to: "2026-01-31", label: "Jan 26" });
    expect(w[11]).toEqual({ from: "2026-02-01", to: "2026-02-10", label: "Feb 26" });
    expect(monthWindows("2024-03-05", 2)[0].to).toBe("2024-02-29");
  });

  it("add days across a month end", () => {
    expect(addDaysIso("2026-10-28", 7)).toBe("2026-11-04");
  });
});
