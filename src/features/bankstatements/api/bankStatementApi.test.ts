import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for rekening koran import/auto-match/
 * classification/reconciliation, following bankAccountApi.test.ts's own
 * pattern.
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

const { bankStatementApiHttp } = await import("./bankStatementApi.http");

const BANK_ID = "11111111-1111-4111-8111-111111111111";
const IMPORT_ID = "22222222-2222-4222-8222-222222222222";
const LINE_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
  upload.mockReset();
});

it("uploads with bank_account_id and period as form fields", async () => {
  upload.mockResolvedValue({
    id: IMPORT_ID,
    bank_account_id: BANK_ID,
    bank_account_label: "BCA 123",
    period_from: "2026-09-01",
    period_to: "2026-09-30",
    opening_balance: 1000,
    closing_balance: 2000,
    file_name: "koran.xlsx",
    row_count: 3,
    new_row_count: 3,
    created_at: "2026-10-01T00:00:00Z",
  });

  const file = new File(["x"], "koran.xlsx");
  await bankStatementApiHttp.importStatement({
    file,
    bankAccountId: BANK_ID,
    periodFrom: "2026-09-01",
    periodTo: "2026-09-30",
    openingBalance: 1000,
    closingBalance: 2000,
  });

  const [path, uploadedFile, field, , fields] = upload.mock.calls[0];
  expect(path).toBe("/bank-statements/import");
  expect(uploadedFile).toBe(file);
  expect(field).toBe("file");
  expect(fields.bank_account_id).toBe(BANK_ID);
  expect(fields.opening_balance).toBe("1000");
});

it("omits unset column mapping fields", async () => {
  upload.mockResolvedValue({
    id: IMPORT_ID, bank_account_id: BANK_ID, bank_account_label: "", period_from: "", period_to: "",
    opening_balance: 0, closing_balance: 0, file_name: "x.xlsx", row_count: 0, new_row_count: 0, created_at: "",
  });
  await bankStatementApiHttp.importStatement({
    file: new File(["x"], "x.xlsx"),
    bankAccountId: BANK_ID,
    periodFrom: "2026-09-01",
    periodTo: "2026-09-30",
    openingBalance: 0,
    closingBalance: 0,
    columnMapping: { dateCol: 2 },
  });
  const [, , , , fields] = upload.mock.calls[0];
  expect(fields.date_col).toBe("2");
  expect(fields.header_row).toBeUndefined();
});

it("maps auto-match's snake_case counts", async () => {
  send.mockResolvedValue({ matched: 2, posted: 1, still_unmatched: 3 });
  const result = await bankStatementApiHttp.autoMatch(IMPORT_ID);
  expect(result).toEqual({ matched: 2, posted: 1, stillUnmatched: 3 });
  expect(send.mock.calls[0]).toEqual(["post", `/bank-statements/${IMPORT_ID}/auto-match`]);
});

it("classifies a line with exactly the fields given", async () => {
  send.mockResolvedValue({
    id: LINE_ID, line_no: 1, line_date: "2026-09-05", description: "x", reference: "",
    debit: 0, credit: 50000, status: "posted",
  });
  await bankStatementApiHttp.classifyLine({ lineId: LINE_ID, accountId: "acc-1" });
  expect(send.mock.calls[0]).toEqual([
    "post",
    `/bank-statements/lines/${LINE_ID}/classify`,
    { account_id: "acc-1", match_source_type: undefined, match_source_id: undefined, ignore: undefined },
  ]);
});

it("builds the reconciliation query string", async () => {
  getOne.mockResolvedValue({
    bank_account_id: BANK_ID, as_of: "2026-09-30", statement_balance: 2000,
    ledger_balance: 1900, difference: 100, unmatched_count: 1,
  });
  const result = await bankStatementApiHttp.getReconciliation(BANK_ID, "2026-09-30");
  expect(getOne.mock.calls[0][0]).toBe(
    `/bank-statements/reconciliation?bank_account_id=${BANK_ID}&as_of=2026-09-30`,
  );
  expect(result.difference).toBe(100);
});

describe("rules", () => {
  it("sorts by sort_order", async () => {
    getList.mockResolvedValue({ items: [] });
    await bankStatementApiHttp.listRules();
    const [, params] = getList.mock.calls[0];
    expect(params.sort).toEqual([{ field: "sort_order" }]);
  });

  it("sends a new rule's fields", async () => {
    send.mockResolvedValue({
      id: "r1", pattern: "ADM", direction: "out", account_id: "acc-1", account_code: "5-6100",
      account_name: "Administrasi Bank", sort_order: 0, is_active: true, version: 1,
      created_at: "", updated_at: "",
    });
    await bankStatementApiHttp.createRule({ pattern: "ADM", direction: "out", accountId: "acc-1" });
    const [, , body] = send.mock.calls[0];
    expect(body).toEqual({ pattern: "ADM", direction: "out", account_id: "acc-1", sort_order: 0 });
  });
});
