import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * The HTTP adapter's mapping, which is where the two sources drift.
 *
 * The wire shape and the domain model disagree on language, on status
 * vocabulary and on what "remaining" means. None of that is visible from a
 * screen until a number is wrong, so it is asserted here.
 */

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();
const upload = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  // getAllPages walks pages through getList; one mocked call is one page.
  getAllPages: async (...args: unknown[]) => ({ items: (await getList(...args)).items, truncated: false }),
  getPage: async (path: string, params: { page?: number; pageSize?: number }, map: (row: unknown) => unknown) => {
    const result = await getList(path, params);
    return {
      items: result.items.map(map), page: params.page ?? 1, pageSize: params.pageSize ?? 50,
      hasNext: Boolean(result.pagination?.has_next), totalItems: result.pagination?.total_items,
    };
  },
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: (...args: unknown[]) => upload(...args),
}));

const { saApiHttp } = await import("./saApi.http");

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sa_number: "SA-2026-09-001",
    agreement_type: "base",
    is_time_limited: false,
    supplier_name: "SPBE Salatiga",
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    sa_status: "active",
    is_lapsed: false,
    source: "manual",
    total_quota_qty: 80000,
    allocated_quota_qty: 55000,
    used_quota_qty: 33000,
    version: 1,
    created_at: "2026-08-30T02:00:00Z",
    updated_at: "2026-08-30T02:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
  upload.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("live Penyaluran candidate mapping", () => {
  const candidate = {
    id: "11111111-1111-4111-8111-111111111111",
    period: "2026-10",
    fetched_at: "2026-10-11T03:00:00Z",
    status: "parsed",
    duplicate: false,
    checksum_sha256: "abc123",
    outlet_count: 17,
    applied_to_sa: false,
    review_reason: "Historical Penyaluran changed",
  };

  it("keeps the persisted review reason and applied state", async () => {
    getOne.mockResolvedValue([candidate]);
    const [mapped] = await saApiHttp.getLivePenyaluranCandidates("2026-10");
    expect(mapped).toMatchObject({
      fetchedAt: candidate.fetched_at,
      checksum: "abc123",
      outletCount: 17,
      appliedToSA: false,
      reviewReason: candidate.review_reason,
    });
  });

  it("uses the long bridge timeout for manual sync", async () => {
    send.mockResolvedValue(candidate);
    const mapped = await saApiHttp.syncLivePenyaluran("2026-10");
    expect(send).toHaveBeenCalledWith("post", "/integrations/sim3lon/sa-sync?period=2026-10", undefined, { timeout: 120_000 });
    expect(mapped.appliedToSA).toBe(false);
  });
});

