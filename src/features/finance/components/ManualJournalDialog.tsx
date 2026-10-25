/**
 * "Jurnal umum": a hand-entered correction. Booked in the branch the
 * console is scoped to; consolidated leaves it to the tenant's default
 * branch, as CreateManualJournalRequest's own doc describes. Gap-closing
 * plan, Phase E / financial-statements plan P7.4.
 *
 * Accounting parity P3: a memo per line, and "duplicate" -- a recurring
 * correction (an accrual, a monthly allocation) starts from last month's
 * entry instead of being typed again.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createManualJournal, getChartOfAccounts, type JournalView } from "@/features/finance/api/financeApi";
import { useScope } from "@/features/tenancy/useScope";
import { todayIso } from "@/lib/date";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { leafAccounts } from "@/features/finance/lib/accounts";
import { scopeKey } from "@/lib/scope";

interface LineRow {
  key: number;
  accountId: string;
  debit: number;
  kredit: number;
  memo: string;
}

let rowKeySeq = 0;
function emptyLine(): LineRow {
  rowKeySeq += 1;
  return { key: rowKeySeq, accountId: "", debit: 0, kredit: 0, memo: "" };
}

/** A duplicate's lines: the same accounts, amounts and memos, fresh keys. */
function linesFrom(journal?: JournalView | null): LineRow[] {
  if (!journal?.lines.length) return [emptyLine(), emptyLine()];
  return journal.lines.map((l) => ({
    key: (rowKeySeq += 1), accountId: l.akun?.id ?? "", debit: l.debit, kredit: l.kredit, memo: l.memo ?? "",
  }));
}

interface ManualJournalDialogProps {
  open: boolean;
  onClose: () => void;
  onPosted: () => void;
  /** Pre-fills the entry from this journal (duplicate), dated today. The
   *  caller remounts the dialog per template (a `key`), so lazy initial
   *  state is enough. */
  template?: JournalView | null;
}

export function ManualJournalDialog({ open, onClose, onPosted, template }: ManualJournalDialogProps) {
  const { branchId } = useScope();
  const [journalDate, setJournalDate] = useState(todayIso);
  const [description, setDescription] = useState(template?.keterangan ?? "");
  const [rows, setRows] = useState<LineRow[]>(() => linesFrom(template));

  const accounts = useQuery({ queryKey: [...scopeKey(), "manual-journal", "accounts"], queryFn: getChartOfAccounts, enabled: open });
  const postableAccounts = leafAccounts(accounts.data ?? []);

  function reset() {
    setJournalDate(todayIso());
    setDescription(template?.keterangan ?? "");
    setRows(linesFrom(template));
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
        branchId: branchId ?? undefined,
        journalDate,
        description,
        lines: rows
          .filter((r) => r.accountId && (r.debit > 0 || r.kredit > 0))
          .map((r) => ({ accountId: r.accountId, debit: r.debit, kredit: r.kredit, memo: r.memo })),
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
          <DialogTitle>{template ? `Duplikat ${template.nomor}` : "Jurnal umum baru"}</DialogTitle>
          <DialogDescription>
            Koreksi manual. Setelah diposting tidak bisa diubah, hanya bisa dibalik.
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
            {rows.map((row, i) => (
              <div key={row.key} className="space-y-1">
              <div className="grid grid-cols-[1fr_7rem_7rem_2rem] items-center gap-2">
                <SelectInput
                  aria-label="Akun"
                  value={row.accountId}
                  onChange={(e) => setRows(rows.map((r) => (r.key === row.key ? { ...r, accountId: e.target.value } : r)))}
                >
                  <option value="">— Pilih —</option>
                  {postableAccounts.map((a) => (
                    <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} · {a.akun.nama}</option>
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
              <TextInput
                aria-label={`Keterangan baris ${i + 1}`}
                placeholder="Keterangan baris (opsional)"
                maxLength={2000}
                className="py-1 text-xs"
                value={row.memo}
                onChange={(e) => setRows(rows.map((r) => (r.key === row.key ? { ...r, memo: e.target.value } : r)))}
              />
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
