// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { SIM3LONReconciliationPreview } from "../types";

const state = vi.hoisted(() => ({
  apply: vi.fn(),
  preview: vi.fn(),
  reconciliation: vi.fn(),
  scope: ["tenant-a", "branch-a"],
  toast: vi.fn(),
}));

vi.mock("@/lib/scope", () => ({ scopeKey: () => state.scope }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock("../api/saApi", () => ({
  applySIM3LON: state.apply,
  getSIM3LONReconciliation: state.reconciliation,
  previewSIM3LON: state.preview,
}));

import { buildSIM3LONApplyReview, useSIM3LONImport } from "./useSIM3LONImport";

const review: SIM3LONReconciliationPreview = {
  candidateBatchId: "batch-candidate",
  expectedPredecessorBatchId: "batch-predecessor",
  sourceCreatedAt: "2026-09-20T01:02:03Z",
  reviewReady: true,
  planningStartDate: null,
  openingBalanceDelta: 0,
  varianceCount: 0,
  expectedPlanVersions: [
    { planId: "draft-changed", version: 7, status: "draft" },
    { planId: "draft-unchanged", version: 3, status: "draft" },
    { planId: "confirmed-changed", version: 9, status: "confirmed" },
  ],
  changes: [
    {
      planId: "draft-changed",
      outletId: "outlet-a",
      productId: "product-a",
      operationalDate: "2026-09-21",
      baselineQty: 100,
      currentQty: 100,
      proposedQty: 80,
      classification: "decrease",
      nonDraftDiscrepancy: false,
      crewAssignmentAffected: false,
    },
    {
      planId: "draft-unchanged",
      outletId: "outlet-b",
      productId: "product-a",
      operationalDate: "2026-09-22",
      baselineQty: 50,
      currentQty: 50,
      proposedQty: 50,
      classification: "unchanged",
      nonDraftDiscrepancy: false,
      crewAssignmentAffected: false,
    },
    {
      planId: "confirmed-changed",
      outletId: "outlet-c",
      productId: "product-a",
      operationalDate: "2026-09-23",
      baselineQty: 30,
      currentQty: 30,
      proposedQty: 40,
      classification: "increase",
      nonDraftDiscrepancy: true,
      crewAssignmentAffected: false,
    },
  ],
  blockers: [],
};

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...renderHook(useSIM3LONImport, { wrapper }) };
}

async function loadPreview(result: ReturnType<typeof setup>["result"]) {
  await act(async () => {
    await result.current.previewMutation.mutateAsync({
      file: new File(["xlsx"], "sim3lon.xlsx"),
      supplierName: "Pertamina",
      productId: "product-a",
    });
  });
}

beforeEach(() => {
  state.scope = ["tenant-a", "branch-a"];
  state.apply.mockReset();
  state.preview.mockReset().mockResolvedValue({ id: review.candidateBatchId });
  state.reconciliation.mockReset().mockResolvedValue(review);
  state.toast.mockReset();
});

afterEach(cleanup);

describe("SIM3LON acceptance review", () => {
  it("accepts exactly the changed draft versions identified by the backend", () => {
    expect(buildSIM3LONApplyReview(review)).toEqual({
      expectedPredecessorBatchId: "batch-predecessor",
      acceptedPlans: [{ planId: "draft-changed", expectedVersion: 7 }],
    });
  });

  it("clears stale acceptance and requires an explicit reconciliation reload", async () => {
    const stale = Object.assign(new Error("Rencana berubah"), { code: "STALE_VERSION", status: 409 });
    state.apply.mockRejectedValue(stale);
    const { result } = setup();

    await loadPreview(result);

    await act(async () => {
      await result.current.reconciliationMutation.mutateAsync({
        batchId: review.candidateBatchId,
      });
    });
    expect(result.current.reconciliation).toEqual(review);

    await act(async () => {
      await expect(result.current.applyMutation.mutateAsync({
        batchId: review.candidateBatchId,
        review: buildSIM3LONApplyReview(review),
      })).rejects.toBe(stale);
    });

    expect(result.current.reconciliation).toBeNull();
    expect(result.current.reviewNotice).toMatch(/Muat ulang rekonsiliasi/);

    await act(async () => {
      await result.current.reconciliationMutation.mutateAsync({
        batchId: review.candidateBatchId,
      });
    });
    expect(result.current.reconciliation).toEqual(review);
    expect(result.current.reviewNotice).toBeNull();
    expect(state.apply).toHaveBeenCalledTimes(1);
  });

  it("invalidates only the originating tenant and branch after acceptance", async () => {
    state.apply.mockResolvedValue({
      id: review.candidateBatchId,
      baseAgreementId: "sa-base",
      outletTargetsWritten: 12,
      dailyTargetsWritten: 30,
    });
    const { client, result } = setup();
    const invalidate = vi.spyOn(client, "invalidateQueries");

    await loadPreview(result);
    await act(async () => {
      await result.current.reconciliationMutation.mutateAsync({
        batchId: review.candidateBatchId,
      });
    });

    await act(async () => {
      await result.current.applyMutation.mutateAsync({
        batchId: review.candidateBatchId,
        review: buildSIM3LONApplyReview(review),
      });
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["tenant-a", "branch-a"],
    }));
  });

  it("refuses a stale batch when scope changes between preview and review", async () => {
    const { result } = setup();
    await loadPreview(result);

    state.scope = ["tenant-b", "branch-b"];
    await act(async () => {
      await expect(result.current.reconciliationMutation.mutateAsync({
        batchId: review.candidateBatchId,
      })).rejects.toThrow(/Perusahaan yang aktif/);
    });

    expect(state.reconciliation).not.toHaveBeenCalled();
    expect(result.current.preview).toBeNull();
    expect(result.current.reconciliation).toBeNull();
    expect(result.current.reviewNotice).toMatch(/Unggah ulang/);
  });

  it("refuses stale acceptance when scope changes between review and apply", async () => {
    const { result } = setup();
    await loadPreview(result);
    await act(async () => {
      await result.current.reconciliationMutation.mutateAsync({
        batchId: review.candidateBatchId,
      });
    });

    state.scope = ["tenant-b", "branch-b"];
    await act(async () => {
      await expect(result.current.applyMutation.mutateAsync({
        batchId: review.candidateBatchId,
        review: buildSIM3LONApplyReview(review),
      })).rejects.toThrow(/Perusahaan yang aktif/);
    });

    expect(state.apply).not.toHaveBeenCalled();
    expect(result.current.preview).toBeNull();
    expect(result.current.reconciliation).toBeNull();
    expect(result.current.reviewNotice).toMatch(/Unggah ulang/);
  });
});
