import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for vendors, following
 * expenseCategoryApi.test.ts's own pattern.
 */

const getList = vi.fn();
const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: vi.fn(),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const { vendorApiHttp } = await import("./vendorApi.http");

const ID = "11111111-1111-4111-8111-111111111111";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    code: "VND-001",
    name: "UD. Sumber Logam",
    npwp: "01.234.567.8-901.000",
    address: "Jl. Industri No. 12",
    phone: "0298-123-456",
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

describe("getVendors", () => {
  it("maps the wire shape", async () => {
    getList.mockResolvedValue({ items: [wire()] });

    const [row] = await vendorApiHttp.getVendors();

    expect(row).toEqual({
      id: ID,
      code: "VND-001",
      name: "UD. Sumber Logam",
      npwp: "01.234.567.8-901.000",
      address: "Jl. Industri No. 12",
      phone: "0298-123-456",
      status: "atv",
      version: 1,
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    });
  });
});

describe("createVendor", () => {
  it("maps a create input to the backend's wire shape", async () => {
    send.mockResolvedValue(wire());

    await vendorApiHttp.createVendor({
      code: "VND-001",
      name: "UD. Sumber Logam",
      npwp: "01.234.567.8-901.000",
      address: "Jl. Industri No. 12",
      phone: "0298-123-456",
    });

    expect(send).toHaveBeenCalledWith("post", "/suppliers", {
      code: "VND-001",
      name: "UD. Sumber Logam",
      npwp: "01.234.567.8-901.000",
      address: "Jl. Industri No. 12",
      phone: "0298-123-456",
    });
  });
});

describe("updateVendor", () => {
  it("sends the version and the changed fields", async () => {
    send.mockResolvedValue(wire({ status: "ina" }));

    await vendorApiHttp.updateVendor({ id: ID, version: 2, status: "ina" });

    expect(send).toHaveBeenCalledWith("put", `/suppliers/${ID}`, {
      version: 2,
      name: undefined,
      npwp: undefined,
      address: undefined,
      phone: undefined,
      status: "ina",
    });
  });
});

describe("deleteVendor", () => {
  it("sends a DELETE to the vendor's own path", async () => {
    await vendorApiHttp.deleteVendor(ID);
    expect(send).toHaveBeenCalledWith("delete", `/suppliers/${ID}`);
  });
});

describe("contact, terms and bank (parity P3)", () => {
  const row = {
    id: "v-1", code: "VND-1", name: "UD. Sumber Logam", status: "atv", version: 2, created_at: "", updated_at: "",
    email: "a@b.test", contact_person: "Pak Hadi", payment_terms_days: 14,
    bank_name: "BRI", bank_account_number: "0012", bank_account_holder: "UD. Sumber Logam",
  };

  it("reads them back", async () => {
    getList.mockResolvedValue({ items: [row] });
    const [v] = await vendorApiHttp.getVendors();
    expect(v).toMatchObject({ email: "a@b.test", contactPerson: "Pak Hadi", paymentTermsDays: 14, bankName: "BRI", bankAccountNumber: "0012", bankAccountHolder: "UD. Sumber Logam" });
  });

  it("sends them on update, a blank as blank so the backend clears it", async () => {
    send.mockResolvedValue(row);
    await vendorApiHttp.updateVendor({ id: "v-1", version: 2, email: "", paymentTermsDays: 30, bankName: "BCA" });
    expect(send.mock.calls[0][2]).toMatchObject({ version: 2, email: "", payment_terms_days: 30, bank_name: "BCA" });
  });
});
