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
    // Each says what to do next (Round 1 G1: the dispatcher met a refusal
    // with no way forward).
    case "uncovered_date":
      if (review.reason === "aggregate_fakultatif_has_no_daily_schedule") {
        return "SA Fakultatif hanya memiliki total agregat, belum memiliki jadwal harian.";
      }
      if (review.reason === "historical_external_actual") {
        return "Tanggal ini sudah lewat; Penyaluran-nya adalah catatan pengiriman, bukan rencana. Rencanakan hari ini atau hari berikutnya.";
      }
      return "Tanggal ini tidak ada di data SIM3LON yang terakhir ditarik. Tarik data terbaru di halaman Schedule Agreement (Sinkron SIM3LON), lalu coba lagi.";
    case "empty_day": return "SIM3LON belum mencatat penebusan untuk tanggal ini. Tarik ulang data setelah pangkalan menebus, atau pilih tanggal lain.";
    case "incomplete": return "Alokasi belum lengkap atau pemetaan pangkalan tidak cocok. Perbaiki sumber sebelum mengisi rencana.";
  }
}
