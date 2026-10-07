import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for the agency's receiving accounts, following
 * vehicleApi.test.ts's own pattern.
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

const { bankAccountApiHttp } = await import("./bankAccountApi.http");

const ID = "11111111-1111-4111-8111-111111111111";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    bank_name: "BCA",
    account_number: "1234567890",
    account_holder: "PT Bhakta Dharma Anindita",
    branch_name: "Salatiga",
    is_default: true,
    kind: "bank",
    ledger_account_code: "1-1100",
    status: "atv",
    version: 1,
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
});

it("maps a full list of accounts", async () => {
  getList.mockResolvedValue({ items: [wire(), wire({ id: "2", is_default: false })] });
  const rows = await bankAccountApiHttp.getBankAccounts();
  expect(rows).toHaveLength(2);
  expect(rows[0].utama).toBe(true);
  expect(rows[1].utama).toBe(false);
});

it("falls back to an empty branch name", async () => {
  getList.mockResolvedValue({ items: [wire({ branch_name: undefined })] });
  expect((await bankAccountApiHttp.getBankAccounts())[0].cabang).toBe("");
});

it("maps a cash-kind account's ledger code", async () => {
  getList.mockResolvedValue({ items: [wire({ kind: "cash", ledger_account_code: "1-1000" })] });
  const row = (await bankAccountApiHttp.getBankAccounts())[0];
  expect(row.kind).toBe("cash");
  expect(row.ledgerAccountCode).toBe("1-1000");
});

describe("writing", () => {
  it("reads the version before updating and sends it back", async () => {
    getOne.mockResolvedValue(wire({ version: 6 }));
    send.mockResolvedValue(wire({ version: 7 }));

    await bankAccountApiHttp.saveBankAccount({ id: ID, nomorRekening: "9999999999" });

    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("put");
    expect(path).toBe(`/bank-accounts/${ID}`);
    expect(body.version).toBe(6);
    expect(body.account_number).toBe("9999999999");
  });

  it("posts a create without a version", async () => {
    send.mockResolvedValue(wire());
    await bankAccountApiHttp.saveBankAccount({
      bank: "BNI",
      nomorRekening: "1111111111",
      atasNama: "PT Contoh",
    });

    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe("/bank-accounts");
    expect(body.version).toBeUndefined();
    expect(getOne).not.toHaveBeenCalled();
  });

  it("sends kind on create", async () => {
    send.mockResolvedValue(wire({ kind: "cash", ledger_account_code: "1-1000" }));
    await bankAccountApiHttp.saveBankAccount({
      bank: "BCA",
      nomorRekening: "KAS-KECIL",
      atasNama: "PT Contoh",
      kind: "cash",
    });

    const [, , body] = send.mock.calls[0];
    expect(body.kind).toBe("cash");
  });

  it("deletes by id", async () => {
    send.mockResolvedValue(undefined);
    await bankAccountApiHttp.deleteBankAccount(ID);
    expect(send.mock.calls[0]).toEqual(["delete", `/bank-accounts/${ID}`]);
  });
});
