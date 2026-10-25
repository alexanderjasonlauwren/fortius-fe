import { beforeEach, describe, expect, it, vi } from "vitest";

const { getList, getOne } = vi.hoisted(() => ({ getList: vi.fn(), getOne: vi.fn() }));
vi.mock("@/lib/api", () => ({ getList, getOne, send: vi.fn() }));
import { financeSummaryHttp } from "./financeSummary.http";
import { reportRangeFromParam, resolveRange } from "@/features/reports/api/contract";

const window = { from: "2026-09-01", to: "2026-09-18" };
const pagination = { has_next: false, has_prev: false, page: 1, page_size: 100 };

beforeEach(() => { getList.mockReset(); getOne.mockReset(); });

describe("dashboard financial totals", () => {
  it("includes verified cash at both month-to-date boundaries only", async () => {
    getList.mockResolvedValue({ pagination, items: [
      { amount: 10, payment_date: "2026-09-01T00:00:00+07:00", payment_status: "verified" },
      { amount: 20, payment_date: "2026-09-18", payment_status: "verified" },
      { amount: 50, payment_date: "2026-08-31", payment_status: "verified" },
      { amount: 50, payment_date: "2026-09-19", payment_status: "verified" },
      { amount: 50, payment_date: "2026-09-02", payment_status: "pending" },
    ] });
    expect(await financeSummaryHttp.getVerifiedCash(window)).toEqual({ complete: true, amount: 30 });
    expect(getList).toHaveBeenCalledWith("/payments", expect.objectContaining({
      filters: [{ field: "payment_status", operator: "eq", value: "verified" }],
    }));
  });

  it("uses remaining balances for this month's invoices, excluding older debt", async () => {
    getList.mockResolvedValue({ pagination, items: [
      { issued_at: "2026-09-01", outstanding_amount: 40 },
      { issued_at: "2026-09-18", outstanding_amount: 60 },
      { issued_at: "2026-08-31", outstanding_amount: 500 },
      { issued_at: "2026-09-02", outstanding_amount: -10 },
    ] });
    expect(await financeSummaryHttp.getMonthlyReceivables(window)).toEqual({ complete: true, amount: 100 });
    expect(getList).toHaveBeenCalledTimes(1);
  });

  it.each([
    { has_next: true }, { total_items: 101 }, { total_pages: 2 }, { total_is_floor: true },
  ])("suppresses totals when pagination indicates omitted records: %j", async (metadata) => {
    getList.mockResolvedValue({ pagination: { ...pagination, ...metadata }, items: [] });
    expect(await financeSummaryHttp.getVerifiedCash(window)).toEqual({ complete: false, amount: null });
    expect(await financeSummaryHttp.getMonthlyReceivables(window)).toEqual({ complete: false, amount: null });
  });

  it("returns a genuine zero for a complete empty list", async () => {
    getList.mockResolvedValue({ pagination, items: [] });
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
    expect(getList).not.toHaveBeenCalled();
  });

  it("propagates request failures instead of supplying zero", async () => {
    getList.mockRejectedValue(new Error("unavailable"));
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
