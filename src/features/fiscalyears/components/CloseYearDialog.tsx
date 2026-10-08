/**
 * Close a fiscal year: pick the year, see its own Laba Bersih before
 * committing to the closing journal. The real backend refuses the close
 * outright if the year-end statements are not clean (unmapped accounts,
 * an unbalanced Neraca) or an earlier year with activity is still open --
 * this dialog surfaces whatever that refusal says rather than trying to
 * predict it, since the mock's own simpler ledger cannot produce an
 * unbalanced Neraca by construction. Gap-closing plan, Phase E.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { closeFiscalYear } from "@/features/fiscalyears/api/fiscalYearApi";
import { getProfitAndLoss } from "@/features/finance/api/financeApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/mocks/scope";

interface CloseYearDialogProps {
  open: boolean;
  onClose: () => void;
  onClosed: () => void;
}

export function CloseYearDialog({ open, onClose, onClosed }: CloseYearDialogProps) {
  const [year, setYear] = useState(() => new Date().getFullYear());

  const pl = useQuery({
    queryKey: [...scopeKey(), "close-year-preview", year],
    queryFn: () => getProfitAndLoss({ from: `${year}-01-01`, to: `${year}-12-31` }),
    enabled: open && year >= 2000 && year <= 2999,
  });

  const close = useDeskMutation({
    mutationFn: () => closeFiscalYear(year),
    success: () => ({ title: `Tahun buku ${year} ditutup`, description: "Jurnal penutup telah diposting." }),
    errorTitle: "Penutupan gagal",
    onDone: () => { onClosed(); onClose(); },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tutup tahun buku</DialogTitle>
          <DialogDescription>
            Memposting laba/rugi bersih tahun ini ke Laba Ditahan dan mengunci tahun ini dari penjurnalan
            lebih lanjut. Tahun sebelumnya yang memiliki aktivitas harus sudah ditutup lebih dahulu.
          </DialogDescription>
        </DialogHeader>

        <Field label="Tahun" htmlFor="cy-year" required>
          <TextInput id="cy-year" type="number" mono min={2000} max={2999} value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </Field>

        {pl.isLoading ? (
          <p className="text-sm text-ink-muted">Menghitung laba rugi…</p>
        ) : pl.data ? (
          <div className="rounded-md border border-line p-4">
            <p className="text-xs text-ink-muted">Laba bersih {year}</p>
            <p className={`data mt-1 text-lg font-semibold ${pl.data.labaBersih >= 0 ? "text-pine-ink" : "text-rust-ink"}`}>
              {formatRupiah(pl.data.labaBersih)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Akan diposting ke Laba Ditahan {pl.data.labaBersih >= 0 ? "sebagai kredit" : "sebagai debit"}.
            </p>
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={close.isPending}>Batal</Button>
          <Button type="button" disabled={close.isPending || !pl.data} onClick={() => close.mutate(undefined as never)}>
            {close.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Tutup tahun {year}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
