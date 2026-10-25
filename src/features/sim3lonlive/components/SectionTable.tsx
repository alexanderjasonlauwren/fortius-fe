import { AlertTriangle } from "lucide-react";
import type { GridSection, TableSection } from "../api/contract";

/** Turn SIM3LON's camelCase field keys into readable headers. */
function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") return value.toLocaleString("id-ID");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function Empty() {
  return <p className="p-5 text-sm text-ink-muted">Belum ada data untuk periode ini.</p>;
}

/** A DataTables section: array of objects keyed by SIM3LON's own field names. */
export function DataTableSection({ section }: { section: TableSection }) {
  if (section.rows.length === 0) return <Empty />;
  const columns = section.columns.length
    ? section.columns
    : Object.keys(section.rows[0]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-ink-muted">
            {columns.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-semibold">
                {humanize(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, i) => (
            <tr key={i} className="border-b border-line/60 hover:bg-panel-sunk/50">
              {columns.map((c) => (
                <td key={c} className="px-3 py-1.5 text-ink">
                  {formatCell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** An in/out grid: Field x day, rendered from raw rows. */
export function GridTableSection({ section }: { section: GridSection }) {
  if (section.rows.length === 0) return <Empty />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line text-ink-muted">
            {section.columns.map((c, i) => (
              <th
                key={i}
                className={i === 0 ? "px-3 py-2 text-left font-semibold" : "data px-1.5 py-2 text-center font-medium"}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row, ri) => (
            <tr key={ri} className="border-b border-line/60">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={ci === 0 ? "px-3 py-1.5 font-medium text-ink" : "data px-1.5 py-1.5 text-center text-ink"}
                >
                  {typeof cell === "number" ? cell.toLocaleString("id-ID") : cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A section the bridge could not fetch. */
export function SectionError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-5 text-sm text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div>
        <p className="font-medium">Bagian ini gagal dimuat dari SIM3LON.</p>
        <p className="mt-0.5 text-xs text-ink-muted">{message}</p>
      </div>
    </div>
  );
}
