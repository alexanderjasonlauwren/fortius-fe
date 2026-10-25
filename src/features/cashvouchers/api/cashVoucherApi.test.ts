import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for cash vouchers, following
 * bankAccountApi.test.ts's own pattern.
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

const { cashVoucherApiHttp } = await import("./cashVoucherApi.http");

const ID = "11111111-1111-4111-8111-111111111111";
const BANK_ID = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_ID = "33333333-3333-4333-8333-333333333333";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    voucher_number: "KV-202610-0001",
    voucher_type: "receipt",
    voucher_date: "2026-10-07",
    counterparty: "Bank BCA",
    description: "Jasa giro Oktober",
    bank_account_id: BANK_ID,
    bank_account_label: "BCA 123-456",
    total_amount: 50000,
    status: "draft",
    lines: [
      { account_id: ACCOUNT_ID, account_code: "4-3100", account_name: "Pendapatan Jasa Giro", amount: 50000 },
    ],
    version: 1,
    created_at: "2026-10-07T00:00:00Z",
    updated_at: "2026-10-07T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
});

it("maps a voucher's lines", async () => {
  getList.mockResolvedValue({ items: [wire()] });
  const rows = await cashVoucherApiHttp.listCashVouchers();
  expect(rows).toHaveLength(1);
  expect(rows[0].lines[0].accountCode).toBe("4-3100");
  expect(rows[0].voucherType).toBe("receipt");
});

it("sends voucher_type filters as eq filters", async () => {
  getList.mockResolvedValue({ items: [] });
  await cashVoucherApiHttp.listCashVouchers({ voucherType: "disbursement", status: "posted" });
  const [, params] = getList.mock.calls[0];
  expect(params.filters).toEqual([
    { field: "voucher_type", operator: "eq", value: "disbursement" },
    { field: "status", operator: "eq", value: "posted" },
  ]);
});

describe("creating", () => {
  it("sends a receipt with lines, no counter account", async () => {
    send.mockResolvedValue(wire());
    await cashVoucherApiHttp.createCashVoucher({
      voucherType: "receipt",
      voucherDate: "2026-10-07",
      bankAccountId: BANK_ID,
      lines: [{ accountId: ACCOUNT_ID, amount: 50000 }],
    });

    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe("/cash-vouchers");
    expect(body.lines).toEqual([{ account_id: ACCOUNT_ID, amount: 50000, memo: undefined }]);
    expect(body.amount).toBeUndefined();
  });

  it("sends a transfer with an amount, no lines", async () => {
    send.mockResolvedValue(wire({ voucher_type: "transfer", lines: [] }));
    await cashVoucherApiHttp.createCashVoucher({
      voucherType: "transfer",
      voucherDate: "2026-10-07",
      bankAccountId: BANK_ID,
      counterBankAccountId: "44444444-4444-4444-8444-444444444444",
      amount: 500000,
    });

    const [, , body] = send.mock.calls[0];
    expect(body.amount).toBe(500000);
    expect(body.lines).toBeUndefined();
    expect(body.counter_bank_account_id).toBe("44444444-4444-4444-8444-444444444444");
  });
});

describe("lifecycle", () => {
  it("posts with a version guard", async () => {
    send.mockResolvedValue(wire({ status: "posted" }));
    await cashVoucherApiHttp.postCashVoucher(ID, 1);
    expect(send.mock.calls[0]).toEqual(["post", `/cash-vouchers/${ID}/post`, { version: 1 }]);
  });
});

describe("reference, contact and draft delete (parity P3)", () => {
  it("reads the reference, contact and branch", async () => {
    getOne.mockResolvedValue(wire({
      reference_number: "TRF-01", supplier_id: "sup-1", supplier_name: "UD. Sumber Logam",
      branch_id: "br-1", branch_name: "Pool Salatiga", status: "void", void_reason: "ganda",
    }));
    const v = await cashVoucherApiHttp.getCashVoucher(ID);
    expect(v).toMatchObject({
      referenceNumber: "TRF-01", supplierId: "sup-1", supplierName: "UD. Sumber Logam",
      branchId: "br-1", branchName: "Pool Salatiga", voidReason: "ganda",
    });
  });

  it("sends one contact, a trimmed reference and per-line memos", async () => {
    send.mockResolvedValue(wire());
    await cashVoucherApiHttp.createCashVoucher({
      voucherType: "disbursement", voucherDate: "2026-10-14", bankAccountId: BANK_ID,
      referenceNumber: "  TRF-01 ", supplierId: "sup-1", outletId: "out-1", counterparty: "  ",
      lines: [{ accountId: ACCOUNT_ID, amount: 2500, memo: " biaya transfer " }, { accountId: ACCOUNT_ID, amount: 1, memo: "" }],
    });
    const body = send.mock.calls[0][2];
    expect(body).toMatchObject({ reference_number: "TRF-01", supplier_id: "sup-1" });
    expect(body.outlet_id).toBeUndefined();
    expect(body.counterparty).toBeUndefined();
    expect(body.lines).toEqual([
      { account_id: ACCOUNT_ID, amount: 2500, memo: "biaya transfer" },
      { account_id: ACCOUNT_ID, amount: 1, memo: undefined },
    ]);
  });

  it("sends a pangkalan contact on update when no vendor is named", async () => {
    send.mockResolvedValue(wire());
    await cashVoucherApiHttp.updateCashVoucher({
      id: ID, version: 2, voucherDate: "2026-10-14", bankAccountId: BANK_ID, outletId: "out-1",
      lines: [{ accountId: ACCOUNT_ID, amount: 10 }],
    });
    expect(send.mock.calls[0][1]).toBe(`/cash-vouchers/${ID}`);
    expect(send.mock.calls[0][2]).toMatchObject({ version: 2, outlet_id: "out-1" });
    expect(send.mock.calls[0][2].supplier_id).toBeUndefined();
  });

  it("filters by contact, account and date range", async () => {
    getList.mockResolvedValue({ items: [] });
    await cashVoucherApiHttp.listCashVouchers({ supplierId: "sup-1", bankAccountId: BANK_ID, from: "2026-10-01", to: "2026-10-31", search: " TRF " });
    expect(getList.mock.calls[0][1]).toMatchObject({
      search: "TRF",
      filters: [
        { field: "supplier_id", operator: "eq", value: "sup-1" },
        { field: "bank_account_id", operator: "eq", value: BANK_ID },
        { field: "date", operator: "gte", value: "2026-10-01" },
        { field: "date", operator: "lte", value: "2026-10-31" },
      ],
    });
  });

  it("deletes a draft by id", async () => {
    send.mockResolvedValue(undefined);
    await cashVoucherApiHttp.deleteCashVoucher(ID);
    expect(send).toHaveBeenCalledWith("delete", `/cash-vouchers/${ID}`);
  });
});
