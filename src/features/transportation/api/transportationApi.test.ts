import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping between the console's TransportationClaimEntity
 * and the backend's own transportationclaim.ClaimResponse/BeritaAcaraResponse/
 * RecapResponse, following transactionApi.test.ts's own pattern.
 */

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();
vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const { transportationApiHttp } = await import("./transportationApi.http");

function claimWire(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    claim_number: "BAST-SLT-202609-0001",
    handover_date: "2026-09-01",
    period_start: "2026-09-01",
    period_end: "2026-10-01",
    claimed_amount: 2_500_000,
    total_qty: 4_000,
    total_weight_kg: 12_000,
    claim_status: "draft",
    version: 1,
    created_at: "2026-09-12T00:00:00+07:00",
    updated_at: "2026-09-12T00:00:00+07:00",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
});

describe("getClaims", () => {
  it("maps the wire shape onto the console's own field names", async () => {
    getList.mockResolvedValue({
      items: [
        claimWire({
          handover_reference: "BAST/2026/0001",
          principal_invoice_number: "INV/999/IV/2026",
          claim_status: "submitted",
          status_note: "Menunggu jawaban iVendor",
          status_updated_at: "2026-09-05T00:00:00+07:00",
          delivery_ids: ["22222222-2222-4222-8222-222222222222"],
        }),
      ],
    });

    const [claim] = await transportationApiHttp.getClaims();

    expect(claim.claimNumber).toBe("BAST-SLT-202609-0001");
    expect(claim.handoverReference).toBe("BAST/2026/0001");
    expect(claim.periodStart).toBe("2026-09-01");
    expect(claim.claimedAmount).toBe(2_500_000);
    expect(claim.totalQty).toBe(4_000);
    expect(claim.totalWeightKg).toBe(12_000);
    expect(claim.claimStatus).toBe("submitted");
    expect(claim.principalInvoiceNumber).toBe("INV/999/IV/2026");
    expect(claim.statusNote).toBe("Menunggu jawaban iVendor");
    expect(claim.deliveryIds).toEqual(["22222222-2222-4222-8222-222222222222"]);
  });

  it("reads an absent handover reference, invoice number and note as undefined, not fabricated", async () => {
    getList.mockResolvedValue({ items: [claimWire()] });
    const [claim] = await transportationApiHttp.getClaims();

    expect(claim.handoverReference).toBeUndefined();
    expect(claim.principalInvoiceNumber).toBeUndefined();
    expect(claim.statusNote).toBeUndefined();
    expect(claim.deliveryIds).toEqual([]);
  });

  it("sends a claim_status filter only when one is chosen", async () => {
    getList.mockResolvedValue({ items: [] });
    await transportationApiHttp.getClaims({ claimStatus: "approved" });

    const [, params] = getList.mock.calls[0];
    expect(params.filters).toEqual([
      { field: "claim_status", operator: "eq", value: "approved" },
    ]);
  });

  it("sends no filter for the 'Semua' option", async () => {
    getList.mockResolvedValue({ items: [] });
    await transportationApiHttp.getClaims({ claimStatus: "Semua" });

    const [, params] = getList.mock.calls[0];
    expect(params.filters).toEqual([]);
  });
});

describe("createClaim", () => {
  it("sends period, handover date and an optional handover reference -- no claimed amount", async () => {
    send.mockResolvedValue(claimWire());
    await transportationApiHttp.createClaim({
      period: "2026-09",
      handoverDate: "2026-09-01",
      handoverReference: "BAST/2026/0001",
    });

    expect(send).toHaveBeenCalledWith("post", "/transportation-claims", {
      branch_id: undefined,
      period: "2026-09",
      handover_date: "2026-09-01",
      handover_reference: "BAST/2026/0001",
    });
  });
});

describe("updateClaim", () => {
  it("sends only the fields provided, alongside the version", async () => {
    send.mockResolvedValue(claimWire());
    await transportationApiHttp.updateClaim({
      id: "11111111-1111-4111-8111-111111111111",
      version: 1,
      handoverReference: "BAST/2026/0002",
    });

    expect(send).toHaveBeenCalledWith(
      "put",
      "/transportation-claims/11111111-1111-4111-8111-111111111111",
      { version: 1, handover_reference: "BAST/2026/0002" },
    );
  });
});

describe("updateClaimStatus", () => {
  it("posts to the status sub-route with the new status and optional fields", async () => {
    send.mockResolvedValue(claimWire({ claim_status: "under_review" }));
    const result = await transportationApiHttp.updateClaimStatus({
      id: "11111111-1111-4111-8111-111111111111",
      version: 2,
      claimStatus: "under_review",
      principalInvoiceNumber: "INV/1/IV/2026",
      statusNote: "Menunggu jawaban",
    });

    expect(send).toHaveBeenCalledWith(
      "post",
      "/transportation-claims/11111111-1111-4111-8111-111111111111/status",
      {
        version: 2,
        claim_status: "under_review",
        principal_invoice_number: "INV/1/IV/2026",
        status_note: "Menunggu jawaban",
        settled_at: undefined,
        settled_amount: undefined,
        settlement_mode: undefined,
      },
    );
    expect(result.claimStatus).toBe("under_review");
  });

  it("sends the three settlement fields together on the transition to paid", async () => {
    send.mockResolvedValue(claimWire({ claim_status: "paid" }));
    await transportationApiHttp.updateClaimStatus({
      id: "11111111-1111-4111-8111-111111111111",
      version: 3,
      claimStatus: "paid",
      settledAt: "2026-09-20",
      settledAmount: 2_500_000,
      settlementMode: "bank",
    });

    const [, , body] = send.mock.calls[0];
    expect(body).toMatchObject({
      settled_at: "2026-09-20",
      settled_amount: 2_500_000,
      settlement_mode: "bank",
    });
  });
});