describe("mapping the wire shape onto the domain", () => {
  it("carries the quota numbers across", async () => {
    getList.mockResolvedValue({ items: [wire()], pagination: {} });

    const [sa] = await saApiHttp.getSAList();
    expect(sa.totalKuota).toBe(80000);
    expect(sa.sudahDidistribusikan).toBe(33000);
  });

  // Remaining is measured against what has been USED, not what has been
  // allocated. An allocation is a promise; a delivery is a cylinder that has
  // left the yard, and only the second one reduces what is actually left.
  it("computes remaining from used, not from allocated", async () => {
    getList.mockResolvedValue({ items: [wire()], pagination: {} });

    const [sa] = await saApiHttp.getSAList();
    expect(sa.sisaKuota).toBe(80000 - 33000);
  });

  // Never negative. Over-delivery is possible in the data and a negative
  // "remaining" on screen reads as a display bug rather than as the problem it
  // actually is.
  it("never reports a negative remainder", async () => {
    getList.mockResolvedValue({
      items: [wire({ total_quota_qty: 100, used_quota_qty: 150 })],
      pagination: {},
    });

    const [sa] = await saApiHttp.getSAList();
    expect(sa.sisaKuota).toBe(0);
  });

  // "Limit" is derived here and has no backend state, because it is arithmetic
  // rather than a lifecycle step — storing it would need something to flip it
  // the moment an allocation changed.
  it("derives Limit from an agreement whose quota is fully spoken for", async () => {
    getList.mockResolvedValue({
      items: [wire({ allocated_quota_qty: 80000 })],
      pagination: {},
    });

    const [sa] = await saApiHttp.getSAList();
    expect(sa.status).toBe("Limit");
  });

  // Only an active agreement can be at its limit. A draft with quota already
  // allocated is still a draft — nothing has been committed to.
  it("does not call a draft Limit", async () => {
    getList.mockResolvedValue({
      items: [wire({ sa_status: "draft", allocated_quota_qty: 80000 })],
      pagination: {},
    });

    const [sa] = await saApiHttp.getSAList();
    expect(sa.status).toBe("Draf");
  });

  it.each([
    ["draft", "Draf"],
    ["active", "Aktif"],
    ["completed", "Selesai"],
    // A superseded agreement is finished from the agent's point of view: the
    // replacement is the live one.
    ["amended", "Selesai"],
  ])("maps %s onto %s", async (wireStatus, domain) => {
    getList.mockResolvedValue({
      items: [wire({ sa_status: wireStatus, allocated_quota_qty: 0 })],
      pagination: {},
    });

    const [sa] = await saApiHttp.getSAList();
    expect(sa.status).toBe(domain);
  });

  // An unrecognised status must not crash a list. A backend that gains a
  // lifecycle step should show the row conservatively rather than blank the
  // screen.
  it("falls back rather than throwing on an unknown status", async () => {
    getList.mockResolvedValue({
      items: [wire({ sa_status: "something_new" })],
      pagination: {},
    });

    const [sa] = await saApiHttp.getSAList();
    expect(sa.status).toBe("Draf");
  });

  // The backend publishes HOW a figure arrived, not who typed it. That is the
  // more useful of the two: a figure the supplier stated and one the system
  // derived settle an argument differently.
  it("reports the provenance rather than inventing an uploader", async () => {
    getList.mockResolvedValue({ items: [wire()], pagination: {} });
    const [manual] = await saApiHttp.getSAList();
    expect(manual.diunggahOleh).toBe("Entri manual");

    getList.mockResolvedValue({
      items: [wire({ source: "file_import" })],
      pagination: {},
    });
    const [imported] = await saApiHttp.getSAList();
    expect(imported.diunggahOleh).toBe("file_import");
  });
});

describe("activation", () => {
  // The version is read first and echoed back. Sending a stale one is how two
  // people both believe they activated an agreement.
  it("reads the current version before activating", async () => {
    getOne.mockResolvedValue(wire({ version: 7, sa_status: "draft" }));
    send.mockResolvedValue(wire({ version: 8, sa_status: "active" }));

    await saApiHttp.activateSA("11111111-1111-4111-8111-111111111111");

    expect(getOne).toHaveBeenCalledBefore(send);
    expect(send).toHaveBeenCalledWith(
      "post",
      expect.stringContaining("/activate"),
      { version: 7 },
    );
  });
});

describe("the supplier list", () => {
  // Derived from existing agreements: the backend has no supplier table, and
  // inventing one to populate a dropdown would be a table nobody maintains.
  it("is the distinct suppliers already recorded, sorted", async () => {
    getList.mockResolvedValue({
      items: [
        wire({ supplier_name: "SPBE Ungaran" }),
        wire({ supplier_name: "SPBE Salatiga" }),
        wire({ supplier_name: "SPBE Salatiga" }),
        wire({ supplier_name: undefined }),
      ],
      pagination: {},
    });

    expect(await saApiHttp.getSupplierOptions()).toEqual([
      "SPBE Salatiga",
      "SPBE Ungaran",
    ]);
  });
});

describe("the per-product quota breakdown", () => {
  // This is the field the SA list/detail screens and the distribution
  // planner's product default all depend on -- see PlanDetailPanel's
  // addRow() and the "Produk" column on SATable.
  it("maps each product's quota across", async () => {
    getList.mockResolvedValue({
      items: [
        wire({
          products: [
            {
              product_id: "prod-1",
              product_name: "Bright Gas 12 Kg",
              total_quota_qty: 41300,
              allocated_quota_qty: 100,
              used_quota_qty: 0,
            },
          ],
        }),
      ],
      pagination: {},
    });

    const [sa] = await saApiHttp.getSAList();

    expect(sa.products).toEqual([
      {
        productId: "prod-1",
        productName: "Bright Gas 12 Kg",
        totalKuota: 41300,
        dialokasikan: 100,
        terpakai: 0,
        sisaKuota: 41200,
      },
    ]);
  });

  // An SA typed by hand, or not yet applied from an import, has no product
  // quota rows at all -- not missing data, just nothing to show yet.
  it("is empty for an agreement with no product quota", async () => {
    getList.mockResolvedValue({ items: [wire({ products: undefined })], pagination: {} });

    const [sa] = await saApiHttp.getSAList();

    expect(sa.products).toEqual([]);
  });
});

