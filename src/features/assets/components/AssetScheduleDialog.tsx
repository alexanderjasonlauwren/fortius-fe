/**
 * The month-by-month projection for one asset -- what it WOULD charge from
 * depreciation_start_date, independent of any run that has actually
 * posted. Gap-closing plan, Phase D.
 */
import { useQuery } from "@tanstack/react-query";
import { getAssetSchedule, type AssetView } from "@/features/assets/api/assetApi";
import { Skeleton } from "@/components/common/Panel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/mocks/scope";

/** "2026-10" -> "Okt 2026", via UTC so a date-only string never drifts a
 *  day across a timezone the way `new Date("2026-10-01")` + `.getDate()`
 *  can. */
function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("id-ID", { month: "short", year: "numeric", timeZone: "UTC" });
}

interface AssetScheduleDialogProps {
  asset: AssetView | null;
  onClose: () => void;
}

export function AssetScheduleDialog({ asset, onClose }: AssetScheduleDialogProps) {
  const schedule = useQuery({
    queryKey: [...scopeKey(), "assets", "schedule", asset?.id],
    queryFn: () => getAssetSchedule(asset!.id),
    enabled: !!asset,
  });

  return (
    <Dialog open={!!asset} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Jadwal penyusutan {asset?.assetCode}</DialogTitle>
          <DialogDescription>{asset?.name}</DialogDescription>
        </DialogHeader>

        {schedule.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-ink-muted">
                  <th className="pb-1 font-medium">Periode</th>
                  <th className="pb-1 text-right font-medium">Nilai</th>
                  <th className="pb-1 text-right font-medium">Akumulasi</th>
                </tr>
              </thead>
              <tbody>
                {(schedule.data ?? []).map((line) => (
                  <tr key={line.period} className="border-t border-line">
                    <td className="data py-1.5 text-ink">{periodLabel(line.period)}</td>
                    <td className="data py-1.5 text-right text-ink">{formatRupiah(line.amount)}</td>
                    <td className="data py-1.5 text-right text-ink-muted">{formatRupiah(line.accumulatedAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
