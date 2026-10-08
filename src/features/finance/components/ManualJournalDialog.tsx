/**
 * "Jurnal umum": a hand-entered correction. No branch picker -- the same
 * gap every other finance screen in this console already has (no branch-
 * listing endpoint exists anywhere to build one from); left blank, a
 * manual journal resolves to the tenant's own default branch, exactly as
 * CreateManualJournalRequest's own doc describes. Gap-closing plan, Phase
 * E / financial-statements plan P7.4.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createManualJournal, getChartOfAccounts } from "@/features/finance/api/financeApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { leafAccounts } from "@/mocks/ledger";
import { scopeKey } from "@/mocks/scope";

interface LineRow {
  key: number;
  accountId: string;
  debit: number;
  kredit: number;
}

let rowKeySeq = 0;
function emptyLine(): LineRow {
  rowKeySeq += 1;
  return { key: rowKeySeq, accountId: "", debit: 0, kredit: 0 };
}

interface ManualJournalDialogProps {
  open: boolean;
  onClose: () => void;
  onPosted: () => void;
}

export function ManualJournalDialog({ open, onClose, onPosted }: ManualJournalDialogProps) {
  const [journalDate, setJournalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<LineRow[]>(() => [emptyLine(), emptyLine()]);

  const accounts = useQuery({ queryKey: [...scopeKey(), "manual-journal", "accounts"], queryFn: getChartOfAccounts, enabled: open });
  const postableAccounts = leafAccounts(accounts.data ?? []);

  function reset() {
    setJournalDate(new Date().toISOString().slice(0, 10));
    setDescription("");
    setRows([emptyLine(), emptyLine()]);
  }

  function setSide(key: number, side: "debit" | "kredit", value: number) {
    setRows(rows.map((r) => (r.key === key ? { ...r, debit: side === "debit" ? value : 0, kredit: side === "kredit" ? value : 0 } : r)));
  }

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalKredit = rows.reduce((s, r) => s + r.kredit, 0);
  const difference = Math.round((totalDebit - totalKredit) * 100) / 100;

  const post = useDeskMutation({
    mutationFn: () =>
      createManualJournal({
        journalDate,
        description,
        lines: rows
          .filter((r) => r.accountId && (r.debit > 0 || r.kredit > 0))
          .map((r) => ({ accountId: r.accountId, debit: r.debit, kredit: r.kredit })),
      }),
    success: (row) => ({ title: `${row.nomor} diposting` }),
    errorTitle: "Jurnal tidak tersimpan",
    onDone: () => { reset(); onPosted(); onClose(); },
  });

  const filledRows = rows.filter((r) => r.accountId && (r.debit > 0 || r.kredit > 0));
  const canSubmit = !!journalDate && description.trim().length >= 2 && filledRows.length >= 2 && difference === 0 && totalDebit > 0;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && (reset(), onClose())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Jurnal umum baru</DialogTitle>
          <DialogDescription>
            Koreksi manual -- tidak dapat diubah setelah diposting, hanya dibalik.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tanggal" htmlFor="mj-date" required>
              <TextInput id="mj-date" type="date" value={journalDate} onChange={(e) => setJournalDate(e.target.value)} />
            </Field>
            <Field label="Keterangan" htmlFor="mj-desc" required>
              <TextInput id="mj-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_7rem_7rem_2rem] gap-2 px-1 text-2xs font-semibold text-ink-muted">
              <span>Akun</span>
              <span className="text-right">Debit</span>
              <span className="text-right">Kredit</span>
              <span />
            </div>
            {rows.map((row) => (
              <div key={row.key} className="grid grid-cols-[1fr_7rem_7rem_2rem] items-center gap-2">
                <SelectInput
                  aria-label="Akun"
                  value={row.accountId}
                  onChange={(e) => setRows(rows.map((r) => (r.key === row.key ? { ...r, accountId: e.target.value } : r)))}
                >
                  <option value="">— Pilih —</option>
                  {postableAccounts.map((a) => (
                    <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} — {a.akun.nama}</option>
                  ))}
                </SelectInput>
                <TextInput
                  aria-label="Debit" type="number" min={0} mono
                  value={row.debit || ""}
                  onChange={(e) => setSide(row.key, "debit", Number(e.target.value))}
                />
                <TextInput
                  aria-label="Kredit" type="number" min={0} mono
                  value={row.kredit || ""}
                  onChange={(e) => setSide(row.key, "kredit", Number(e.target.value))}
                />
                <Button
                  type="button" variant="ghost" size="icon-xs" aria-label="Hapus baris"
                  disabled={rows.length <= 2}
                  onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, emptyLine()])}>
              <Plus className="h-3.5 w-3.5" />
              Tambah baris
            </Button>

            <div className="flex items-center justify-between border-t border-line pt-2 text-xs">
              <span className="text-ink-muted">
                D <span className="data text-ink">{formatRupiah(totalDebit)}</span> · K{" "}
                <span className="data text-ink">{formatRupiah(totalKredit)}</span>
              </span>
              <span className={`data font-semibold ${difference === 0 ? "text-pine-ink" : "text-rust-ink"}`}>
                Selisih {formatRupiah(Math.abs(difference))}
              </span>
            </div>
          </div>

        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={post.isPending}>Batal</Button>
          <Button type="button" disabled={!canSubmit || post.isPending} onClick={() => post.mutate(undefined as never)}>
            {post.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Posting jurnal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
