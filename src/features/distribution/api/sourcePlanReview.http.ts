import { getOne } from "@/lib/api";
import type { SourcePlanReviewApi, SourcePlanStatus } from "./sourcePlanReview.contract";

interface ReviewResponse {
  status: SourcePlanStatus;
  batch_id?: string;
  branch_id?: string;
  product_id?: string;
  period_month?: string;
  date: string;
  rows: { outlet_id: string; outlet_name: string; product_id: string; product_name: string; planned_qty: number }[];
  unresolved_registration_codes: string[];
  reason?: string;
}

export const sourcePlanReviewHttp: SourcePlanReviewApi = {
  async getSourcePlanReview(saId, date) {
    const response = await getOne<ReviewResponse>(`/schedule-agreements/${saId}/outlet-plan-review?date=${encodeURIComponent(date)}`);
    const statuses: SourcePlanStatus[] = ["ready", "no_source", "uncovered_date", "empty_day", "incomplete"];
    if (!statuses.includes(response.status) || !Array.isArray(response.rows) || !Array.isArray(response.unresolved_registration_codes)) {
      throw new Error("Hasil peninjauan sumber SIM3LON tidak valid.");
    }
    if (response.date !== date || (response.status === "ready" && (!response.batch_id || !response.branch_id || !response.product_id || response.period_month !== date.slice(0, 7) || response.rows.length === 0 || response.unresolved_registration_codes.length > 0 || response.rows.some((row) => !row.outlet_id || row.product_id !== response.product_id || !Number.isInteger(row.planned_qty) || row.planned_qty <= 0)))) {
      throw new Error("Alokasi SIM3LON belum lengkap untuk tanggal yang dipilih.");
    }
    return {
      status: response.status, batchId: response.batch_id, branchId: response.branch_id,
      productId: response.product_id, periodMonth: response.period_month, date: response.date,
      reason: response.reason, unresolvedRegistrationCodes: response.unresolved_registration_codes,
      rows: response.rows.map((row) => ({ outletId: row.outlet_id, outlet: row.outlet_name,
        productId: row.product_id, productName: row.product_name, jumlah: row.planned_qty })),
    };
  },
};
