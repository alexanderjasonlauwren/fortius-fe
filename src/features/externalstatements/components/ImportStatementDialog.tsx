/**
 * "Impor laporan pembanding": download the template, fill it in,
 * upload. Subtotal rows in the upload are always recomputed from the
 * layout's own formulas on the backend (never trusted from the file) --
 * see externalstatementsApi's own doc for why the mock build cannot read
 * the file's content at all, and asks for a label/period instead.
 */
import { useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import { Field, FileDrop, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import type { StatementKind } from "../api/externalstatementsApi";
import { getTemplate, importStatement } from "../api/externalstatementsApi";

interface ImportStatementDialogProps {
  open: boolean;
  onClose: () => void;
  kind: StatementKind;
  /** Pre-filled from the page's own period picker -- the comparison book
   *  is almost always for the same period already on screen. */
  defaultPeriodFrom?: string;
  defaultPeriodTo?: string;
  defaultAsOf?: string;
  onImported: (id: string) => void;
}

export function ImportStatementDialog({
  open, onClose, kind, defaultPeriodFrom, defaultPeriodTo, defaultAsOf, onImported,
}: ImportStatementDialogProps) {
  const [label, setLabel] = useState("");
  const [periodFrom, setPeriodFrom] = useState(defaultPeriodFrom ?? "");
  const [periodTo, setPeriodTo] = useState(defaultPeriodTo ?? "");
  const [asOf, setAsOf] = useState(defaultAsOf ?? "");
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setLabel(""); setFile(null);
    setPeriodFrom(defaultPeriodFrom ?? ""); setPeriodTo(defaultPeriodTo ?? ""); setAsOf(defaultAsOf ?? "");
  };

  const templateMutation = useDeskMutation({
    mutationFn: () => getTemplate(kind),
    errorTitle: "Unduh template gagal",
  });

  const importMutation = useDeskMutation({
    mutationFn: () =>
      importStatement({
        file: file!, label, kind,
        periodFrom: kind === "profit_loss" ? periodFrom : undefined,
        periodTo: kind === "profit_loss" ? periodTo : undefined,
        asOf: kind === "balance_sheet" ? asOf : undefined,
      }),
    success: "Laporan pembanding diimpor",
    errorTitle: "Impor gagal",
    onDone: (statement) => {
      reset();
      onImported(statement.id);
      onClose();
    },
  });

  const periodValid = kind === "profit_loss" ? !!periodFrom && !!periodTo : !!asOf;
  const canSubmit = !!label.trim() && !!file && periodValid;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && (reset(), onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Impor laporan pembanding</DialogTitle>
          <DialogDescription>
            Angka dari akuntan atau pihak lain, untuk dibandingkan dengan sistem. Subtotal dihitung ulang dari baris-barisnya, bukan diambil dari angka di berkas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => templateMutation.mutate(undefined as never)}
            disabled={templateMutation.isPending}
          >
            {templateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Unduh template
          </Button>

          <Field label="Label" hint="Nama pembuat laporan ini, misal nama akuntan atau kantor.">
            <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Contoh: Laporan Akuntan" />
          </Field>

          {kind === "profit_loss" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dari tanggal">
                <TextInput type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
              </Field>
              <Field label="Sampai tanggal">
                <TextInput type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
              </Field>
            </div>
          ) : (
            <Field label="Per tanggal">
              <TextInput type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </Field>
          )}

          <Field label="Berkas" hint="Workbook .xlsx yang sudah diisi dari template di atas.">
            <FileDrop
              file={file}
              onFile={setFile}
              accept=".xlsx"
              hint="XLSX, maksimal 10 MB"
              label="Letakkan berkas di sini atau pilih dari komputer"
              disabled={importMutation.isPending}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={importMutation.isPending}>
            Batal
          </Button>
          <Button onClick={() => importMutation.mutate(undefined as never)} disabled={!canSubmit || importMutation.isPending}>
            {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {importMutation.isPending ? "Mengimpor…" : "Impor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
