import type { DistributionPlan, PlanOption, PlanRow } from "../types";
import type { SourcePlanReview } from "./sourcePlanReview.contract";

/** Only initialize an empty draft. Existing drafts require reviewed reconciliation. */
export function sourceRowsForEmptyDraft(plan: DistributionPlan, existing: PlanRow[], review: SourcePlanReview, outlets: PlanOption[]): PlanRow[] {
  if (plan.status !== "Draft" || existing.length > 0) {
    throw new Error("Rencana sudah berisi titik singgah atau tidak lagi berupa draf. Jangan menimpa rencana; tinjau perubahan sumber terlebih dahulu.");
  }
  if (review.status !== "ready") return [];
  if (review.date !== plan.tanggal || !plan.branchId || review.branchId !== plan.branchId) {
    throw new Error("Tanggal atau cabang sumber tidak cocok dengan rencana.");
  }
  const byId = new Map(outlets.map((outlet) => [outlet.id, outlet]));
  return review.rows.map((row, index) => ({
    id: `sa-plan-${index}`, outletId: row.outletId, outlet: row.outlet,
    alamat: byId.get(row.outletId)?.sublabel ?? "", lines: [{ productId: row.productId, jumlah: row.jumlah }],
    jumlahUnit: row.jumlah, driverId: null, driver: "Belum ditetapkan", vehicleId: null,
    vehicle: "Belum ditetapkan", jamPengiriman: "07:00", statusBayar: "Belum Lunas",
    sisaKuotaOutlet: 0, piutang: 0, piutangJatuhTempo: 0, tripNo: null,
  }));
}
