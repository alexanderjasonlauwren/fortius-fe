import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { Field, TextInput } from "@/components/common/Field";
import { getMonthlyGrid } from "@/features/distribution/api/distributionApi";
import { scopeKey } from "@/lib/scope";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function AllocationMatrixPanel() {
  const [month, setMonth] = useState(currentMonth);

  const grid = useQuery({
    queryKey: [...scopeKey(), "distribution-month-grid", month],
    queryFn: () => getMonthlyGrid(month),
    enabled: /^\d{4}-\d{2}$/.test(month),
  });

  return (
    <Panel>
      <PanelHeader
        title="Matriks alokasi pangkalan"
        hint="Format operasional: Id Registrasi / pangkalan × tanggal"
      />
      <PanelBody className="space-y-4">
        <div className="max-w-xs">
          <Field label="Bulan">
            <TextInput type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </Field>
        </div>

        {grid.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : grid.isError ? (
          <p className="text-sm text-danger">Matriks tidak dapat dimuat: {grid.error.message}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="min-w-max border-collapse text-xs">
              <thead className="bg-panel-sunk text-ink-muted">
                <tr>
                  <th className="sticky left-0 z-20 min-w-48 border-b border-r border-line bg-panel-sunk px-3 py-2 text-left">
                    Id Registrasi / Pangkalan
                  </th>
                  <th className="border-b border-r border-line px-3 py-2 text-right">Alokasi</th>
                  {grid.data?.dates.map((day) => (
                    <th key={day} className="min-w-12 border-b border-r border-line px-2 py-2 text-right">
                      {Number(day.slice(-2))}
                    </th>
                  ))}
                  <th className="border-b border-r border-line px-3 py-2 text-right">Total</th>
                  <th className="border-b border-line px-3 py-2 text-right">Sisa</th>
                </tr>
              </thead>
              <tbody>
                {grid.data?.rows.map((row) => (
                  <tr key={row.outletId} className="border-b border-line last:border-0">
                    <th className="sticky left-0 z-10 border-r border-line bg-panel px-3 py-2 text-left font-medium text-ink">
                      <span className="block font-mono text-[10px] text-ink-muted">{row.outletCode}</span>
                      {row.outletName}
                    </th>
                    <td className="border-r border-line px-3 py-2 text-right tabular-nums">{formatNumber(row.targetQty)}</td>
                    {grid.data?.dates.map((day) => (
                      <td key={day} className="border-r border-line px-2 py-2 text-right tabular-nums">
                        {row.cells[day] == null ? "·" : formatNumber(row.cells[day])}
                      </td>
                    ))}
                    <td className="border-r border-line px-3 py-2 text-right font-medium tabular-nums">{formatNumber(row.total)}</td>
                    <td className={cn("px-3 py-2 text-right font-medium tabular-nums", row.remainingQty < 0 && "text-danger")}>
                      {formatNumber(row.remainingQty)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-panel-sunk font-medium">
                <tr>
                  <th className="sticky left-0 border-r border-t border-line bg-panel-sunk px-3 py-2 text-left">Total rencana / target SA</th>
                  <td className="border-r border-t border-line" />
                  {grid.data?.footer.map((day) => (
                    <td key={day.date} className={cn("border-r border-t border-line px-2 py-2 text-right tabular-nums", day.shortfall !== 0 && "text-warning")}>
                      {formatNumber(day.planned)} / {day.hasTarget ? formatNumber(day.required) : "—"}
                    </td>
                  ))}
                  <td className="border-r border-t border-line px-3 py-2 text-right">{formatNumber(grid.data?.totals.planned ?? 0)}</td>
                  <td className="border-t border-line px-3 py-2 text-right">{formatNumber(grid.data?.totals.shortfall ?? 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-xs text-ink-muted">
          Titik berarti belum direncanakan; angka 0 berarti nol memang dicatat. Sisa negatif tetap ditampilkan agar kelebihan alokasi tidak tersembunyi.
        </p>
      </PanelBody>
    </Panel>
  );
}
