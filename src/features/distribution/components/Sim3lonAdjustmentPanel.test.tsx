// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ canApprove: true }));
vi.mock("@/features/auth/store/authStore", () => ({
  useAuthStore: (selector: (s: { hasPermission: (p: string) => boolean }) => unknown) =>
    selector({ hasPermission: (p) => p === "distribution.approve.distribution_orders" && auth.canApprove }),
}));

import { Sim3lonAdjustmentPanel } from "./Sim3lonAdjustmentPanel";
import type { Sim3lonAdjustment } from "../api/sim3lonAdjustment.contract";
import type { DistributionPlan } from "../types";

afterEach(() => {
  cleanup();
  auth.canApprove = true;
});

const plan = {
  id: "plan-1", kode: "RD-SLT-20261123-0001", tanggal: "2026-11-23", status: "Terkonfirmasi",
  sourceManaged: true, topups: [],
} as unknown as DistributionPlan;

// Round 3 R3-2: 360 in SIM3LON, 210 planned, one pangkalan already sent.
const grown: Sim3lonAdjustment = {
  planId: "plan-1", planKode: "RD-SLT-20261123-0001", tanggal: "2026-11-23", state: "adjustable",
  sim3lon: 360, committed: 210, add: 150, reduce: 0, over: 0, fingerprint: "f".repeat(64),
  rows: [
    { outletId: "a", outletCode: "4507001", outletName: "SRI KANAH", sim3lon: 120, committed: 60, sent: 60, add: 60, reduce: 0, over: 0 },
    { outletId: "b", outletCode: "4507002", outletName: "ELIYA", sim3lon: 90, committed: 0, sent: 0, add: 90, reduce: 0, over: 0 },
  ],
};

function show(adjustment: Sim3lonAdjustment, onApply = vi.fn(), onOpenPlan = vi.fn(), shownPlan = plan) {
  render(
    <Sim3lonAdjustmentPanel plan={shownPlan} adjustment={adjustment} isLoading={false} isApplying={false}
      onApply={onApply} onOpenPlan={onOpenPlan} />,
  );
  return { onApply, onOpenPlan };
}

describe("Tambah dari SIM3LON", () => {
  it("says what changed, walks through the steps, and applies exactly what was reviewed", () => {
    const { onApply } = show(grown);
    const banner = screen.getByRole("region", { name: "SIM3LON berubah" });
    expect(banner.textContent).toContain("360");
    expect(banner.textContent).toContain("210");
    expect(banner.textContent).toMatch(/Tambah 150 tabung untuk 2 pangkalan/);
    expect(banner.textContent).toMatch(/Dispatcher menetapkan sopir dan truk/);

    fireEvent.click(screen.getByRole("button", { name: "Tambah dari SIM3LON" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("SRI KANAH")).toBeTruthy();
    expect(within(dialog).getByText("+60")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tambah dari SIM3LON" }));
    expect(onApply).toHaveBeenCalledWith(grown);
  });

  it("is the manager's button: others are told to ask", () => {
    auth.canApprove = false;
    show(grown);
    expect(screen.queryByRole("button", { name: "Tambah dari SIM3LON" })).toBeNull();
    expect(screen.getByText(/Minta manajer menekan Tambah dari SIM3LON/)).toBeTruthy();
  });

  it("offers nothing to press when only what already left exceeds SIM3LON", () => {
    show({ ...grown, state: "over_only", add: 0, over: 30, sim3lon: 180,
      rows: [{ ...grown.rows[0], sim3lon: 30, add: 0, over: 30 }] });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/sudah terkirim melebihi SIM3LON/)).toBeTruthy();
  });

  it("names a decrease Sesuaikan", () => {
    show({ ...grown, add: 0, reduce: 40, rows: [{ ...grown.rows[0], add: 0, reduce: 40 }] });
    expect(screen.getByRole("button", { name: "Sesuaikan dengan SIM3LON" })).toBeTruthy();
  });

  it("links an extra plan and its SIM3LON plan both ways", () => {
    const { onOpenPlan } = show({ ...grown, state: "in_sync", add: 0, rows: [] }, vi.fn(), vi.fn(), {
      ...plan, id: "topup-1", kode: "RD-SLT-20261123-0002", sourceManaged: true,
      topupOf: { id: "plan-1", kode: "RD-SLT-20261123-0001" },
    } as DistributionPlan);
    fireEvent.click(screen.getByRole("button", { name: "RD-SLT-20261123-0001" }));
    expect(onOpenPlan).toHaveBeenCalledWith("plan-1");
  });

  it("stays out of the way when the day matches SIM3LON and there is no extra plan", () => {
    const { container } = render(
      <Sim3lonAdjustmentPanel plan={plan} adjustment={{ ...grown, state: "in_sync", add: 0, rows: [] }}
        isLoading={false} isApplying={false} onApply={vi.fn()} onOpenPlan={vi.fn()} />,
    );
    expect(container.textContent).toBe("");
  });
});