describe("the import summary", () => {
  it("maps the batch and its outlets across", async () => {
    getOne.mockResolvedValue({
      file_name: "SIM3LON-202609-BASE.xlsx",
      supplier_name: "Pertamina",
      checksum_sha256: "abc123",
      imported_at: "2026-09-10T02:00:00Z",
      outlets: [
        {
          registration_code: "PGKL-0001",
          name: "Pangkalan A",
          allocation_qty: 70,
          normal_qty: 70,
          fakultatif_qty: 0,
          remaining_qty: 0,
        },
      ],
    });

    const summary = await saApiHttp.getImportSummary("sa-1");

    expect(getOne).toHaveBeenCalledWith("/schedule-agreements/sa-1/import-summary");
    expect(summary).toEqual({
      namaBerkas: "SIM3LON-202609-BASE.xlsx",
      supplier: "Pertamina",
      checksum: "abc123",
      diimporPada: "2026-09-10T02:00:00Z",
      outlets: [
        {
          registrationCode: "PGKL-0001",
          nama: "Pangkalan A",
          alokasi: 70,
          normal: 70,
          fakultatif: 0,
          sisa: 0,
          // An older server sends no opening_qty: no cutover, nothing drawn.
          saldoAwal: 0,
        },
      ],
    });
  });

  // A hand-typed agreement has no import behind it -- null, not an error.
  it("is null for an agreement typed by hand", async () => {
    getOne.mockResolvedValue(null);

    const summary = await saApiHttp.getImportSummary("sa-1");

    expect(summary).toBeNull();
  });
});

describe("SIM3LON reconciliation", () => {
  const batchId = "22222222-2222-4222-8222-222222222222";
  const predecessorId = "11111111-1111-4111-8111-111111111111";
  const planId = "33333333-3333-4333-8333-333333333333";

  it("maps the three-way preview and reads it from the candidate batch route", async () => {
    getOne.mockResolvedValue({
      candidate_batch_id: batchId,
      expected_predecessor_batch_id: predecessorId,
      source_created_at: "2026-09-20T01:02:03Z",
      review_ready: true,
      expected_plan_versions: [{ plan_id: planId, version: 7, status: "draft" }],
      changes: [{
        plan_id: planId,
        outlet_id: "44444444-4444-4444-8444-444444444444",
        product_id: "55555555-5555-4555-8555-555555555555",
        operational_date: "2026-09-21",
        baseline_qty: 100,
        current_qty: 100,
        proposed_qty: 80,
        classification: "decrease",
        non_draft_discrepancy: false,
        crew_assignment_affected: true,
      }],
      blockers: [],
    });

    const preview = await saApiHttp.getSIM3LONReconciliation(batchId);

    expect(getOne).toHaveBeenCalledWith(`/sim3lon-imports/${batchId}/reconciliation-preview`);
    expect(preview).toMatchObject({
      candidateBatchId: batchId,
      expectedPredecessorBatchId: predecessorId,
      sourceCreatedAt: "2026-09-20T01:02:03Z",
      reviewReady: true,
      expectedPlanVersions: [{ planId, version: 7, status: "draft" }],
      changes: [{
        planId,
        baselineQty: 100,
        currentQty: 100,
        proposedQty: 80,
        classification: "decrease",
        crewAssignmentAffected: true,
      }],
    });
  });

  it("keeps a first import predecessor explicitly null", async () => {
    getOne.mockResolvedValue({
      candidate_batch_id: batchId,
      expected_predecessor_batch_id: null,
      source_created_at: "2026-09-20T01:02:03Z",
      review_ready: true,
      expected_plan_versions: [],
      changes: [],
      blockers: [],
    });

    const preview = await saApiHttp.getSIM3LONReconciliation(batchId);

    expect(preview.expectedPredecessorBatchId).toBeNull();
  });

  it("posts only the accepted predecessor and optimistic-lock set", async () => {
    send.mockResolvedValue({
      id: batchId,
      status: "applied",
      base_schedule_agreement_id: "66666666-6666-4666-8666-666666666666",
      outlet_targets_written: 12,
      daily_targets_written: 30,
    });

    await saApiHttp.applySIM3LON(batchId, {
      expectedPredecessorBatchId: predecessorId,
      acceptedPlans: [{ planId, expectedVersion: 7 }],
    });

    expect(send).toHaveBeenCalledWith(
      "post",
      `/sim3lon-imports/${batchId}/apply`,
      {
        expected_predecessor_batch_id: predecessorId,
        accepted_plans: [{ plan_id: planId, expected_version: 7 }],
      },
    );
  });

  it("sends an explicit null predecessor for first-import acceptance", async () => {
    send.mockResolvedValue({
      id: batchId,
      status: "applied",
      base_schedule_agreement_id: "66666666-6666-4666-8666-666666666666",
      outlet_targets_written: 12,
      daily_targets_written: 30,
    });

    await saApiHttp.applySIM3LON(batchId, {
      expectedPredecessorBatchId: null,
      acceptedPlans: [],
    });

    expect(send).toHaveBeenCalledWith(
      "post",
      `/sim3lon-imports/${batchId}/apply`,
      { expected_predecessor_batch_id: null, accepted_plans: [] },
    );
  });
});

