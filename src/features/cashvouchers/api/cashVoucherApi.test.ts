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

  it("voids with a version guard and a reason", async () => {
    send.mockResolvedValue(wire({ status: "void" }));
    await cashVoucherApiHttp.voidCashVoucher(ID, 2, "Salah input nominal");
    expect(send.mock.calls[0]).toEqual([
      "post",
      `/cash-vouchers/${ID}/void`,
      { version: 2, reason: "Salah input nominal" },
    ]);
  });
});
