import type { SourcePlanReviewApi } from "./sourcePlanReview.contract";
import { scopedDb } from "@/mocks/scope";

export const sourcePlanReviewMock: SourcePlanReviewApi = {
  async getSourcePlanReview(saId, date) {
    const db = scopedDb();
    const source = db.sim3lonSourceSnapshots.find((row) => row.saId === saId);
    if (!source) return { status: "no_source", date, rows: [], unresolvedRegistrationCodes: [] };
    const base = {
      batchId: source.batchId, branchId: source.branchId, productId: source.productId,
      periodMonth: source.periodMonth, date, rows: [], unresolvedRegistrationCodes: [] as string[],
    };
    if (!source.complete || source.status !== "applied") return { ...base, status: "incomplete" as const, reason: "invalid_source_scope" };
    if (date.slice(0, 7) !== source.periodMonth) return { ...base, status: "uncovered_date" as const, reason: "outside_source_month" };
    const dated = source.rows.filter((row) => row.date === date);
    if (dated.length === 0) return { ...base, status: "uncovered_date" as const, reason: "no_daily_snapshot" };
    const unresolved = dated.filter((row) => !db.outlets.some((outlet) => outlet.id === row.outletId && outlet.branchId === source.branchId));
    if (unresolved.length > 0) return { ...base, status: "incomplete" as const, reason: "unresolved_or_incomplete_snapshot", unresolvedRegistrationCodes: unresolved.map((row) => row.outletId) };
    const rows = dated.filter((row) => row.qty > 0).map((row) => ({
      outletId: row.outletId,
      outlet: db.outlets.find((outlet) => outlet.id === row.outletId)?.nama ?? "—",
      productId: source.productId,
      productName: db.products.find((product) => product.id === source.productId)?.nama ?? "—",
      jumlah: row.qty,
    }));
    return rows.length === 0 ? { ...base, status: "empty_day" as const } : { ...base, status: "ready" as const, rows };
  },
};
