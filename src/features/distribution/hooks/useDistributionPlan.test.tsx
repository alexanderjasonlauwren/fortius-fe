// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const state = vi.hoisted(() => ({ review: vi.fn(), create: vi.fn(), createSource: vi.fn(), save: vi.fn(), apply: vi.fn(), toast: vi.fn(), plans: [] as unknown[], scope: ["tenant", "branch"], intakeMode: "external_schedule", canAssign: true }));
vi.mock("@/lib/scope", () => ({ scopeKey: () => state.scope }));
vi.mock("@/features/auth/store/authStore", () => ({
  useAuthStore: (selector: (s: { hasPermission: (p: string) => boolean }) => unknown) =>
    selector({ hasPermission: (p) => p === "distribution.assign.distribution_orders" && state.canAssign }),
}));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("./useIntakePolicy", () => ({ useIntakePolicy: () => ({ data: state.intakeMode, allowsManualIntake: state.intakeMode === "manual" }) }));
vi.mock("../api/sourcePlanReview", () => ({ getSourcePlanReview: state.review }));
vi.mock("../api/distributionApi", () => ({
  getPlanList: async () => state.plans,
  getPlan: async () => state.plans[0], getPlanDetail: async () => [],
  getActiveSaOptions: async () => [], getDriverOptions: async () => [], getOutletOptions: async () => [],
  getProductOptions: async () => [], getSAProductOptions: async () => [], getVehicleOptions: async () => [],
  createPlan: state.create, createSourcePlan: state.createSource, saveDraft: state.save, applyAssignment: state.apply, cancelDistributionPlan: vi.fn(),
  confirmPlan: vi.fn(), dispatchTrip: vi.fn(), addApprovedOrders: vi.fn(), printRouteSheet: vi.fn(),
}));
import { toTripAssignments, useDistributionPlan } from "./useDistributionPlan";
const plan = { id: "plan", kode: "RD-1", saId: "sa", branchId: "branch", tanggal: "2026-09-19", status: "Draf", version: 1 };
beforeEach(() => {
  state.plans = [];
  state.canAssign = true;
  state.scope = ["tenant", "branch"];
  state.intakeMode = "external_schedule";
  state.review.mockReset().mockResolvedValue({ status: "no_source", date: plan.tanggal, rows: [], unresolvedRegistrationCodes: [] }); state.create.mockReset(); state.createSource.mockReset(); state.save.mockReset().mockResolvedValue({ ...plan, version: 2 }); state.apply.mockReset().mockResolvedValue(undefined); state.toast.mockReset();
  state.create.mockImplementation(async () => { state.plans = [plan]; return plan; });
  state.createSource.mockImplementation(async () => { state.plans = [plan]; return plan; });
});
afterEach(cleanup);
describe("source-backed plan creation", () => {
  it("does not leave an empty plan when source review fails", async () => {
    state.review.mockRejectedValue(new Error("network"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(useDistributionPlan, { wrapper });
    await act(async () => { await expect(result.current.createPlanMutation.mutateAsync({ tanggal: plan.tanggal, saId: plan.saId })).rejects.toThrow("network"); });
    expect(state.create).not.toHaveBeenCalled();
    expect(state.createSource).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
    expect(result.current.selectedPlanId).toBeNull();
  });

  it("creates a ready external plan through the atomic source endpoint", async () => {
    state.review.mockResolvedValue({ status: "ready", batchId: "batch", branchId: "branch", productId: "product", periodMonth: "2026-09", date: plan.tanggal, rows: [{ outletId: "outlet", outlet: "A", productId: "product", jumlah: 50 }], unresolvedRegistrationCodes: [] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(useDistributionPlan, { wrapper });
    await act(async () => { await result.current.createPlanMutation.mutateAsync({ tanggal: plan.tanggal, saId: plan.saId }); });
    expect(state.createSource).toHaveBeenCalledWith({ batchId: "batch", tanggal: plan.tanggal });
    expect(state.create).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("does not write source rows into a switched tenant after an awaited fetch", async () => {
    state.plans = [plan];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(useDistributionPlan, { wrapper });
    await waitFor(() => expect(result.current.selectedPlan).toBeTruthy());
    state.review.mockImplementation(async () => {
      state.scope = ["other-tenant", "other-branch"];
      return { status: "ready", branchId: "branch", date: plan.tanggal, rows: [], unresolvedRegistrationCodes: [] };
    });
    await act(async () => {
      await expect(result.current.fillSourceMutation.mutateAsync(result.current.selectedPlan!)).rejects.toThrow("Perusahaan yang aktif");
    });
    expect(state.save).not.toHaveBeenCalled();
    expect(state.create).not.toHaveBeenCalled();
  });

  it("does not select or fill a plan whose create resolves after switching tenant", async () => {
    let resolveCreate!: (created: typeof plan) => void;
    state.review.mockResolvedValue({ status: "ready", batchId: "batch", branchId: "branch", productId: "product", periodMonth: "2026-09", date: plan.tanggal, rows: [{ outletId: "outlet", outlet: "A", productId: "product", jumlah: 50 }], unresolvedRegistrationCodes: [] });
    state.createSource.mockImplementation(() => new Promise<typeof plan>((resolve) => {
      resolveCreate = resolve;
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(useDistributionPlan, { wrapper });
    await waitFor(() => expect(result.current.isLoadingList).toBe(false));

    let createPromise!: Promise<unknown>;
    act(() => {
      createPromise = result.current.createPlanMutation.mutateAsync({ tanggal: plan.tanggal, saId: plan.saId });
    });
    await waitFor(() => expect(result.current.createPlanMutation.isPending).toBe(true));

    state.scope = ["other-tenant", "other-branch"];
    rerender();
    await act(async () => {
      resolveCreate(plan);
      await expect(createPromise).rejects.toThrow("Perusahaan yang aktif");
    });

    expect(result.current.selectedPlanId).toBeNull();
    expect(state.review).toHaveBeenCalledOnce();
    expect(state.save).not.toHaveBeenCalled();
  });

  it("binds assignment to the plan version returned by its own draft save", async () => {
    state.plans = [plan];
    let resolveSave!: (saved: typeof plan) => void;
    state.save.mockImplementation(() => new Promise<typeof plan>((resolve) => {
      resolveSave = resolve;
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(useDistributionPlan, { wrapper });
    await waitFor(() => expect(result.current.selectedPlan?.id).toBe(plan.id));

    const rows = [{
      id: "row-a", outletId: "outlet-a", outlet: "A", alamat: "Alamat A",
      lines: [{ productId: "product", jumlah: 10 }], jumlahUnit: 10,
      driverId: "driver-a", driver: "Driver A", vehicleId: "vehicle-a", vehicle: "Truck A",
      jamPengiriman: "08:00", tripNo: 1, statusBayar: "Belum Lunas" as const,
      sisaKuotaOutlet: 0, piutang: 0, piutangJatuhTempo: 0,
    }];
    let savePromise!: Promise<unknown>;
    act(() => {
      savePromise = result.current.saveDraftMutation.mutateAsync({ planId: plan.id, rows, version: 1 });
    });
    await waitFor(() => expect(state.save).toHaveBeenCalledWith(plan.id, rows, 1));

    const otherPlan = { ...plan, id: "other-plan", kode: "RD-2", version: 9 };
    state.plans = [otherPlan];
    act(() => result.current.setSelectedPlanId(otherPlan.id));
    rerender();
    await act(async () => {
      resolveSave({ ...plan, version: 2 });
      await savePromise;
    });

    expect(state.apply).toHaveBeenCalledWith(
      plan.id,
      [{ driverId: "driver-a", vehicleId: "vehicle-a", tripNo: 1, stops: [{ outletId: "outlet-a", sequenceNo: 1 }] }],
      2,
    );
  });

  // Without the assign permission the crew pickers are read-only, so the
  // save sends only the stops: an assignment call would be refused after the
  // stops had been written and report the whole save as failed.
  it("saves only the stops for a user who may not assign the crew", async () => {
    state.canAssign = false;
    state.plans = [plan];
    state.save.mockResolvedValue({ ...plan, version: 2 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(useDistributionPlan, { wrapper });
    await waitFor(() => expect(result.current.selectedPlan?.id).toBe(plan.id));

    const rows = [{
      id: "row-a", outletId: "outlet-a", outlet: "A", alamat: "Alamat A",
      lines: [{ productId: "product", jumlah: 10 }], jumlahUnit: 10,
      driverId: "driver-a", driver: "Driver A", vehicleId: "vehicle-a", vehicle: "Truck A",
      jamPengiriman: "08:00", tripNo: 1, statusBayar: "Belum Lunas" as const,
      sisaKuotaOutlet: 0, piutang: 0, piutangJatuhTempo: 0,
    }];
    await act(async () => {
      await result.current.saveDraftMutation.mutateAsync({ planId: plan.id, rows, version: 1 });
    });

    expect(state.save).toHaveBeenCalled();
    expect(state.apply).not.toHaveBeenCalled();
  });
});

describe("toTripAssignments", () => {
  function stopRow(id: string, urutan: number | null) {
    return {
      id, outletId: id, outlet: id, alamat: "—",
      lines: [], jumlahUnit: 30,
      driverId: "driver-a", driver: "Driver A", vehicleId: "vehicle-a", vehicle: "Truck A",
      jamPengiriman: "—", tripNo: 1, urutan,
      statusBayar: "Lunas" as const, sisaKuotaOutlet: 0, piutang: 0, piutangJatuhTempo: 0,
    };
  }

  it("numbers each run in urutan order, not array order", () => {
    // Array order is A, B, C; urutan says B, C, A -- the array order used to
    // be exactly what was sent, which is how a saved board ended up
    // alphabetical instead of matching what the optimizer or the dispatcher
    // arranged.
    const rows = [stopRow("a", 3), stopRow("b", 1), stopRow("c", 2)];

    const trips = toTripAssignments(rows);

    expect(trips).toHaveLength(1);
    expect(trips[0].stops).toEqual([
      { outletId: "b", sequenceNo: 1 },
      { outletId: "c", sequenceNo: 2 },
      { outletId: "a", sequenceNo: 3 },
    ]);
  });

  it("puts a stop with no position last", () => {
    const rows = [stopRow("a", null), stopRow("b", 1)];

    const trips = toTripAssignments(rows);

    expect(trips[0].stops.map((s) => s.outletId)).toEqual(["b", "a"]);
  });
});
