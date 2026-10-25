import { escapeHtml } from "@/lib/export";
import { formatRupiah } from "@/lib/format";
import type { Statement } from "../api/financialstatementsApi";

function signed(value: number): string {
  if (value === 0) return "—";
  return value < 0 ? `(${formatRupiah(Math.abs(value))})` : formatRupiah(value);
}

/**
 * A Laba Rugi or Neraca as a standalone document for printDocument, which is
 * how the console makes a PDF. The same rules as StatementTable on screen:
 * indented by level, subtotals bold, negatives in parentheses, a ratio under
 * any line that carries one. Account detail is left out -- the statement is
 * what is signed and filed; the detail is the Penjelasan Akun.
 *
 * Integrity warnings are printed, not dropped: a PDF that hides an unmapped
 * account or an unbalanced Neraca would read as clean when it is not.
 */
export function statementPrintHtml(title: string, statement: Statement, periodLabel: string): string {
  const rows = statement.lines
    .map((line) => {
      const label = `${line.noteNumber != null ? `(${line.noteNumber}) ` : ""}${escapeHtml(line.label)}`;
      const amount = line.kind === "header" ? "" : escapeHtml(signed(line.amount));
      const ratio = line.ratio != null
        ? `<div style="font-size:9px;color:#2E6A55">${Math.round(line.ratio * 100)}%</div>`
        : "";
      const weight = line.isBold ? "font-weight:700;" : "";
      const rule = line.isBold && line.kind !== "header" ? "border-top:1px solid #171a16;" : "";
      return `<tr>
        <td style="${weight}padding-left:${8 + line.level * 14}px">${label}</td>
        <td class="num" style="${weight}${rule}">${amount}${ratio}</td>
      </tr>`;
    })
    .join("");
  const warnings = statement.warnings.length
    ? `<div class="meta" style="flex-direction:column;gap:4px;margin-top:14px">
        <div><strong>${statement.warnings.length} peringatan integritas data</strong></div>
        ${statement.warnings.map((w) => `<div>${escapeHtml(w.message)}</div>`).join("")}
      </div>`
    : "";
  return `
    <div class="eyebrow">${escapeHtml(statement.company.legalName)}</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta"><div>${escapeHtml(periodLabel)} · Format ${escapeHtml(statement.layout.name)}</div></div>
    <hr class="rule" />
    <table><tbody>${rows}</tbody></table>
    ${warnings}`;
}
