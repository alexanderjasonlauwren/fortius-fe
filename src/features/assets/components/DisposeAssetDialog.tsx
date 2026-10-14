/**
 * Sell or write off an asset (accounting parity P3). The backend posts the
 * disposal journal -- cost and accumulated depreciation out, proceeds in,
 * the difference a gain or a loss -- so this asks only what a bookkeeper
 * knows: when, for how much, and where the money went.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { disposeAsset, type AssetView } from "@/features/assets/api/assetApi";
import { disposalPreview } from "@/features/assets/lib/disposal";
import { getChartOfAccounts } from "@/features/finance/api/financeApi";
import { leafAccounts } from "@/features/finance/lib/accounts";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";
import { todayIso } from "@/lib/date";

interface Props {
  asset: AssetView | null;
  onClose: () => void;
  onDisposed: () => void;
}

export function DisposeAssetDialog({ asset, onClose, onDisposed }: Props) {
  const [disposedAt, setDisposedAt] = useState(todayIso());
  const [proceeds, setProceeds] = useState(0);
  const [proceedsAccountId, setProceedsAccountId] = useState("");
  const [gainLossAccountId, setGainLossAccountId] = useState("");
  const [note, setNote] = useState("");
  const accounts = useQuery({ queryKey: [...scopeKey(), "assets", "accounts"], queryFn: getChartOfAccounts, enabled: !!asset });

  const save = useDeskMutation({
    mutationFn: (a: AssetView) => disposeAsset({
      id: a.id, version: a.version, disposedAt, proceeds, proceedsAccountId, gainLossAccountId, note,
    }),
    success: (row) => ({
      title: `${row.assetCode} dilepas`,
      description: row.disposalJournal ? `Jurnal ${row.disposalJournal} diposting.` : "Tidak ada nilai buku yang perlu dijurnal.",
    }),
    errorTitle: "Aset tidak dapat dilepas",
    onDone: () => { onDisposed(); onClose(); },
  });

  if (!asset) return null;
  const leaves = leafAccounts(accounts.data ?? []);
  // Proceeds land in kas/bank or a receivable; gain or loss in income or expense.
  const proceedsAccounts = leaves.filter((a) => a.akun.tipe === "Aset" && a.akun.id !== asset.assetAccountId);
  const gainLossAccounts = leaves.filter((a) => a.akun.tipe === "Pendapatan" || a.akun.tipe === "Beban");
  const preview = disposalPreview(asset.cost, asset.accumulatedToDate, proceeds);
  const canSubmit = !!disposedAt && disposedAt >= asset.acquisitionDate && proceeds >= 0 && (proceeds === 0 || !!proceedsAccountId);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) save.mutate(asset); }}>
          <DialogHeader>
            <DialogTitle>Lepas {asset.assetCode}</DialogTitle>
            <DialogDescription>
              Dijual atau dihapusbukukan. Harga perolehan dan akumulasi penyusutannya keluar dari buku; tidak dapat diurungkan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Tanggal pelepasan" htmlFor="dsp-date" required>
                <TextInput id="dsp-date" type="date" min={asset.acquisitionDate} value={disposedAt} onChange={(e) => setDisposedAt(e.target.value)} />
              </Field>
              <Field label="Hasil penjualan" htmlFor="dsp-proceeds" hint="0 bila dihapusbukukan.">
                <TextInput id="dsp-proceeds" type="number" min={0} mono value={proceeds || ""} onChange={(e) => setProceeds(Number(e.target.value))} />
              </Field>
            </div>
            {proceeds > 0 && (
              <Field label="Diterima di" htmlFor="dsp-proceeds-acct" required hint="Kas/bank, atau piutang bila belum dibayar.">
                <SelectInput id="dsp-proceeds-acct" value={proceedsAccountId} onChange={(e) => setProceedsAccountId(e.target.value)}>
                  <option value="">— Pilih —</option>
                  {proceedsAccounts.map((a) => <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} — {a.akun.nama}</option>)}
                </SelectInput>
              </Field>
            )}
            <dl className="space-y-1 rounded-md border border-line p-3 text-sm">
              <Row label="Harga perolehan" value={asset.cost} />
              <Row label="Akumulasi penyusutan (diposting s.d. kini)" value={-asset.accumulatedToDate} />
              <Row label="Nilai buku" value={preview.bookValue} strong />
              <Row label="Hasil penjualan" value={proceeds} />
              {preview.gain > 0 && <Row label="Laba pelepasan" value={preview.gain} strong />}
              {preview.loss > 0 && <Row label="Rugi pelepasan" value={-preview.loss} strong />}
            </dl>
            <Field label="Akun laba/rugi" htmlFor="dsp-gl" hint="Default: Pendapatan Lain-lain (rugi dicatat di debitnya).">
              <SelectInput id="dsp-gl" value={gainLossAccountId} onChange={(e) => setGainLossAccountId(e.target.value)}>
                <option value="">— Default —</option>
                {gainLossAccounts.map((a) => <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} — {a.akun.nama}</option>)}
              </SelectInput>
            </Field>
            <Field label="Catatan" htmlFor="dsp-note">
              <TextInput id="dsp-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Contoh: dijual ke CV Maju, kuitansi 0142." />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" variant="destructive" disabled={!canSubmit || save.isPending}>Lepas aset</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 font-semibold" : "flex justify-between gap-4"}>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="data text-ink">{formatRupiah(value)}</dd>
    </div>
  );
}