describe("the planning cutover and SIM3LON variances", () => {
  it("posts the dry-run flag to the default branch and maps the report", async () => {
    getList.mockResolvedValue({ items: [{ id: "branch-1", is_default: true }], pagination: {} });
    send.mockResolvedValue({
      branch_id: "branch-1",
      current_planning_start_date: null,
      planning_start_date: "2026-09-26",
      dry_run: true,
      applied: false,
      scopes: [{
        batch_id: "batch-1", product_id: "product-1", period_month: "2026-09", quota_total: 20650,
        allocated_before: 560, allocated_after: 10680, used_before: 0, used_after: 10120,
        opening_before: 0, opening_after: 10120,
        outlets: [{ outlet_id: "outlet-1", opening_before: 0, opening_after: 720 }],
      }],
      blockers: [{ code: "plan_before_cutover", message: "early", plan_id: "plan-1" }],
      warnings: [],
    });

    const report = await saApiHttp.setPlanningCutover("2026-09-26", true);

    expect(send).toHaveBeenCalledWith("post", "/branches/branch-1/planning-cutover",
      { planning_start_date: "2026-09-26", dry_run: true });
    expect(report.scopes[0]).toMatchObject({ openingAfter: 10120, allocatedAfter: 10680, usedAfter: 10120 });
    expect(report.scopes[0].outlets[0]).toEqual({ outletId: "outlet-1", openingBefore: 0, openingAfter: 720 });
    expect(report.blockers[0]).toMatchObject({ code: "plan_before_cutover", planId: "plan-1" });
  });

  it("reads variances with product and month as query parameters", async () => {
    getList.mockResolvedValue({ items: [{ id: "branch-1", is_default: true }], pagination: {} });
    getOne.mockResolvedValue({
      batch_id: "batch-1", planning_start_date: "2026-09-26", total_variance: -3,
      rows: [{
        outlet_id: "outlet-1", outlet_code: "4507", outlet_name: "Pangkalan A", date: "2026-09-27",
        sim3lon_qty: 4, committed_qty: 7, delivered_qty: 0, variance: -3, kind: "over",
      }],
    });

    const report = await saApiHttp.getSIM3LONVariances("product-1", "2026-09");

    expect(getOne).toHaveBeenCalledWith(
      "/branches/branch-1/sim3lon-variances?product_id=product-1&month=2026-09");
    expect(report.rows[0]).toMatchObject({ sim3lonQty: 4, committedQty: 7, variance: -3, kind: "over" });
  });

  it("carries the opening quantity and cutover context through", async () => {
    getOne.mockResolvedValueOnce({
      outlets: [{
        registration_code: "4507", name: "A", allocation_qty: 800, normal_qty: 510,
        fakultatif_qty: 0, remaining_qty: 290, opening_qty: 460,
      }],
    });
    const summary = await saApiHttp.getImportSummary("sa-1");
    expect(summary?.outlets[0].saldoAwal).toBe(460);

    getOne.mockResolvedValueOnce({
      candidate_batch_id: "b", expected_predecessor_batch_id: null, source_created_at: "2026-09-26T00:00:00Z",
      review_ready: true, expected_plan_versions: [], blockers: [],
      changes: [{
        outlet_id: "o", product_id: "p", operational_date: "2026-09-05", baseline_qty: 10,
        current_qty: null, proposed_qty: 30, classification: "pre_cutover",
        non_draft_discrepancy: false, crew_assignment_affected: false,
      }],
      planning_start_date: "2026-09-26", opening_balance_delta: 20, variance_count: 2,
    });
    const review = await saApiHttp.getSIM3LONReconciliation("b");
    expect(review).toMatchObject({ planningStartDate: "2026-09-26", openingBalanceDelta: 20, varianceCount: 2 });
    expect(review.changes[0].classification).toBe("pre_cutover");
  });

  it("treats an older server without the new fields as no cutover", async () => {
    getOne.mockResolvedValueOnce({
      outlets: [{ registration_code: "x", name: "x", allocation_qty: 1, normal_qty: 1, fakultatif_qty: 0, remaining_qty: 0 }],
    });
    expect((await saApiHttp.getImportSummary("sa-1"))?.outlets[0].saldoAwal).toBe(0);
  });
});

