import { beforeEach, describe, expect, it, vi } from "vitest";

const getOne = vi.fn();
const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({
  getOne: (...args: unknown[]) => getOne(...args),
  apiClient: { get: (...args: unknown[]) => apiGet(...args) },
}));

const { financereportsApiHttp: api } = await import("./financereportsApi.http");
const { periodFromParams, periodToParams, recallPeriod, rememberPeriod, resolveRange } = await import("../lib/period");
const { reportLinkHref } = await import("../lib/links");
const { formatReportCell, reportPrintHtml } = await import("../lib/render");

beforeEach(() => { getOne.mockReset(); apiGet.mockReset(); });

describe("report pack adapter (parity P5)", () => {
  it("reads the catalogue", async () => {
    getOne.mockResolvedValue([
      { key: "ar_aging", title: "Umur Piutang", category: "penjualan", description: "d", period_kind: "as_of", branched: true },
    ]);
    expect(await api.getCatalogue()).toEqual([
      { key: "ar_aging", title: "Umur Piutang", category: "penjualan", description: "d", periodKind: "as_of", branched: true },
    ]);
    expect(getOne).toHaveBeenCalledWith("/reports");
  });

  it("asks a range report for its window and an as-of report for its date, never both", async () => {
    const body = { key: "k", title: "t", period: {}, company: { legal_name: "PT" }, columns: [], rows: null, checks: null };
    getOne.mockResolvedValue(body);
    await api.getReport("cash_flow", { from: "2026-10-01", to: "2026-10-31", branchId: "b-1" });
    const range = getOne.mock.calls[0][0] as string;
    expect(range).toMatch(/^\/reports\/cash_flow\?/);
    expect(range).toContain("date_from=2026-10-01");
    expect(range).toContain("date_to=2026-10-31");
    expect(range).toContain("branch_id=b-1");
    expect(range).not.toContain("as_of");

    getOne.mockClear();
    await api.getReport("ar_aging", { asOf: "2026-10-15" });
    const asOf = getOne.mock.calls[0][0] as string;
    expect(asOf).toContain("as_of=2026-10-15");
    expect(asOf).not.toContain("date_from");
    expect(asOf).not.toContain("branch_id");
  });

  it("maps a report, trimming the period to dates and tolerating null lists", async () => {
    getOne.mockResolvedValue({
      key: "ar_aging", title: "Umur Piutang",
      period: { as_of: "2026-10-15T00:00:00Z" },
      company: { legal_name: "PT BDA" },
      columns: [{ key: "label", label: "Dokumen", kind: "text" }],
      rows: [{ kind: "line", level: 1, cells: { label: "INV-1" }, link: { type: "invoice", id: "u-1" } }],
      checks: [{ label: "tie", expected: 10, actual: 10, ok: true }],
    });
    const r = await api.getReport("ar_aging", { asOf: "2026-10-15" });
    expect(r.period).toEqual({ from: undefined, to: undefined, asOf: "2026-10-15" });
    expect(r.company.legalName).toBe("PT BDA");
    expect(r.rows[0].link).toEqual({ type: "invoice", id: "u-1" });
    expect(r.checks[0].ok).toBe(true);
    expect(r.notes).toEqual([]);
  });

  it("exports the report on screen", async () => {
    apiGet.mockResolvedValue({ headers: { "content-disposition": 'attachment; filename="Umur_Piutang_2026-10-15.xlsx"' }, data: new Blob(["x"]) });
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined });
    const anchor = { click: vi.fn(), remove: () => undefined, href: "", download: "" };
    vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild: () => undefined } });
    await api.downloadReport("ar_aging", { asOf: "2026-10-15" });
    expect(apiGet.mock.calls[0][0]).toBe("/reports/ar_aging/export?as_of=2026-10-15");
    expect(apiGet.mock.calls[0][1]).toEqual({ responseType: "blob" });
    expect(anchor.download).toBe("Umur_Piutang_2026-10-15.xlsx");
    expect(anchor.click).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("report periods", () => {
  const at = (q: string) => periodFromParams(new URLSearchParams(q), "2026-10-15");

  it("defaults to this month", () => {
    expect(resolveRange(at(""))).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("resolves each preset", () => {
    expect(resolveRange(at("p=harian&d=2026-10-15"))).toEqual({ from: "2026-10-15", to: "2026-10-15" });
    // 15 Oct 2026 is a Thursday: Monday 12th to Sunday 18th.
    expect(resolveRange(at("p=mingguan&d=2026-10-15"))).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    // A Sunday belongs to the week that started the Monday before.
    expect(resolveRange(at("p=mingguan&d=2026-10-18"))).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(resolveRange(at("p=bulanan&y=2024&m=2"))).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(resolveRange(at("p=tahunan&y=2025"))).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(resolveRange(at("p=custom&from=2026-03-05&to=2026-04-20"))).toEqual({ from: "2026-03-05", to: "2026-04-20" });
  });

  it("never asks for a window that ends before it starts", () => {
    expect(resolveRange(at("p=custom&from=2026-05-01&to=2026-04-01"))).toEqual({ from: "2026-05-01", to: "2026-05-01" });
  });

  it("ignores junk in the URL and keeps other parameters", () => {
    const s = at("p=nope&y=abc&m=13&d=2026-02-30x&cabang=semua");
    expect(s).toMatchObject({ preset: "bulanan", year: 2026, month: 10, date: "2026-10-15" });
    const out = periodToParams(s, new URLSearchParams("cabang=semua"));
    expect(out.get("cabang")).toBe("semua");
    expect(out.get("p")).toBe("bulanan");
  });
});

describe("report rows", () => {
  it("drill down to the document or account they came from", () => {
    expect(reportLinkHref({ type: "invoice", id: "i" })).toBe("/receivables/i");
    expect(reportLinkHref({ type: "purchase", id: "p" })).toBe("/purchases/p");
    expect(reportLinkHref({ type: "outlet", id: "o" })).toBe("/outlet/o");
    expect(reportLinkHref({ type: "claim", id: "c" })).toBe("/transportation-claims/c");
    expect(reportLinkHref({ type: "account", id: "a" })).toBe("/financial-statements?tab=buku-besar&account=a");
    expect(reportLinkHref({ type: "supplier", id: "s" })).toBeNull();
    expect(reportLinkHref(undefined)).toBeNull();
  });

  it("print money as the statements do and a share as a percentage", () => {
    expect(formatReportCell("money", -200000)).toBe("(Rp 200.000)");
    expect(formatReportCell("money", 0)).toBe("—");
    expect(formatReportCell("percent", 0.4567)).toBe("45,7%");
    expect(formatReportCell("text", undefined)).toBe("");
  });

  it("print with the checks, escaped", () => {
    const html = reportPrintHtml({
      key: "k", title: "Umur <Piutang>", period: { asOf: "2026-10-15" }, company: { legalName: "PT" },
      columns: [{ key: "label", label: "Dokumen", kind: "text" }, { key: "total", label: "Jumlah", kind: "money" }],
      rows: [{ kind: "total", level: 0, cells: { label: "Jumlah", total: 5 } }],
      checks: [{ label: "tie", expected: 7, actual: 5, ok: false }],
      notes: [],
    });
    expect(html).toContain("Umur &lt;Piutang&gt;");
    expect(html).toContain("✗ tie");
    expect(html).toContain("<strong>Rp 5</strong>");
  });
});

describe("remembered report period", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };

  it("reopens a report on the period last used for it, and only for it", () => {
    const store = memory();
    rememberPeriod("cash_flow", at("p=tahunan&y=2025"), store);
    const recalled = recallPeriod("cash_flow", new URLSearchParams("cabang=x"), store);
    expect(resolveRange(periodFromParams(recalled, "2026-10-15"))).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(recalled.get("cabang")).toBe("x");
    expect(recallPeriod("ap_aging", new URLSearchParams(), store).has("p")).toBe(false);
  });

  it("lets a link's own period win over the remembered one", () => {
    const store = memory();
    rememberPeriod("cash_flow", at("p=tahunan&y=2025"), store);
    expect(recallPeriod("cash_flow", new URLSearchParams("p=harian&d=2026-10-01"), store).get("p")).toBe("harian");
  });

  it("still works when the browser refuses storage", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(() => rememberPeriod("cash_flow", at(""), broken)).not.toThrow();
    expect(recallPeriod("cash_flow", new URLSearchParams(), broken).toString()).toBe("");
  });

  function at(q: string) {
    return periodFromParams(new URLSearchParams(q), "2026-10-15");
  }
});
