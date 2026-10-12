import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { scopeKey } from "@/lib/scope";
import {
  applySIM3LON,
  getSIM3LONReconciliation,
  previewSIM3LON,
} from "../api/saApi";
import type {
  SIM3LONApplyReview,
  SIM3LONPreview,
  SIM3LONReconciliationPreview,
} from "../types";

const RELOAD_CODES = new Set(["REVIEW_REQUIRED", "SOURCE_CHANGED", "STALE_VERSION"]);
type ReconciliationScope = readonly [string, string];

class ScopeMismatchError extends Error {}

function sameScope(left: readonly string[], right: readonly string[]): boolean {
  return left.join("|") === right.join("|");
}

function conflictCode(error: Error): string | undefined {
  return (error as Error & { code?: string }).code;
}

function conflictStatus(error: Error): number | undefined {
  return (error as Error & { status?: number }).status;
}

/** Builds the exact optimistic-lock set the backend identified as impacted. */
export function buildSIM3LONApplyReview(
  reconciliation: SIM3LONReconciliationPreview,
): SIM3LONApplyReview {
  const impactedPlanIds = new Set(
    reconciliation.changes
      .filter((change) => change.planId && change.classification !== "unchanged")
      .map((change) => change.planId!),
  );

  return {
    expectedPredecessorBatchId: reconciliation.expectedPredecessorBatchId,
    acceptedPlans: reconciliation.expectedPlanVersions
      .filter((plan) => plan.status.toLowerCase() === "draft" && impactedPlanIds.has(plan.planId))
      .map((plan) => ({ planId: plan.planId, expectedVersion: plan.version })),
  };
}

export function useSIM3LONImport() {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<SIM3LONPreview | null>(null);
  const [reconciliation, setReconciliation] = useState<SIM3LONReconciliationPreview | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [originScope, setOriginScope] = useState<ReconciliationScope | null>(null);

  const resetForScopeMismatch = (message: string) => {
    setPreview(null);
    setReconciliation(null);
    setOriginScope(null);
    setReviewNotice(message);
  };

  const previewMutation = useDeskMutation({
    mutationFn: ({ file, supplierName, productId }: {
      file: File;
      supplierName: string;
      productId: string;
    }) => {
      const requestScope = scopeKey();
      return previewSIM3LON(file, supplierName, productId).then((result) => {
        if (!sameScope(scopeKey(), requestScope)) {
          throw new ScopeMismatchError("Tenant berubah saat pratinjau dimuat. Unggah ulang berkas pada tenant yang sesuai.");
        }
        return { result, originScope: requestScope };
      });
    },
    errorTitle: "XLSX SIM3LON tidak dapat dibaca",
    onDone: ({ result, originScope: requestScope }) => {
      setPreview(result);
      setReconciliation(null);
      setOriginScope(requestScope);
      setReviewNotice(null);
    },
    onFail: (error) => {
      if (error instanceof ScopeMismatchError) resetForScopeMismatch(error.message);
    },
    invalidate: [],
  });

  const reconciliationMutation = useDeskMutation({
    mutationFn: async ({ batchId }: {
      batchId: string;
    }) => {
      const requestScope = originScope;
      if (!requestScope || preview?.id !== batchId || !sameScope(scopeKey(), requestScope)) {
        throw new ScopeMismatchError("Tenant berubah. Unggah ulang impor pada tenant yang sesuai.");
      }
      const result = await getSIM3LONReconciliation(batchId);
      if (!sameScope(scopeKey(), requestScope)) {
        throw new ScopeMismatchError("Tenant berubah saat rekonsiliasi dimuat. Unggah ulang impor pada tenant yang sesuai.");
      }
      if (result.candidateBatchId !== batchId) {
        throw new Error("Server mengembalikan rekonsiliasi untuk impor yang berbeda.");
      }
      return { result, originScope: requestScope };
    },
    errorTitle: "Rekonsiliasi SIM3LON tidak dapat dimuat",
    onDone: ({ result }) => {
      setReconciliation(result);
      setReviewNotice(null);
    },
    onFail: (error) => {
      if (error instanceof ScopeMismatchError) resetForScopeMismatch(error.message);
    },
    invalidate: [],
  });

  const applyMutation = useDeskMutation({
    mutationFn: async ({ batchId, review }: {
      batchId: string;
      review: SIM3LONApplyReview;
    }) => {
      const requestScope = originScope;
      if (!requestScope || preview?.id !== batchId || reconciliation?.candidateBatchId !== batchId ||
        !sameScope(scopeKey(), requestScope)) {
        throw new ScopeMismatchError("Tenant berubah. Unggah ulang impor dan tinjau rekonsiliasi pada tenant yang sesuai.");
      }
      const result = await applySIM3LON(batchId, review);
      if (!sameScope(scopeKey(), requestScope)) {
        throw new ScopeMismatchError("Tenant berubah saat impor diterapkan. Buka tenant semula untuk memeriksa hasilnya.");
      }
      return { result, originScope: requestScope };
    },
    errorTitle: "Impor SIM3LON gagal diterapkan",
    success: ({ result }) => ({
      title: "Rencana bulanan SIM3LON diterapkan",
      description: `${result.outletTargetsWritten.toLocaleString("id-ID")} alokasi pangkalan dan ${result.dailyTargetsWritten.toLocaleString("id-ID")} target harian diperbarui.`,
    }),
    onDone: ({ originScope }) => {
      if (!sameScope(scopeKey(), originScope)) return;
      // Applying a monthly source changes SA quota, dated targets, draft
      // plans, reports, and dashboard totals together. Invalidate only the
      // tenant/branch that originated the write, but invalidate that entire
      // scope so a newly-added consumer cannot accidentally remain stale.
      void queryClient.invalidateQueries({ queryKey: [...originScope] });
      setPreview(null);
      setReconciliation(null);
      setReviewNotice(null);
    },
    onFail: (error) => {
      if (error instanceof ScopeMismatchError) {
        resetForScopeMismatch(error.message);
        return;
      }
      const code = conflictCode(error);
      if (conflictStatus(error) !== 409 && (!code || !RELOAD_CODES.has(code))) return;
      setReconciliation(null);
      setReviewNotice(
        originScope && sameScope(scopeKey(), originScope)
          ? "Sumber atau rencana berubah setelah ditinjau. Muat ulang rekonsiliasi, periksa perubahan terbaru, lalu terima kembali."
          : "Tenant berubah setelah peninjauan. Kembali ke tenant semula lalu muat ulang rekonsiliasi.",
      );
    },
    invalidate: [],
  });

  const discard = () => {
    setPreview(null);
    setReconciliation(null);
    setOriginScope(null);
    setReviewNotice(null);
  };

  return {
    preview,
    reconciliation,
    reviewNotice,
    discard,
    previewMutation,
    reconciliationMutation,
    applyMutation,
  };
}
