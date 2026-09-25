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
    expect(sa.status).toBe("Draft");
  });

  it.each([
    ["draft", "Draft"],
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
    expect(sa.status).toBe("Draft");
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

describe("mapping an import's diff onto the domain", () => {
  const file = new File(["tanggal,target\n"], "SA-Agustus-rev2.csv", {
    type: "text/csv",
  });

  function parsed(diff: Record<string, unknown> = {}) {
    return {
      id: "22222222-2222-4222-8222-222222222222",
      status: "parsed",
      schedule_agreement_id: "11111111-1111-4111-8111-111111111111",
      file_name: "SA-Agustus-rev2.csv",
      checksum_sha256: "abc123",
      diff: {
        changes: [],
        issues: [],
        new: 0,
        updated: 0,
        unchanged: 0,
        skipped: 0,
        ...diff,
      },
    };
  }

  it("posts the file as multipart to the agreement's import route", async () => {
    upload.mockResolvedValue(parsed());

    await saApiHttp.parseImport("11111111-1111-4111-8111-111111111111", file);

    expect(upload).toHaveBeenCalledWith(
      "/schedule-agreements/11111111-1111-4111-8111-111111111111/imports",
      file,
    );
  });

  it("translates the three change words", async () => {
    upload.mockResolvedValue(
      parsed({
        changes: [
          { date: "2026-09-01", change: "unchanged", to: 350 },
          { date: "2026-09-02", change: "updated", from: 350, to: 300 },
          { date: "2026-09-03", change: "new", to: 400 },
        ],
        new: 1,
        updated: 1,
        unchanged: 1,
      }),
    );

    const batch = await saApiHttp.parseImport("sa-1", file);

    expect(batch.diff.perubahan.map((c) => c.jenis)).toEqual([
      "tetap",
      "berubah",
      "baru",
    ]);
    expect(batch.diff.perubahan[1]).toEqual({
      tanggal: "2026-09-02",
      jenis: "berubah",
      dari: 350,
      menjadi: 300,
    });
    // A new date has no previous value. Undefined, never 0 — a zero would read
    // as a stated obligation of nothing, which is a different claim.
    expect(batch.diff.perubahan[2].dari).toBeUndefined();
    expect(batch.diff).toMatchObject({ baru: 1, berubah: 1, tetap: 1 });
  });

  it("keeps a change it does not recognise rather than dropping it", async () => {
    // A row the console cannot classify still moves a number, and hiding it
    // would understate what applying the file does.
    upload.mockResolvedValue(
      parsed({ changes: [{ date: "2026-09-01", change: "reinstated", to: 350 }] }),
    );

    const batch = await saApiHttp.parseImport("sa-1", file);

    expect(batch.diff.perubahan).toHaveLength(1);
    expect(batch.diff.perubahan[0].jenis).toBe("berubah");
  });

  it("passes the parser's own words through for an unreadable line", async () => {
    upload.mockResolvedValue(
      parsed({
        issues: [{ line: 4, value: "kemarin", reason: "not a date the parser recognises" }],
        skipped: 1,
      }),
    );

    const batch = await saApiHttp.parseImport("sa-1", file);

    expect(batch.diff.masalah).toEqual([
      { baris: 4, nilai: "kemarin", alasan: "not a date the parser recognises" },
    ]);
    expect(batch.diff.dilewati).toBe(1);
  });

  it("survives a diff with no arrays at all", async () => {
    // Go marshals an empty slice as null, so a file that changed nothing and
    // broke nothing arrives with both lists absent.
    upload.mockResolvedValue(
      parsed({ changes: undefined, issues: undefined }),
    );

    const batch = await saApiHttp.parseImport("sa-1", file);

    expect(batch.diff.perubahan).toEqual([]);
    expect(batch.diff.masalah).toEqual([]);
  });

  it("reports what applying actually wrote", async () => {
    send.mockResolvedValue({
      id: "22222222-2222-4222-8222-222222222222",
      status: "applied",
      rows_written: 31,
    });

    const applied = await saApiHttp.applyImport("22222222-2222-4222-8222-222222222222");

    expect(send).toHaveBeenCalledWith(
      "post",
      "/imports/22222222-2222-4222-8222-222222222222/apply",
    );
    expect(applied.barisDitulis).toBe(31);
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
