/**
 * Reopen a closed fiscal year: posts the mirror of its own closing journal
 * and unlocks it. Refused if a later fiscal year is still closed. Gap-
 * closing plan, Phase E.
 */
import { reopenFiscalYear, type FiscalYearView } from "@/features/fiscalyears/api/fiscalYearApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface ReopenYearDialogProps {
  year: FiscalYearView | null;
  onClose: () => void;
  onReopened: () => void;
}

export function ReopenYearDialog({ year, onClose, onReopened }: ReopenYearDialogProps) {
  const reopen = useDeskMutation({
    mutationFn: () => reopenFiscalYear(year!.year, year!.version),
    success: () => ({ title: `Tahun buku ${year?.year} dibuka kembali`, description: "Jurnal pembalik telah diposting." }),
    errorTitle: "Membuka kembali gagal",
    onDone: () => { onReopened(); onClose(); },
  });

  return (
    <Dialog open={!!year} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buka kembali tahun buku {year?.year}?</DialogTitle>
          <DialogDescription>
            Membalik jurnal penutup dan membuka tahun ini kembali untuk penjurnalan. Tahun setelahnya harus
            sudah dibuka terlebih dahulu.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={reopen.isPending}>Batal</Button>
          <Button type="button" variant="destructive" disabled={reopen.isPending} onClick={() => reopen.mutate(undefined as never)}>
            Buka kembali
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
