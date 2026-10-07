/**
 * Rekening koran import: bank account, period, opening/closing balance,
 * the file, and an optional column-mapping override for a file that
 * doesn't follow the BNI default preset. Financial-statements plan's
 * gap-closing phase, Phase B.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Upload } from "lucide-react";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import { importStatement } from "@/features/bankstatements/api/bankStatementApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, FileDrop, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { scopeKey } from "@/mocks/scope";

interface ImportBankStatementDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function ImportBankStatementDialog({ open, onClose, onImported }: ImportBankStatementDialogProps) {
  const [bankAccountId, setBankAccountId] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [dateCol, setDateCol] = useState("");
  const [descCol, setDescCol] = useState("");
  const [debitCol, setDebitCol] = useState("");
  const [creditCol, setCreditCol] = useState("");
  const [headerRow, setHeaderRow] = useState("");

  const bankAccounts = useQuery({ queryKey: [...scopeKey(), "cash-bank", "bank-accounts"], queryFn: getBankAccounts, enabled: open });

  function reset() {
    setBankAccountId(""); setPeriodFrom(""); setPeriodTo("");
    setOpeningBalance(0); setClosingBalance(0); setFile(null);
    setMappingOpen(false); setDateCol(""); setDescCol(""); setDebitCol(""); setCreditCol(""); setHeaderRow("");
  }

  const toOptionalInt = (v: string) => (v.trim() === "" ? undefined : Number(v));

  const importMutation = useDeskMutation({
    mutationFn: () =>
      importStatement({
        file: file!,
        bankAccountId,
        periodFrom,
        periodTo,
        openingBalance,
        closingBalance,
        columnMapping: mappingOpen
          ? {
              headerRow: toOptionalInt(headerRow),
              dateCol: toOptionalInt(dateCol),
              descCol: toOptionalInt(descCol),
              debitCol: toOptionalInt(debitCol),
              creditCol: toOptionalInt(creditCol),
            }
          : undefined,
      }),
    success: (row) => ({ title: `${row.fileName} diimpor`, description: `${row.rowCount} baris mutasi.` }),
    errorTitle: "Impor gagal",
    onDone: () => { reset(); onImported(); onClose(); },
  });

  const canSubmit = !!bankAccountId && !!periodFrom && !!periodTo && !!file;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && (reset(), onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Impor rekening koran</DialogTitle>
          <DialogDescription>
            Kolom dibaca mengikuti preset BNI secara default -- buka "Pemetaan kolom" di bawah bila
            berkas memakai susunan kolom lain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Akun kas/bank" htmlFor="bsi-bank" required>
            <SelectInput id="bsi-bank" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              <option value="">— Pilih —</option>
              {(bankAccounts.data ?? []).filter((a) => a.kind === "bank").map((a) => (
                <option key={a.id} value={a.id}>{a.bank} {a.nomorRekening}</option>
              ))}
            </SelectInput>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Periode dari" htmlFor="bsi-from" required>
              <TextInput id="bsi-from" type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            </Field>
            <Field label="Sampai" htmlFor="bsi-to" required>
              <TextInput id="bsi-to" type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Saldo awal" htmlFor="bsi-open">
              <TextInput id="bsi-open" type="number" mono value={openingBalance} onChange={(e) => setOpeningBalance(Number(e.target.value))} />
            </Field>
            <Field label="Saldo akhir" htmlFor="bsi-close">
              <TextInput id="bsi-close" type="number" mono value={closingBalance} onChange={(e) => setClosingBalance(Number(e.target.value))} />
            </Field>
          </div>

          <Field label="Berkas" htmlFor="bsi-file" hint="XLSX atau CSV ekspor dari internet banking.">
            <FileDrop
              file={file}
              onFile={setFile}
              accept=".xlsx,.csv"
              hint="XLSX atau CSV, maksimal 10 MB"
              label="Letakkan berkas di sini atau pilih dari komputer"
              disabled={importMutation.isPending}
            />
          </Field>

          <button
            type="button"
            className="flex items-center gap-1 text-xs font-semibold text-ink-muted hover:text-ink"
            onClick={() => setMappingOpen(!mappingOpen)}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${mappingOpen ? "rotate-180" : ""}`} />
            Pemetaan kolom (lanjutan)
          </button>
          {mappingOpen && (
            <div className="grid grid-cols-2 gap-3 rounded-md border border-line bg-panel-sunk p-3">
              <Field label="Baris header" htmlFor="bsi-header-row">
                <TextInput id="bsi-header-row" type="number" min={1} mono value={headerRow} onChange={(e) => setHeaderRow(e.target.value)} />
              </Field>
              <Field label="Kolom tanggal" htmlFor="bsi-date-col">
                <TextInput id="bsi-date-col" type="number" min={1} mono value={dateCol} onChange={(e) => setDateCol(e.target.value)} />
              </Field>
              <Field label="Kolom keterangan" htmlFor="bsi-desc-col">
                <TextInput id="bsi-desc-col" type="number" min={1} mono value={descCol} onChange={(e) => setDescCol(e.target.value)} />
              </Field>
              <Field label="Kolom debit" htmlFor="bsi-debit-col">
                <TextInput id="bsi-debit-col" type="number" min={1} mono value={debitCol} onChange={(e) => setDebitCol(e.target.value)} />
              </Field>
              <Field label="Kolom kredit" htmlFor="bsi-credit-col">
                <TextInput id="bsi-credit-col" type="number" min={1} mono value={creditCol} onChange={(e) => setCreditCol(e.target.value)} />
              </Field>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }} disabled={importMutation.isPending}>
            Batal
          </Button>
          <Button type="button" disabled={!canSubmit || importMutation.isPending} onClick={() => importMutation.mutate(undefined as never)}>
            {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Impor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
