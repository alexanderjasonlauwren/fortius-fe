/**
 * "Jalankan penyusutan": pick a period, see what posting it would charge,
 * then post. The real backend has no dry-run endpoint for this -- CreateRun
 * computes the lines and posts the one balanced journal in the same call
 * (see depreciationrun's own services.go header) -- so the preview below is
 * computed here, from the asset list already on hand, with the same
 * straight-line math `lib/depreciation.ts` ports from the backend's own
 * internal/service/depreciation. Gap-closing plan, Phase D.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { listAssets } from "@/features/assets/api/assetApi";
import { createRun } from "@/features/depreciationruns/api/depreciationRunApi";
import { chargeFor, periodIndex } from "@/features/depreciationruns/lib/depreciation";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

interface RunDepreciationDialogProps {
  open: boolean;
  /** The latest posted run's own period, if any -- a new run must be
   *  strictly after it, the same rule CreateRun itself enforces. */
  latestPostedPeriod?: string;
  onClose: () => void;
  onPosted: () => void;
}

function defaultPeriod(after?: string): string {
  if (after) {
    const [y, m] = after.split("-").map(Number);
    const next = new Date(Date.UTC(y, m, 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function RunDepreciationDialog({ open, latestPostedPeriod, onClose, onPosted }: RunDepreciationDialogProps) {
  const [period, setPeriod] = useState(() => defaultPeriod(latestPostedPeriod));

  const assets = useQuery({ queryKey: [...scopeKey(), "depreciation-runs", "assets"], queryFn: () => listAssets(), enabled: open });

  const preview = useMemo(() => {
    const rows = (assets.data ?? [])
      .filter((a) => a.status === "active")
      .map((a) => {
        const index = periodIndex(a.depreciationStartDate, period);
        const amount = chargeFor(a.cost, a.residualValue, a.usefulLifeMonths, index);
        return { asset: a, amount, isLast: index === a.usefulLifeMonths };
      })
      .filter((r) => r.amount > 0);
    return { rows, total: rows.reduce((s, r) => s + r.amount, 0) };
  }, [assets.data, period]);

  const outOfSequence = !!latestPostedPeriod && period <= latestPostedPeriod;

  const post = useDeskMutation({
    mutationFn: () => createRun(period),
    success: (row) => ({ title: `Run ${row.period} diposting`, description: `${row.lines.length} aset, total ${formatRupiah(row.totalAmount)}.` }),
    errorTitle: "Posting gagal",
    onDone: () => { onPosted(); onClose(); },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Jalankan penyusutan</DialogTitle>
          <DialogDescription>
            Memposting satu jurnal untuk seluruh aset aktif pada periode ini. Tidak dapat diposting dua kali untuk periode yang sama.
          </DialogDescription>
        </DialogHeader>

        <Field label="Periode" htmlFor="run-period" required>
          <TextInput id="run-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </Field>
        {outOfSequence && (
          <p className="text-xs text-rust-ink">
            Penyusutan terakhir sudah untuk periode {latestPostedPeriod}. Pilih periode setelahnya.
          </p>
        )}

        <div className="max-h-72 overflow-y-auto rounded-md border border-line">
          {assets.isLoading ? (
            <p className="p-4 text-center text-sm text-ink-muted">Memuat aset…</p>
          ) : preview.rows.length === 0 ? (
            <p className="p-4 text-center text-sm text-ink-muted">Tidak ada aset yang perlu disusutkan pada periode ini.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-ink-muted">
                  <th className="px-3 pb-1 pt-2 font-medium">Aset</th>
                  <th className="px-3 pb-1 pt-2 text-right font-medium">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map(({ asset, amount, isLast }) => (
                  <tr key={asset.id} className="border-t border-line">
                    <td className="px-3 py-1.5 text-ink">
                      {asset.assetCode} · {asset.name}
                      {isLast && <span className="ml-1.5 text-2xs text-ink-muted">(periode terakhir)</span>}
                    </td>
                    <td className="data px-3 py-1.5 text-right text-ink">{formatRupiah(amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-right text-xs text-ink-muted">
          Total: <span className="data font-semibold text-ink">{formatRupiah(preview.total)}</span>
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={post.isPending}>Batal</Button>
          <Button
            type="button"
            disabled={post.isPending || outOfSequence || preview.rows.length === 0}
            onClick={() => post.mutate(undefined as never)}
          >
            {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Posting penyusutan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
