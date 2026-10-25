// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@/features/rbac/permissions";

const state = vi.hoisted(() => ({
  permissions: [] as string[], scope: ["tenant-a", "branch-a"],
  cash: vi.fn(), receivables: vi.fn(), margin: vi.fn(), report: vi.fn(),
}));
vi.mock("@/features/auth/store/authStore", () => ({
  useAuthStore: (selector: (store: { hasPermission: (permission: string) => boolean }) => unknown) =>
    selector({ hasPermission: (permission) => state.permissions.includes(permission) }),
}));
vi.mock("@/lib/scope", () => ({ scopeKey: () => state.scope }));
vi.mock("../api/financeSummary", () => ({
  getVerifiedCash: state.cash, getMonthlyReceivables: state.receivables, getGrossMargin: state.margin,
}));
vi.mock("@/features/financereports/api/financereportsApi", () => ({ getFinanceReport: state.report }));
import { useFinanceSummary } from "../hooks/useFinanceSummary";
import { FinanceSummary } from "./FinanceSummary";

function Harness() {
  const summary = useFinanceSummary();
  return <><button onClick={summary.refetch}>Refresh summary</button><FinanceSummary summary={summary} /></>;
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = <QueryClientProvider client={client}><MemoryRouter><Harness /></MemoryRouter></QueryClientProvider>;
  return { ...render(tree), client };
}

beforeEach(() => {
  state.permissions = [];
  state.scope = ["tenant-a", "branch-a"];
  state.cash.mockReset().mockResolvedValue({ complete: true, amount: 1000 });
  state.receivables.mockReset().mockResolvedValue({ complete: true, amount: 2000 });
  state.margin.mockReset().mockResolvedValue({ complete: true, amount: 3000 });
  // A report's grand-total row, as the report pack returns it.
  state.report.mockReset().mockImplementation(async (key: string) => ({
    rows: [{
      kind: "total", level: 0,
      cells: key === "bank_summary" ? { closing: 50_600_000 }
        : key === "ar_aging" ? { total: 2_700_000, current: 1_500_000 }
        : { total: 400_000, current: 0 },
    }],
  }));
});
afterEach(cleanup);

describe("Beranda financial summary", () => {
  it("reads today's position off the reports when the report pack is granted, and drops the capped figures", async () => {
    state.permissions = [PERMISSIONS.FINANCE_REPORTS_VIEW, PERMISSIONS.FINANCIAL_STATEMENTS_VIEW, PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.INVOICES_VIEW];
    setup();
    await waitFor(() => expect(screen.getByTitle("Rp 50.600.000")).toBeTruthy());
    // Piutang past due = total - not yet due; hutang due within a week is
    // aged as of a week ahead.
    expect(screen.getByTitle("Rp 1.200.000")).toBeTruthy();
    expect(screen.getByTitle("Rp 400.000")).toBeTruthy();
    const ap = state.report.mock.calls.find((c) => c[0] === "ap_aging")!;
    const ar = state.report.mock.calls.find((c) => c[0] === "ar_aging")!;
    expect(ap[1].asOf > ar[1].asOf).toBe(true);
    expect(state.cash).not.toHaveBeenCalled();
    expect(state.receivables).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /Dasbor keuangan/ }).getAttribute("href")).toBe("/finance-dashboard");
  });

  it("hides the section and never fetches finance without permissions", async () => {
    setup();
    expect(screen.queryByRole("region", { name: "Ringkasan keuangan" })).toBeNull();
    fireEvent.click(screen.getByText("Refresh summary"));
    expect(state.cash).not.toHaveBeenCalled();
    expect(state.receivables).not.toHaveBeenCalled();
    expect(state.margin).not.toHaveBeenCalled();
  });

  it("fetches only the permitted card and does not expose an inaccessible report link", async () => {
    state.permissions = [PERMISSIONS.PAYMENTS_VIEW];
    setup();
    await waitFor(() => expect(screen.getByTitle("Rp 1.000")).toBeTruthy());
    expect(screen.queryByText("Piutang bulan berjalan")).toBeNull();
    expect(screen.queryByText("Margin kotor")).toBeNull();
    expect(screen.queryByRole("link", { name: /Lihat laporan/ })).toBeNull();
    expect(state.receivables).not.toHaveBeenCalled();
    expect(state.margin).not.toHaveBeenCalled();
  });

  it("shows all permitted figures and links to the month-to-date report", async () => {
    state.permissions = [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.INVOICES_VIEW, PERMISSIONS.JOURNALS_VIEW];
    setup();
    await waitFor(() => expect(state.margin).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("link", { name: /Lihat laporan/ }).getAttribute("href")).toBe("/reports?range=bulan-ini");
    fireEvent.click(screen.getByText("Refresh summary"));
    await waitFor(() => {
      expect(state.cash).toHaveBeenCalledTimes(2);
      expect(state.receivables).toHaveBeenCalledTimes(2);
      expect(state.margin).toHaveBeenCalledTimes(2);
    });
  });

  it("isolates incomplete and failed cards, allowing retry without replacing them with zero", async () => {
    state.permissions = [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.INVOICES_VIEW];
    state.cash.mockRejectedValueOnce(new Error("network"));
    state.receivables.mockResolvedValue({ complete: false, amount: null });
    setup();
    await screen.findByText("Tidak tersedia");
    expect(await screen.findByText("Data belum lengkap")).toBeTruthy();
    expect(screen.queryByTitle("Rp 0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Coba lagi" }));
    await waitFor(() => expect(state.cash).toHaveBeenCalledTimes(2));
    expect(await screen.findByTitle("Rp 1.000")).toBeTruthy();
  });

  it("does not carry a previous scope's figure into a new tenant or branch", async () => {
    state.permissions = [PERMISSIONS.PAYMENTS_VIEW];
    const view = setup();
    await screen.findByTitle("Rp 1.000");
    state.scope = ["tenant-b", "branch-b"];
    state.cash.mockResolvedValue({ complete: true, amount: 5000 });
    view.rerender(<QueryClientProvider client={view.client}>
      <MemoryRouter><Harness /></MemoryRouter>
    </QueryClientProvider>);
    expect(screen.queryByTitle("Rp 1.000")).toBeNull();
    expect(await screen.findByTitle("Rp 5.000")).toBeTruthy();
  });
});
