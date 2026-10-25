import { escapeHtml } from "@/lib/export";
import { formatDateId, formatNumber, formatRupiah } from "@/lib/format";
import type { Report, ReportColumnKind } from "../api/contract";

/**
 * One cell as the screen and the printout show it: money with negatives in
 * parentheses as the statements print them, a share as a percentage (the
 * server sends a ratio), dates in Indonesian.
 */
export function formatReportCell(kind: ReportColumnKind, value: string | number | undefined): string {
  if (value === undefined || value === null || value === "") return "";
  switch (kind) {
    case "money": {
      const n = Number(value);
      if (n === 0) return "—";
      return n < 0 ? `(${formatRupiah(Math.abs(n))})` : formatRupiah(n);
    }
    case "number":
      return formatNumber(Number(value));
    case "percent":
      return `${(Number(value) * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;
    case "date":
      return formatDateId(String(value));
    default:
      return String(value);
  }
}

export function reportPeriodLabel(report: Report): string {
  if (report.period.asOf) return `Per ${formatDateId(report.period.asOf)}`;
  if (report.period.from && report.period.to) {
    return `Periode ${formatDateId(report.period.from)} – ${formatDateId(report.period.to)}`;
  }
  return "";
}

/** The report as a standalone document for printDocument -- the PDF. */
export function reportPrintHtml(report: Report, branchLabel?: string): string {
  const head = report.columns
    .map((c) => `<th${c.kind === "text" ? "" : ' class="num"'}>${escapeHtml(c.label)}</th>`)
    .join("");
  const body = report.rows
    .map((row) => {
      const strong = row.kind !== "line";
      const cells = report.columns
        .map((c, i) => {
          const text = escapeHtml(formatReportCell(c.kind, row.cells[c.key]));
          const indent = i === 0 ? ` style="padding-left:${8 + row.level * 14}px"` : "";
          const cls = c.kind === "text" ? "" : ' class="num"';
          return `<td${cls}${indent}>${strong ? `<strong>${text}</strong>` : text}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  const checks = report.checks
    .map((c) => `<div>${c.ok ? "✓" : "✗"} ${escapeHtml(c.label)}${c.ok ? "" : `: buku besar ${escapeHtml(formatRupiah(c.expected))}, laporan ${escapeHtml(formatRupiah(c.actual))}`}</div>`)
    .join("");
  const notes = report.notes.map((n) => `<div>${escapeHtml(n)}</div>`).join("");
  return `
    <div class="eyebrow">${escapeHtml(report.company.legalName)}</div>
    <h1>${escapeHtml(report.title)}</h1>
    <div class="meta"><div>${escapeHtml(reportPeriodLabel(report))}${branchLabel ? ` · ${escapeHtml(branchLabel)}` : ""}</div></div>
    <hr class="rule" />
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    ${checks || notes ? `<div class="meta" style="flex-direction:column;gap:4px;margin-top:14px">${checks}${notes}</div>` : ""}`;
}
