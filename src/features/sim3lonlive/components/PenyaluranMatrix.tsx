import { cn } from "@/lib/utils";
import type { MatrixDayCell, MatrixSection } from "../api/contract";

/**
 * The pangkalan x day distribution grid, reflecting SIM3LON's own layout:
 * one row per pangkalan, a cell per day of the month, then the period totals.
 *
 * A delivered day shows its quantity; a fakultatif day is tinted; an empty
 * normal day is left blank so the delivered days stand out at a glance.
 */
function cellClass(cell: MatrixDayCell): string {
  if (cell.fakultatif) return "bg-panel-sunk text-ink-muted/60";
  if (cell.qty > 0) return "bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-300";
  return "text-ink-muted/40";
}

export function PenyaluranMatrix({ section }: { section: MatrixSection }) {
  if (section.rows.length === 0) {
    return <p className="p-5 text-sm text-ink-muted">Belum ada data untuk periode ini.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line text-ink-muted">
            <th className="sticky left-0 z-10 bg-panel px-3 py-2 text-left font-semibold">
              Pangkalan
            </th>
            <th className="px-2 py-2 text-right font-semibold">Alokasi</th>
            {section.days.map((d) => (
              <th
                key={d.day}
                className={cn(
                  "data px-1.5 py-2 text-center font-medium",
                  d.fakultatif && "text-amber-600 dark:text-amber-400",
                )}
                title={d.fakultatif ? "Hari fakultatif" : undefined}
              >
                {String(d.day).padStart(2, "0")}
              </th>
            ))}
            <th className="px-2 py-2 text-right font-semibold">Total</th>
            <th className="px-2 py-2 text-right font-semibold">Sisa</th>
          </tr>
        </thead>
        <tbody>
          {section.rows.map((row) => (
            <tr key={row.idRegistrasi} className="border-b border-line/60 hover:bg-panel-sunk/50">
              <td className="sticky left-0 z-10 bg-panel px-3 py-1.5">
                <div className="max-w-[16rem] truncate font-medium text-ink" title={row.namaPangkalan}>
                  {row.namaPangkalan}
                </div>
                <div className="data text-2xs text-ink-muted">{row.idRegistrasi}</div>
              </td>
              <td className="data px-2 py-1.5 text-right text-ink-muted">
                {row.alokasi.toLocaleString("id-ID")}
              </td>
              {row.days.map((cell) => (
                <td
                  key={cell.day}
                  className={cn("data px-1.5 py-1.5 text-center", cellClass(cell))}
                >
                  {cell.qty > 0 ? cell.qty : cell.fakultatif ? "·" : ""}
                </td>
              ))}
              <td className="data px-2 py-1.5 text-right font-semibold text-ink">
                {row.grandTotal.toLocaleString("id-ID")}
              </td>
              <td className="data px-2 py-1.5 text-right text-ink-muted">
                {row.sisaAlokasi.toLocaleString("id-ID")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