describe("deleteClaim", () => {
  it("sends a plain delete with no body", async () => {
    send.mockResolvedValue(undefined);
    await transportationApiHttp.deleteClaim("11111111-1111-4111-8111-111111111111");

    expect(send).toHaveBeenCalledWith(
      "delete",
      "/transportation-claims/11111111-1111-4111-8111-111111111111",
    );
  });
});

describe("generateLines", () => {
  it("posts to the lines/generate sub-route with no body", async () => {
    send.mockResolvedValue(claimWire({ claimed_amount: 5_957_952, total_qty: 5_600, total_weight_kg: 16_800 }));
    const result = await transportationApiHttp.generateLines("11111111-1111-4111-8111-111111111111");

    expect(send).toHaveBeenCalledWith(
      "post",
      "/transportation-claims/11111111-1111-4111-8111-111111111111/lines/generate",
    );
    expect(result.claimedAmount).toBe(5_957_952);
    expect(result.totalQty).toBe(5_600);
  });
});

describe("getDocument", () => {
  it("maps the Berita Acara wire shape onto the console's own field names", async () => {
    getOne.mockResolvedValue({
      header: {
        claim_number: "BAST-SLT-202510-0001",
        handover_date: "2025-10-31",
        period_start: "2025-10-01",
        period_end: "2025-11-01",
        tenant_legal_name: "PT Nugroho Adhiraya",
        branch_name: "Pool Salatiga",
        claim_status: "draft",
      },
      groups: [
        {
          delivery_date: "2025-10-15",
          product_code: "LPG-003",
          product_name: "LPG 3 Kg",
          outlet_count: 1,
          qty: 89_040,
          weight_kg: 267_120,
          rate_per_kg: 354.64,
          amount: 94_731_436.8,
        },
      ],
      lines: [
        {
          no: 1,
          delivery_date: "2025-10-15",
          delivery_number: "SJ-0001",
          outlet_code: "PGKL-0001",
          outlet_name: "Pangkalan Satu",
          product_code: "LPG-003",
          qty: 89_040,
          weight_kg: 267_120,
          rate_per_kg: 354.64,
          amount: 94_731_436.8,
          has_drift: false,
        },
      ],
      footer: {
        line_count: 1,
        group_count: 1,
        total_qty: 89_040,
        total_weight_kg: 267_120,
        rates: [{ rate_per_kg: 354.64, qty: 89_040, weight_kg: 267_120, amount: 94_731_436.8 }],
        amount: 94_731_436.8,
        sum_of_line_amounts: 94_731_436.8,
        rounding_difference: 0,
        drifted_line_count: 0,
      },
      signatory: { company_name: "PT Nugroho Adhiraya", city: "Salatiga" },
    });

    const doc = await transportationApiHttp.getDocument("11111111-1111-4111-8111-111111111111");

    expect(getOne).toHaveBeenCalledWith(
      "/transportation-claims/11111111-1111-4111-8111-111111111111/document",
    );
    expect(doc.header.claimNumber).toBe("BAST-SLT-202510-0001");
    expect(doc.groups[0].outletCount).toBe(1);
    expect(doc.lines[0].hasDrift).toBe(false);
    expect(doc.footer.amount).toBe(94_731_436.8);
    expect(doc.signatory.companyName).toBe("PT Nugroho Adhiraya");
  });
});

describe("getRecap", () => {
  it("builds the query string only from the filters actually given", async () => {
    getOne.mockResolvedValue({
      from: "2026-04",
      to: "2026-09",
      rows: [],
      totals: {
        claim_count: 0,
        total_qty: 0,
        total_weight_kg: 0,
        claimed_amount: 0,
        paid_amount: 0,
        outstanding_amount: 0,
      },
    });

    await transportationApiHttp.getRecap({ from: "2026-04", to: "2026-09" });

    expect(getOne).toHaveBeenCalledWith("/transportation-claims/recap?from=2026-04&to=2026-09");
  });

  it("maps rows and totals onto the console's own field names", async () => {
    getOne.mockResolvedValue({
      from: "2026-09",
      to: "2026-09",
      rows: [
        {
          month: "2026-09",
          claim_count: 1,
          total_qty: 5_600,
          total_weight_kg: 16_800,
          claimed_amount: 5_957_952,
          paid_amount: 0,
          outstanding_amount: 5_957_952,
          avg_days_to_settle: undefined,
        },
      ],
      totals: {
        claim_count: 1,
        total_qty: 5_600,
        total_weight_kg: 16_800,
        claimed_amount: 5_957_952,
        paid_amount: 0,
        outstanding_amount: 5_957_952,
      },
    });

    const report = await transportationApiHttp.getRecap();

    expect(report.rows[0].claimedAmount).toBe(5_957_952);
    expect(report.rows[0].avgDaysToSettle).toBeUndefined();
    expect(report.totals.outstandingAmount).toBe(5_957_952);
  });
});
