import { beforeEach, describe, expect, it, vi } from "vitest";

const getOne = vi.fn();
const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({
  getOne: (...args: unknown[]) => getOne(...args),
  getList: vi.fn(),
  apiClient: { get: (...args: unknown[]) => apiGet(...args) },
}));

const { financialstatementsApiHttp: api } = await import("./financialstatementsApi.http");

beforeEach(() => { getOne.mockReset(); apiGet.mockReset(); });

describe("statement formats (parity P4)", () => {
  it("lists the layouts a statement can be drawn on", async () => {
    getOne.mockResolvedValue([
      { code: "laba_rugi_v2", name: "Laporan Laba Rugi", kind: "profit_loss", is_default: true },
      { code: "laba_rugi", name: "Laporan Laba Rugi (format 2025)", kind: "profit_loss", is_default: false },
    ]);
    const layouts = await api.getLayouts();
    expect(getOne).toHaveBeenCalledWith("/financial-statements/layouts");
    expect(layouts).toEqual([
      { code: "laba_rugi_v2", name: "Laporan Laba Rugi", kind: "profit_loss", isDefault: true },
      { code: "laba_rugi", name: "Laporan Laba Rugi (format 2025)", kind: "profit_loss", isDefault: false },
    ]);
  });

  it("draws a statement on the chosen layout, and the default when none is chosen", async () => {
    getOne.mockResolvedValue({ lines: [], warnings: [], layout: { code: "laba_rugi", name: "x" }, company: { legal_name: "PT" } });
    await api.getProfitAndLoss({ from: "2025-01-01", to: "2025-12-31", layout: "laba_rugi" }).catch(() => undefined);
    expect(getOne.mock.calls[0][0]).toContain("layout=laba_rugi");
    getOne.mockClear();
    await api.getBalanceSheet({ asOf: "2025-12-31" }).catch(() => undefined);
    expect(getOne.mock.calls[0][0]).not.toContain("layout=");
  });

  it("exports with the layouts on screen", async () => {
    apiGet.mockResolvedValue({ headers: {}, data: new Blob(["x"]) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    const click = vi.fn();
    vi.stubGlobal("document", { createElement: () => ({ click, remove: () => undefined, set href(_: string) {}, set download(_: string) {} }), body: { appendChild: () => undefined } });
    await api.downloadPackage({ fiscalYear: 2025, layoutProfitLoss: "laba_rugi", layoutBalanceSheet: "neraca" }).catch(() => undefined);
    const url = apiGet.mock.calls[0][0] as string;
    expect(url).toContain("layout_profit_loss=laba_rugi");
    expect(url).toContain("layout_balance_sheet=neraca");
    vi.unstubAllGlobals();
  });
});
