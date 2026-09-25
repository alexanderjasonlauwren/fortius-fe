import type { SAOutletPlanRow } from "../types";

export type SourcePlanStatus = "ready" | "no_source" | "uncovered_date" | "empty_day" | "incomplete";
export interface SourcePlanReview {
  status: SourcePlanStatus;
  batchId?: string;
  branchId?: string;
  productId?: string;
  periodMonth?: string;
  date: string;
  rows: SAOutletPlanRow[];
  unresolvedRegistrationCodes: string[];
  reason?: string;
}
export interface SourcePlanReviewApi {
  getSourcePlanReview(saId: string, date: string): Promise<SourcePlanReview>;
}

export function sourcePlanMessage(review: SourcePlanReview): string {
  switch (review.status) {
    case "ready": return `${review.rows.length} pangkalan memiliki alokasi SIM3LON untuk tanggal ini.`;
    case "no_source": return "SA ini belum memiliki sumber SIM3LON. Upload dan tinjau sumber terlebih dahulu.";
    case "uncovered_date": return review.reason === "aggregate_fakultatif_has_no_daily_schedule"
      ? "SA Fakultatif hanya memiliki total agregat, belum memiliki jadwal harian."
      : "Tanggal ini tidak tercakup dalam snapshot SIM3LON.";
    case "empty_day": return "Snapshot SIM3LON mencakup tanggal ini dengan alokasi nol; tidak ada titik singgah untuk diisi.";
    case "incomplete": return "Alokasi belum lengkap atau pemetaan pangkalan tidak cocok. Perbaiki sumber sebelum mengisi rencana.";
  }
}
