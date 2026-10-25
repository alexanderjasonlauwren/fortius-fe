import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for expense categories, following
 * registrationPackageApi.test.ts's own pattern.
 */

const getList = vi.fn();
const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: vi.fn(),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const { expenseCategoryApiHttp } = await import("./expenseCategoryApi.http");

const ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    code: "fuel",
    name: "BBM",
    account_id: ACCOUNT_ID,
    account_code: "5-3100",
    group_label: "Biaya Logistik",
    sort_order: 1,
    status: "atv",
    version: 1,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  send.mockReset();
});

describe("getExpenseCategories", () => {
  it("maps the wire shape, sorted by sort_order", async () => {
    getList.mockResolvedValue({ items: [wire()] });

    const [row] = await expenseCategoryApiHttp.getExpenseCategories();

    expect(row).toEqual({
      id: ID,
      code: "fuel",
      name: "BBM",
      accountId: ACCOUNT_ID,
      accountCode: "5-3100",
      accountName: "5-3100",
      groupLabel: "Biaya Logistik",
      sortOrder: 1,
      status: "atv",
      version: 1,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    });
    expect(getList.mock.calls[0][1]).toMatchObject({ sort: [{ field: "sort_order" }] });
  });
});

describe("createExpenseCategory", () => {
  it("maps a create input to the backend's wire shape", async () => {
    send.mockResolvedValue(wire({ code: "new_cat", name: "Kategori Baru" }));

    await expenseCategoryApiHttp.createExpenseCategory({
      code: "new_cat",
      name: "Kategori Baru",
      accountId: ACCOUNT_ID,
      groupLabel: "HR & GA",
      sortOrder: 13,
    });

    expect(send).toHaveBeenCalledWith("post", "/expense-categories", {
      code: "new_cat",
      name: "Kategori Baru",
      account_id: ACCOUNT_ID,
      group_label: "HR & GA",
      sort_order: 13,
    });
  });
});

describe("updateExpenseCategory", () => {
  it("sends the version and only the changed fields", async () => {
    send.mockResolvedValue(wire({ status: "ina" }));

    await expenseCategoryApiHttp.updateExpenseCategory({
      id: ID,
      version: 2,
      status: "ina",
    });

    expect(send).toHaveBeenCalledWith("put", `/expense-categories/${ID}`, {
      version: 2,
      name: undefined,
      account_id: undefined,
      group_label: undefined,
      sort_order: undefined,
      status: "ina",
    });
  });
});

describe("deleteExpenseCategory", () => {
  it("sends a DELETE to the category's own path", async () => {
    await expenseCategoryApiHttp.deleteExpenseCategory(ID);
    expect(send).toHaveBeenCalledWith("delete", `/expense-categories/${ID}`);
  });
});
