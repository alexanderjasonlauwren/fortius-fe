import { describe, expect, it, vi, beforeEach } from "vitest";

const send = vi.fn();
vi.mock("@/lib/api", () => ({
  getOne: vi.fn(),
  getAllPages: vi.fn(),
  send: (...args: unknown[]) => send(...args),
}));

const { updateTenant } = await import("./tenancyApi.http");

beforeEach(() => send.mockReset());

describe("updateTenant", () => {
  it("sends the name and description at the version read; an empty description is cleared", async () => {
    send.mockResolvedValue({});
    await updateTenant("t-1", { nama: "  PT Agen Baru ", deskripsi: "   ", versi: 4 });
    expect(send).toHaveBeenLastCalledWith("put", "/tenants/t-1", {
      name: "PT Agen Baru",
      description: null,
      version: 4,
    });
  });
});
