import { expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for the opening-balance wizard, following
 * externalstatementsApi.test.ts's own pattern (getTemplate's DOM download
 * side effect is not asserted on there either -- nothing to check beyond
 * "a download was triggered").
 */

const upload = vi.fn();

vi.mock("@/lib/api", () => ({
  apiClient: { get: vi.fn() },
  getList: vi.fn(),
  getOne: vi.fn(),
  send: vi.fn(),
  upload: (...args: unknown[]) => upload(...args),
}));

const { openingBalanceApiHttp } = await import("./openingBalanceApi.http");

const FILE = new File(["x"], "saldo-awal.xlsx");

beforeEach(() => {
  upload.mockReset();
});

it("sends as_of alongside the file on preview, and maps the result", async () => {
  upload.mockResolvedValue({
    as_of: "2026-01-01", balanced: false,
    errors: [{ sheet: "Piutang", row: 3, message: "Akun tidak ditemukan" }],
    trial_balance_rows: 42, total_debit: 1_000_000, total_credit: 1_000_000,
    piutang_rows: 2, hutang_rows: 1, aset_rows: 0,
  });

  const preview = await openingBalanceApiHttp.previewOpeningBalance("2026-01-01", FILE);

  const [path, file, field, , fields] = upload.mock.calls[0];
  expect(path).toBe("/opening-balance/preview");
  expect(file).toBe(FILE);
  expect(field).toBe("file");
  expect(fields).toEqual({ as_of: "2026-01-01" });
  expect(preview.balanced).toBe(false);
  expect(preview.errors).toHaveLength(1);
  expect(preview.errors[0]).toEqual({ sheet: "Piutang", row: 3, message: "Akun tidak ditemukan" });
});

it("maps a commit result", async () => {
  upload.mockResolvedValue({
    journal_id: "jrn-1", invoices_created: 3, purchases_created: 1, assets_created: 2,
  });

  const result = await openingBalanceApiHttp.commitOpeningBalance("2026-01-01", FILE);

  expect(upload.mock.calls[0][0]).toBe("/opening-balance/commit");
  expect(result).toEqual({ journalId: "jrn-1", invoicesCreated: 3, purchasesCreated: 1, assetsCreated: 2 });
});
