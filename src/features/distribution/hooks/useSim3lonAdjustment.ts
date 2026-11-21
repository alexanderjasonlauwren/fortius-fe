import { useQuery } from "@tanstack/react-query";
import { scopeKey } from "@/lib/scope";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { formatNumber } from "@/lib/format";
import { applySim3lonAdjustment, getSim3lonAdjustment } from "../api/sim3lonAdjustment";
import type { DistributionPlan } from "../types";

/**
 * SIM3LON compared with a SIM3LON plan's day, once the plan has left draft
 * (a draft follows SIM3LON on its own). An extra plan asks for the plan it
 * tops up, so both show the same comparison.
 */
export function useSim3lonAdjustment(plan: DistributionPlan | undefined, onOpenPlan: (planId: string) => void) {
  const subject = plan?.topupOf?.id ?? (plan?.sourceManaged ? plan.id : undefined);
  const enabled = !!subject && !!plan && (plan.topupOf !== undefined || plan.status !== "Draf");

  const adjustment = useQuery({
    queryKey: [...scopeKey(), "sim3lon-adjustment", subject],
    queryFn: () => getSim3lonAdjustment(subject!),
    enabled,
  });

  const applyMutation = useDeskMutation({
    mutationFn: ({ planId, fingerprint }: { planId: string; fingerprint: string }) =>
      applySim3lonAdjustment(planId, fingerprint),
    errorTitle: "Penyesuaian SIM3LON gagal",
    success: (result) => {
      const before = adjustment.data;
      const parts: string[] = [];
      if (before && before.add > 0 && result.topup) {
        parts.push(`${formatNumber(before.add)} tabung masuk ke ${result.topup.kode}. Tetapkan ritnya, lalu minta manajer mengonfirmasi.`);
      }
      if (before && before.reduce > 0) {
        parts.push(`${formatNumber(before.reduce)} tabung yang belum berangkat dikurangi; kuotanya kembali ke SA.`);
      }
      return { title: "Rencana disesuaikan dengan SIM3LON", description: parts.join(" ") || undefined };
    },
    onDone: (result) => {
      // Straight to the plan that now needs a run.
      if (result.topup) onOpenPlan(result.topup.id);
    },
  });

  return { adjustment, applyMutation, enabled };
}
