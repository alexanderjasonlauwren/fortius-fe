import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for registration package templates, following
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

const { registrationPackageApiHttp } = await import("./registrationPackageApi.http");

const ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    name: "Paket Standar",
    fee_amount: 500000,
    is_default: true,
    is_active: true,
    items: [
      { product_id: PRODUCT_ID, product_code: "SEGEL-001", product_name: "Segel Tabung", qty: 1 },
    ],
    version: 1,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
});

it("maps a package's kit items", async () => {
  getOne.mockResolvedValue(wire());
  const pkg = await registrationPackageApiHttp.getPackage(ID);
  expect(pkg.items).toHaveLength(1);
  expect(pkg.items[0].productName).toBe("Segel Tabung");
  expect(pkg.feeAmount).toBe(500000);
});

it("sorts the list by name", async () => {
  getList.mockResolvedValue({ items: [] });
  await registrationPackageApiHttp.listPackages();
  const [, params] = getList.mock.calls[0];
  expect(params.sort).toEqual([{ field: "name" }]);
});

describe("writing", () => {
  it("sends a new package's fields and items", async () => {
    send.mockResolvedValue(wire());
    await registrationPackageApiHttp.createPackage({
      name: "Paket Baru",
      feeAmount: 400000,
      items: [{ productId: PRODUCT_ID, qty: 2 }],
    });
    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe("/registration-packages");
    expect(body.items).toEqual([{ product_id: PRODUCT_ID, qty: 2 }]);
  });

  it("sends the version on update", async () => {
    send.mockResolvedValue(wire());
    await registrationPackageApiHttp.updatePackage({
      id: ID, version: 3, name: "Paket Standar", feeAmount: 500000,
      isDefault: true, isActive: true,
    });
    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("put");
    expect(path).toBe(`/registration-packages/${ID}`);
    expect(body.version).toBe(3);
  });
});
