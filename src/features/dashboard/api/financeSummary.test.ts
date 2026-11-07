import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAllPages, getOne } = vi.hoisted(() => ({ getAllPages: vi.fn(), getOne: vi.fn() }));
vi.mock("@/lib/api", () => ({ getAllPages, getOne, send: vi.fn() }));
import { financeSummaryHttp } from "./financeSummary.http";
import { reportRangeFromParam, resolveRange } from "@/features/reports/api/contract";

const window = { from: "2026-09-01", to: "2026-09-18" };
const windowFilters = (field: string) => [
  { field, operator: "gte", value: "2026-09-01" },
  { field, operator: "lt", value: "2026-09-19" },
];

beforeEach(() => { getAllPages.mockReset(); getOne.mockReset(); });

describe("dashboard financial totals", () => {
  // Regression 2026-11-02: these totals were the newest 100 rows windowed in
  // the browser, so a busy month could only ever read "incomplete".
  it("asks the server for verified cash inside the window, through every page", async () => {
    getAllPages.mockResolvedValue({ truncated: false, items: [{ amount: 10 }, { amount: 20 }] });
    expect(await financeSummaryHttp.getVerifiedCash(window)).toEqual({ complete: true, amount: 30 });
    expect(getAllPages).toHaveBeenCalledWith("/payments", expect.objectContaining({
      filters: [{ field: "payment_status", operator: "eq", value: "verified" }, ...windowFilters("payment_date")],
    }));
  });

  it("sums remaining balances of the window's invoices, ignoring credit balances", async () => {
    getAllPages.mockResolvedValue({ truncated: false, items: [
      { outstanding_amount: 40 }, { outstanding_amount: 60 }, { outstanding_amount: -10 },
    ] });
    expect(await financeSummaryHttp.getMonthlyReceivables(window)).toEqual({ complete: true, amount: 100 });
    expect(getAllPages).toHaveBeenCalledWith("/invoices", expect.objectContaining({
      filters: windowFilters("issued_at"),
    }));
  });

  it("suppresses totals when the walk stopped at the page ceiling", async () => {
    getAllPages.mockResolvedValue({ truncated: true, items: [{ amount: 1, outstanding_amount: 1 }] });
    expect(await financeSummaryHttp.getVerifiedCash(window)).toEqual({ complete: false, amount: null });
    expect(await financeSummaryHttp.getMonthlyReceivables(window)).toEqual({ complete: false, amount: null });
  });

  it("returns a genuine zero for a complete empty list", async () => {
    getAllPages.mockResolvedValue({ truncated: false, items: [] });
    expect(await financeSummaryHttp.getVerifiedCash(window)).toEqual({ complete: true, amount: 0 });
  });

  it("reads gross margin off the trial balance without requesting the account catalogue", async () => {
    const row = (code: string, type: string, debit: number, credit: number, role?: string) => ({
      account_id: code, account_code: code, account_name: code, account_type: type, account_role: role,
      opening_debit: 0, opening_credit: 0, debit, credit, closing_debit: 0, closing_credit: 0,
    });
    getOne.mockResolvedValue({
      rows: [
        row("4-1000", "revenue", 0, 1_000),
        row("5-1000", "expense", 1_100, 0, "cogs"),
        // Operating expense: lowers net income, not gross margin.
        row("5-3100", "expense", 300, 0),
      ],
      totals: { opening_debit: 0, opening_credit: 0, debit: 0, credit: 0, closing_debit: 0, closing_credit: 0 },
      balanced: true,
    });
    expect(await financeSummaryHttp.getGrossMargin(window)).toEqual({ complete: true, amount: -100 });
    expect(getOne).toHaveBeenCalledWith("/financial-statements/trial-balance?date_from=2026-09-01&date_to=2026-09-18");
    expect(getAllPages).not.toHaveBeenCalled();
  });

  it("propagates request failures instead of supplying zero", async () => {
    getAllPages.mockRejectedValue(new Error("unavailable"));
    await expect(financeSummaryHttp.getVerifiedCash(window)).rejects.toThrow("unavailable");
    await expect(financeSummaryHttp.getMonthlyReceivables(window)).rejects.toThrow("unavailable");
  });
});

describe("report range navigation", () => {
  it.each(["hari-ini", "7h", "30h", "bulan-ini", "bulan-lalu"])("accepts %s", (value) => {
    expect(reportRangeFromParam(value)).toBe(value);
  });
  it.each([null, "", "unknown", "constructor", "__proto__"])("defaults invalid value %s to 30h", (value) => {
    expect(reportRangeFromParam(value)).toBe("30h");
  });
  it("resolves month-to-date using calendar boundaries", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 8, 18, 12));
      expect(resolveRange("bulan-ini")).toEqual(window);
      vi.setSystemTime(new Date(2026, 9, 1, 12));
      expect(resolveRange("bulan-ini")).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    } finally { vi.useRealTimers(); }
  });
});
