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
          rate_basis: "per_kg", rate: 354.64,
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
          rate_basis: "per_kg", rate: 354.64,
          amount: 94_731_436.8,
          has_drift: false,
        },
      ],
      footer: {
        line_count: 1,
        group_count: 1,
        total_qty: 89_040,
        total_weight_kg: 267_120,
        rates: [{ rate_basis: "per_kg", rate: 354.64, qty: 89_040, weight_kg: 267_120, amount: 94_731_436.8 }],
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
    // Each rate travels with its basis (client decision G5).
    expect(doc.lines[0]).toMatchObject({ rateBasis: "per_kg", rate: 354.64 });
    expect(doc.groups[0]).toMatchObject({ rateBasis: "per_kg", rate: 354.64 });
    expect(doc.footer.rates[0]).toMatchObject({ rateBasis: "per_kg", rate: 354.64 });
  });
});

describe("tariff display", () => {
  it("names the unit the rate is priced in", async () => {
    const { formatTariff } = await import("../lib/rate");
    const { unitLabel } = await import("@/lib/lexicon");
    // The tenant's own word for a unit: "tabung" for an LPG agent.
    expect(formatTariff(1050, "per_unit")).toBe(`Rp 1.050/${unitLabel()}`);
    expect(formatTariff(354.64, "per_kg")).toBe("Rp 354,64/kg");
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

describe("BA LO from SIM3LON", () => {
  it("pulls a draft's LOs through its own sub-route", async () => {
    send.mockResolvedValue(claimWire({ claimed_amount: 12_937_267.2, total_qty: 12_160, total_weight_kg: 36_480 }));
    const out = await transportationApiHttp.generateFromSim3lon("11111111-1111-4111-8111-111111111111");
    expect(send).toHaveBeenCalledWith(
      "post",
      "/transportation-claims/11111111-1111-4111-8111-111111111111/lines/from-sim3lon",
    );
    expect(out.totalWeightKg).toBe(36_480);
  });

  it("reads a BA LO document's LO lines and keeps a delivery document as it was", async () => {
    const base = {
      header: { claim_number: "BAST-1", handover_date: "2026-04-02", tenant_legal_name: "PT Bhakta", branch_name: "SLT", claim_status: "draft" },
      groups: [],
      lines: [],
      footer: {
        line_count: 1, group_count: 0, total_qty: 360, total_weight_kg: 1080,
        rates: [{ rate_basis: "per_kg", rate: 354.64, qty: 360, weight_kg: 1080, amount: 383_011.2 }],
        amount: 383_011.2, sum_of_line_amounts: 383_011.2, rounding_difference: 0, drifted_line_count: 0,
      },
      signatory: { company_name: "PT Bhakta", title: "Direktur" },
    };
    getOne.mockResolvedValueOnce({
      ...base,
      kind: "lo",
      loading_orders: [{ no: 1, date: "2026-03-02", lo_number: "8135493179", so_number: "0002633368",
        material: "REFILL/ISI LPG @3KG (NET)", qty_pcs: 360, qty_kg: 1080, rate_per_kg: 354.64, amount: 383_011.2 }],
    });
    const lo = await transportationApiHttp.getDocument("c-1");
    expect(lo.kind).toBe("lo");
    expect(lo.loadingOrders[0]).toMatchObject({ loNumber: "8135493179", qtyKg: 1080, ratePerKg: 354.64 });

    getOne.mockResolvedValueOnce(base);
    const deliveries = await transportationApiHttp.getDocument("c-2");
    expect(deliveries.kind).toBe("deliveries");
    expect(deliveries.loadingOrders).toEqual([]);
  });

  it("sends the tax Pertamina withheld with a payment", async () => {
    send.mockResolvedValue(claimWire({ claim_status: "paid", settled_amount: 12_678_521.86, tax_withheld: 258_745.34 }));
    const out = await transportationApiHttp.updateClaimStatus({
      id: "c-1", version: 3, claimStatus: "paid", settledAt: "2026-04-20",
      settledAmount: 12_678_521.86, taxWithheld: 258_745.34, settlementMode: "bank",
    });
    const [, , body] = send.mock.calls[0];
    expect(body).toMatchObject({ settled_amount: 12_678_521.86, tax_withheld: 258_745.34 });
    expect(out.taxWithheld).toBe(258_745.34);
  });
});

describe("transport fee invoice", () => {
  const invoiceWire = {
    id: "33333333-3333-4333-8333-333333333333",
    claim_id: "c-9",
    claim_number: "BAST-SLT-202610-0003",
    claim_status: "approved",
    invoice_number: "01/PT.BDA/TF/12102026",
    invoice_date: "2026-10-12",
    recipient_name: "PT. PERTAMINA PATRA NIAGA",
    order_reference: "SP - 001/PND700000/2025-S0",
    order_date: "2025-01-03",
    tax_invoice_number: "08002600419112271",
    description: "Transport fee Agen LPG 3kg Periode September 2026",
    amount: 12_298_915,
    vat_rate: 12,
    vat_amount: 0,
    total: 12_298_915,
    bank: { id: "b-1", bank_name: "BNI", account_number: "1792837164", account_holder: "PT. BHAKTA DHARMA ANINDITA" },
    signatory: { company_name: "PT. Bhakta Dharma Anindita", name: "Bimbo Adhi Nugroho" },
  };

  it("reads an issued invoice onto the console's names", async () => {
    getOne.mockResolvedValue(invoiceWire);
    const out = await transportationApiHttp.getInvoice("c-9");
    expect(getOne).toHaveBeenCalledWith("/transportation-claims/c-9/invoice");
    expect(out).toMatchObject({
      invoiceNumber: "01/PT.BDA/TF/12102026",
      orderReference: "SP - 001/PND700000/2025-S0",
      taxInvoiceNumber: "08002600419112271",
      total: 12_298_915,
      bank: { bankName: "BNI", accountNumber: "1792837164" },
      signatory: { name: "Bimbo Adhi Nugroho" },
    });
  });

  it("leaves blank optional fields out, so the server never sees an empty date", async () => {
    send.mockResolvedValue(invoiceWire);
    await transportationApiHttp.createInvoice({
      claimId: "c-9",
      invoiceNumber: " 01/PT.BDA/TF/12102026 ",
      invoiceDate: "2026-10-12",
      recipientName: "PT. PERTAMINA PATRA NIAGA",
      orderReference: "SP - 001/PND700000/2025-S0",
      orderDate: "",
      taxInvoiceDate: "  ",
      description: "Transport fee Agen LPG 3kg Periode September 2026",
      vatAmount: 0,
      bankAccountId: "b-1",
    });
    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe("/transportation-claims/c-9/invoice");
    expect(body).toMatchObject({ invoice_number: "01/PT.BDA/TF/12102026", bank_account_id: "b-1", vat_amount: 0 });
    expect(body.order_date).toBeUndefined();
    expect(body.tax_invoice_date).toBeUndefined();
    expect(body).not.toHaveProperty("amount");
  });

  it("lists every issued invoice", async () => {
    getOne.mockResolvedValue([invoiceWire]);
    const out = await transportationApiHttp.listInvoices();
    expect(getOne).toHaveBeenCalledWith("/transportation-claims/invoices");
    expect(out[0].claimNumber).toBe("BAST-SLT-202610-0003");
  });
});

// Regression 2026-10-24 F10: the status dialog offered every status, and a
// submitted claim could be marked paid. It offers what the backend allows.
describe("CLAIM_NEXT_STATUSES", () => {
  it("reaches paid only through review and approval, and ends at paid or rejected", async () => {
    const { CLAIM_NEXT_STATUSES } = await import("./contract");
    const reachesPaid = Object.entries(CLAIM_NEXT_STATUSES)
      .filter(([, next]) => next.includes("paid"))
      .map(([from]) => from);
    expect(reachesPaid).toEqual(["approved"]);
    expect(CLAIM_NEXT_STATUSES.paid).toEqual([]);
    expect(CLAIM_NEXT_STATUSES.rejected).toEqual([]);
    expect(CLAIM_NEXT_STATUSES.submitted).toEqual(["under_review", "rejected"]);
  });
});
