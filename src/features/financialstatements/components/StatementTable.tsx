/**
 * Renders one Statement (Laba Rugi or Neraca) as the PDF prints it:
 * indented by level, subtotals bold, negatives in parentheses, a ratio in
 * green under any line that carries one. Financial-statements plan, phase
 * P2.
 */
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";
import type { StatementLine } from "../api/financialstatementsApi";

function formatSigned(value: number): string {
  if (value === 0) return "—";
  if (value < 0) return `(${formatRupiah(Math.abs(value))})`;
  return formatRupiah(value);
}

function formatRatio(ratio: number): string {
  const pct = Math.round(ratio * 100);
  return `${pct}%`;
}

export function StatementTable({
  lines,
  onAccountClick,
}: {
  lines: StatementLine[];
  onAccountClick?: (accountId: string, code: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (code: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <table className="w-full text-left">
      <tbody>
        {lines.map((line) => {
          const expandable = line.kind === "accounts" && line.accounts.length > 0;
          const isOpen = expanded.has(line.code);
          return (
            <Fragment key={line.code}>
              <tr className={cn("border-b border-line", line.kind === "header" && "bg-panel-sunk")}>
                <td
                  className={cn("py-1.5 pr-3 text-sm text-ink", line.isBold && "font-semibold")}
                  style={{ paddingLeft: `${0.75 + line.level * 1.25}rem` }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {expandable && (
                      <button
                        type="button"
                        onClick={() => toggle(line.code)}
                        className="text-ink-muted hover:text-ink"
                        aria-label={isOpen ? "Sembunyikan rincian" : "Tampilkan rincian"}
                      >
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {line.noteNumber != null && (
                      <span className="text-2xs text-ink-muted">({line.noteNumber})</span>
                    )}
                    {line.label}
                  </span>
                </td>
                <td className={cn("data w-40 py-1.5 pl-3 text-right text-sm text-ink", line.isBold && "border-t border-line font-semibold")}>
                  {line.kind === "header" ? "" : formatSigned(line.amount)}
                  {line.ratio != null && (
                    <span className="block text-2xs font-normal text-pine-ink">{formatRatio(line.ratio)}</span>
                  )}
                </td>
              </tr>
              {expandable && isOpen &&
                line.accounts.map((a) => (
                  <tr key={`${line.code}-${a.accountId}`} className="border-b border-line bg-panel-sunk/50">
                    <td
                      className="py-1 pr-3 text-xs text-ink-muted"
                      style={{ paddingLeft: `${0.75 + (line.level + 1) * 1.25}rem` }}
                    >
                      {onAccountClick ? (
                        <button
                          type="button"
                          className="hover:text-ink hover:underline"
                          onClick={() => onAccountClick(a.accountId, a.code)}
                        >
                          <span className="data">{a.code}</span> {a.name}
                        </button>
                      ) : (
                        <>
                          <span className="data">{a.code}</span> {a.name}
                        </>
                      )}
                    </td>
                    <td className="data w-40 py-1 pl-3 text-right text-xs text-ink-muted">{formatSigned(a.amount)}</td>
                  </tr>
                ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
