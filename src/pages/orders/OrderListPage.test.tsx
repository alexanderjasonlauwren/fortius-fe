// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ manual: false, pending: false, error: false, plans: vi.fn(), outlets: vi.fn(), orders: vi.fn() }));
vi.mock("@/lib/scope", () => ({ scopeKey: () => ["tenant", "branch"] }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/features/distribution/hooks/useIntakePolicy", () => ({ useIntakePolicy: () => ({ allowsManualIntake: state.manual, isPending: state.pending, isError: state.error, refetch: vi.fn() }) }));
vi.mock("@/features/orders/api/orderApi", () => ({
  getOrders: state.orders, getOrderTotals: async () => ({ baru: 1, baruUnit: 50 }), getSchedulablePlans: state.plans,
  approveOrder: vi.fn(), approveOrderBatch: vi.fn(), createOrder: vi.fn(), declineOrder: vi.fn(), exportOrders: vi.fn(), addOrdersToPlan: vi.fn(),
}));
vi.mock("@/features/distribution/api/distributionApi", () => ({ getOutletOptions: state.outlets }));
import { OrderListPage } from "./OrderListPage";
beforeEach(() => {
  state.manual = false; state.pending = false; state.error = false;
  state.plans.mockReset().mockResolvedValue([]); state.outlets.mockReset().mockResolvedValue([]);
  state.orders.mockReset().mockResolvedValue([{ id: "order", kode: "ORD-HISTORY", status: "Baru", outletId: "outlet", outlet: "Pangkalan A", kecamatan: "Salatiga", jumlahUnit: 50, sisaKuotaOutlet: 100, tanggalMasuk: "2026-09-18T00:00:00Z", tanggalDiminta: "2026-09-19" }]);
});
afterEach(cleanup);
function setup() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><MemoryRouter><OrderListPage /></MemoryRouter></QueryClientProvider>); }
describe("order deep-link history", () => {
  it.each(["external", "loading", "failed"])("keeps historical reads but removes manual mutation controls for %s policy", async (status) => {
    state.pending = status === "loading"; state.error = status === "failed";
    setup();
    expect(await screen.findByText("ORD-HISTORY")).toBeTruthy();
    expect(screen.getByText(/Histori Pesanan/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Catat pesanan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Setujui" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tolak" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(state.plans).not.toHaveBeenCalled(); expect(state.outlets).not.toHaveBeenCalled();
  });
  it("preserves existing manual controls only after manual policy is confirmed", async () => {
    state.manual = true; setup();
    expect(await screen.findByRole("button", { name: "Setujui" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Catat pesanan" })).toBeTruthy();
    await waitFor(() => expect(state.plans).toHaveBeenCalledOnce());
  });
});