// Round 1 G18: the form asked for a total quota and the request dropped it,
// so every manual SA read 0 / 0.
it("sends a manual SA's quota with the product it is for", async () => {
  getList.mockResolvedValue({ items: [{ id: "branch-1", is_default: true }] });
  send.mockResolvedValue(wire());
  await saApiHttp.uploadSA({
    nomorSA: "SA-UJI-1", supplier: "Pertamina", periodeMulai: "2026-12-01", periodeBerakhir: "2026-12-31",
    produkId: "product-1", totalKuota: 12000,
  });
  const [, path, body] = send.mock.calls[0];
  expect(path).toBe("/schedule-agreements");
  expect(body.products).toEqual([{ product_id: "product-1", total_quota_qty: 12000 }]);
});

describe("the Acuan Base SA", () => {
  const wireReference = {
    id: "batch-1", status: "parsed", branch_id: "branch-1", period_month: "2026-11",
    file_name: "Acuan Base SA November 2026 PT. BDA .pdf",
    rows: [{ supplier_name: "YOSO ARTO POTRO", days: [0, 560, 360], total_qty: 920 }],
    total_qty: 920,
  };

  it("posts the PDF and its month to the scoped branch and maps the rows", async () => {
    getList.mockResolvedValue({ items: [{ id: "branch-1", is_default: true }] });
    upload.mockResolvedValue({ ...wireReference, current_total_qty: 11200 });
    const file = new File(["%PDF-1.4"], "acuan.pdf", { type: "application/pdf" });

    const preview = await saApiHttp.previewBaseReference(file, "2026-11");

    expect(upload).toHaveBeenCalledWith(
      "/branches/branch-1/sa-base-references/preview", file, "file", 60_000, { period_month: "2026-11" });
    expect(preview).toMatchObject({
      id: "batch-1", totalQty: 920, currentTotalQty: 11200, appliedBy: null,
      rows: [{ supplierName: "YOSO ARTO POTRO", days: [0, 560, 360], totalQty: 920 }],
    });
  });

  it("reads a month nobody uploaded as null, not as a zero target", async () => {
    getList.mockResolvedValue({ items: [{ id: "branch-1", is_default: true }] });
    getOne.mockResolvedValue(null);
    expect(await saApiHttp.getBaseReference("2026-12")).toBeNull();
    expect(getOne).toHaveBeenCalledWith("/branches/branch-1/sa-base-reference?month=2026-12");
  });

  it("carries the baseline onto the quota summary, null when the month has none", async () => {
    getList.mockResolvedValue({ items: [{ id: "branch-1", is_default: true }] });
    getOne.mockResolvedValue({
      period_month: "2026-11", today: "2026-11-18", today_qty: 360,
      days: [{ date: "2026-11-18", qty: 360, reference_qty: 360 }, { date: "2026-11-19", qty: 310 }],
      allocation_qty: 20450, delivered_qty: 6800, remaining_qty: 13650, outlet_count: 25, kinds: [],
      reference_qty: 11200, reference_remaining_qty: 4400, today_reference_qty: 360,
    });
    const summary = await saApiHttp.getQuotaSummary("2026-11");
    expect(summary).toMatchObject({ referenceQty: 11200, referenceRemainingQty: 4400, todayReferenceQty: 360 });
    expect(summary.days.map((day) => day.referenceQty)).toEqual([360, null]);
  });
});
