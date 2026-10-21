import { describe, expect, it, vi } from "vitest";
const getOne = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ getOne }));
import { sourcePlanReviewHttp } from "./sourcePlanReview.http";
import { sourcePlanMessage } from "./sourcePlanReview.contract";
import { sourceRowsForEmptyDraft } from "./fillSourcePlan";
import type { DistributionPlan, PlanRow } from "../types";

const date = "2026-09-19";
const response = { status: "ready", date, batch_id: "batch", branch_id: "branch", product_id: "product", period_month: "2026-09", unresolved_registration_codes: [], rows: [{ outlet_id: "outlet", outlet_name: "Pangkalan A", product_id: "product", product_name: "LPG 3kg", planned_qty: 50 }] };
describe("source plan review", () => {
  it("maps public provenance and per-outlet allocations from the new read endpoint", async () => {
    getOne.mockResolvedValue(response);
    const review = await sourcePlanReviewHttp.getSourcePlanReview("sa", date);
    expect(getOne).toHaveBeenCalledWith(`/schedule-agreements/sa/outlet-plan-review?date=${date}`);
    expect(review).toMatchObject({ batchId: "batch", date, status: "ready", rows: [{ outletId: "outlet", jumlah: 50 }] });
    const rows = sourceRowsForEmptyDraft({ status: "Draf", tanggal: date, branchId: "branch" } as DistributionPlan, [], review, []);
    expect(rows).toHaveLength(1);
    expect(rows[0].statusBayar).toBe("Belum Lunas");
  });
  it.each(["no_source", "uncovered_date", "empty_day", "incomplete"] as const)("keeps %s distinct and never fills it with fallback demand", async (status) => {
    getOne.mockResolvedValue({ ...response, status, rows: [] });
    const review = await sourcePlanReviewHttp.getSourcePlanReview("sa", date);
    expect(review.status).toBe(status);
    expect(sourcePlanMessage(review)).toBeTruthy();
    expect(sourceRowsForEmptyDraft({ status: "Draf" } as DistributionPlan, [], review, [])).toEqual([]);
  });
  it("network failure is an error, not an empty day", async () => {
    getOne.mockRejectedValue(new Error("network"));
    await expect(sourcePlanReviewHttp.getSourcePlanReview("sa", date)).rejects.toThrow("network");
  });
  it("refuses malformed ready data and wrong dates", async () => {
    for (const invalid of [{ ...response, date: "2026-09-20" }, { ...response, batch_id: undefined }, { ...response, unresolved_registration_codes: ["missing"] }, { ...response, rows: [] }, { ...response, status: "unexpected" }]) {
      getOne.mockResolvedValue(invalid);
      await expect(sourcePlanReviewHttp.getSourcePlanReview("sa", date)).rejects.toThrow();
    }
  });
  it("never overwrites existing or confirmed plans on fill retry", async () => {
    getOne.mockResolvedValue(response);
    const review = await sourcePlanReviewHttp.getSourcePlanReview("sa", date);
    expect(() => sourceRowsForEmptyDraft({ status: "Draf" } as DistributionPlan, [{}] as PlanRow[], review, [])).toThrow("Jangan menimpa");
    expect(() => sourceRowsForEmptyDraft({ status: "Terkonfirmasi" } as DistributionPlan, [], review, [])).toThrow("Jangan menimpa");
  });
});
