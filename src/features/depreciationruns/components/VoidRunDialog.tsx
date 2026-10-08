/**
 * Reverses the latest posted depreciation run. Refused for any run that is
 * not the latest posted one -- an earlier run's own "already accumulated"
 * baseline would otherwise refer to a reversed charge a later run still
 * stands on top of. No reason field: VoidDepreciationRunRequest carries
 * only a version guard, unlike cash vouchers' own void. Gap-closing plan,
 * Phase D.
 */
import { voidRun, type DepreciationRunView } from "@/features/depreciationruns/api/depreciationRunApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface VoidRunDialogProps {
  run: DepreciationRunView | null;
  onClose: () => void;
  onVoided: () => void;
}

export function VoidRunDialog({ run, onClose, onVoided }: VoidRunDialogProps) {
  const voidMutation = useDeskMutation({
    mutationFn: () => voidRun(run!.id, run!.version),
    success: (row) => ({ title: `Run ${row.period} dibatalkan`, description: "Jurnal pembalik telah diposting." }),
    errorTitle: "Pembatalan gagal",
    onDone: () => { onVoided(); onClose(); },
  });

  return (
    <Dialog open={!!run} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan run {run?.period}?</DialogTitle>
          <DialogDescription>
            Memposting jurnal pembalik dan mengembalikan status aset yang habis disusutkan oleh run ini. Tidak dapat diurungkan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={voidMutation.isPending}>Batal</Button>
          <Button
            type="button" variant="destructive"
            disabled={voidMutation.isPending}
            onClick={() => voidMutation.mutate(undefined as never)}
          >
            Batalkan run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
