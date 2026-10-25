import { describe, expect, it } from "vitest";
import type { Statement, StatementLine } from "../api/financialstatementsApi";
import { statementPrintHtml } from "./print";

function line(overrides: Partial<StatementLine>): StatementLine {
  return {
    code: "x", label: "x", kind: "line", parentCode: null, level: 0, isBold: false,
    noteNumber: null, amount: 0, ratio: null, accounts: [], ...overrides,
  } as StatementLine;
}

function statement(overrides: Partial<Statement> = {}): Statement {
  return {
    layout: { code: "laba_rugi_v2", name: "Laba Rugi" },
    period: { from: "2026-01-01", to: "2026-12-31" },
    company: { legalName: "PT <Bhakta> & Co" },
    lines: [
      line({ code: "rev", label: "Pendapatan", kind: "header", isBold: true }),
      line({ code: "sales", label: "Penjualan", level: 1, amount: 1_500_000 }),
      line({ code: "loss", label: "Rugi selisih", level: 1, amount: -250_000, noteNumber: 4 }),
      line({ code: "net", label: "Laba Bersih", isBold: true, amount: 1_250_000, ratio: 0.833 }),
    ],
    balanced: true,
    warnings: [],
    ...overrides,
  } as Statement;
}

describe("statementPrintHtml", () => {
  it("prints the statement as the screen shows it", () => {
    const html = statementPrintHtml("Laporan Laba Rugi", statement(), "Periode 1 Jan 2026 – 31 Des 2026");

    // Escaped: a legal name is data, never markup.
    expect(html).toContain("PT &lt;Bhakta&gt; &amp; Co");
    expect(html).toContain("Laporan Laba Rugi");
    expect(html).toContain("Format Laba Rugi");
    // Indented by level, negatives in parentheses, the note number shown.
    expect(html).toMatch(/padding-left:22px">Penjualan/);
    expect(html).toMatch(/\(4\) Rugi selisih[\s\S]*\(Rp\s?250\.000\)/);
    expect(html).toContain("83%");
  });

  it("prints integrity warnings rather than a clean-looking statement", () => {
    const html = statementPrintHtml("Neraca", statement({
      warnings: [{ code: "NOT_BALANCED", message: "Aset tidak sama dengan kewajiban + ekuitas" }],
    }), "Per 31 Des 2026");

    expect(html).toContain("1 peringatan integritas data");
    expect(html).toContain("Aset tidak sama dengan kewajiban + ekuitas");
  });
});
