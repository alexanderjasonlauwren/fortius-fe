/**
 * One report of the pack as a table: section headings shaded, subtotals and
 * totals bold, the first column indented by level, and a row that points at
 * a document or an account opening it.
 */
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Report } from "../api/contract";
import { reportLinkHref } from "../lib/links";
import { formatReportCell } from "../lib/render";

export function ReportTable({ report }: { report: Report }) {
  const lines = report.rows.filter((r) => r.kind === "line");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            {report.columns.map((c) => (
              <th
                key={c.key}
                className={cn("whitespace-nowrap px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-ink-muted", c.kind !== "text" && "text-right")}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, i) => {
            const href = reportLinkHref(row.link);
            return (
              <tr
                key={i}
                className={cn(
                  "border-b border-line",
                  row.kind === "section" && "bg-panel-sunk",
                  row.kind === "subtotal" && "font-semibold",
                  row.kind === "total" && "border-t-2 border-t-ink font-bold",
                )}
              >
                {report.columns.map((c, ci) => {
                  const text = formatReportCell(c.kind, row.cells[c.key]);
                  return (
                    <td
                      key={c.key}
                      className={cn("px-3 py-1.5 text-ink", c.kind !== "text" && "data whitespace-nowrap text-right")}
                      style={ci === 0 ? { paddingLeft: `${0.75 + row.level * 1.25}rem` } : undefined}
                    >
                      {ci === 0 && href ? (
                        <Link to={href} className="hover:underline">{text}</Link>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {lines.length === 0 && (
        <p className="p-4 text-sm text-ink-muted">Tidak ada data untuk periode ini.</p>
      )}
    </div>
  );
}
