/**
 * "Balik jurnal": posts the mirror of a manual or opening-balance journal.
 * No reason field -- ReverseJournalRequest carries only a version guard.
 * Gap-closing plan, Phase E.
 */
import { reverseJournal, type JournalView } from "@/features/finance/api/financeApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface ReverseJournalDialogProps {
  journal: JournalView | null;
  onClose: () => void;
  onReversed: () => void;
}

export function ReverseJournalDialog({ journal, onClose, onReversed }: ReverseJournalDialogProps) {
  const reverse = useDeskMutation({
    mutationFn: () => reverseJournal(journal!.id, journal!.version),
    success: (row) => ({ title: `${row.nomor} dibalik`, description: "Jurnal pembalik telah diposting." }),
    errorTitle: "Pembalikan gagal",
    onDone: () => { onReversed(); onClose(); },
  });

  return (
    <Dialog open={!!journal} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Balik {journal?.nomor}?</DialogTitle>
          <DialogDescription>
            Memposting jurnal pembalik dari yang sudah diposting. Tidak dapat diurungkan.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={reverse.isPending}>Batal</Button>
          <Button
            type="button" variant="destructive"
            disabled={reverse.isPending}
            onClick={() => reverse.mutate(undefined as never)}
          >
            Balik jurnal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
