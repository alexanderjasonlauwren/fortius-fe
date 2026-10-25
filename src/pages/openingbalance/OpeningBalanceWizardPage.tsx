/**
 * The one-time opening-balance wizard: download the template, fill it in,
 * preview, then commit. Reuses the exact preview/commit split the real
 * backend enforces -- Preview never writes anything, Commit re-validates
 * and writes once. Financial-statements plan P7.2, gap-closing plan Phase
 * E.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Download, Loader2, TriangleAlert, Upload } from "lucide-react";
import {
  commitOpeningBalance,
  getTemplate,
  previewOpeningBalance,
  type OpeningBalancePreview,
} from "@/features/openingbalance/api/openingBalanceApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader } from "@/components/common/Panel";
import { Field, FileDrop, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";

export function OpeningBalanceWizardPage() {
  const navigate = useNavigate();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<OpeningBalancePreview | null>(null);

  const templateMutation = useDeskMutation({
    mutationFn: () => getTemplate(asOf),
    errorTitle: "Unduh template gagal",
  });

  const previewMutation = useDeskMutation({
    mutationFn: () => previewOpeningBalance(asOf, file!),
    errorTitle: "Pratinjau gagal",
    onDone: (result) => setPreview(result),
  });

  const commitMutation = useDeskMutation({
    mutationFn: () => commitOpeningBalance(asOf, file!),
    success: (result) => ({
      title: "Saldo awal ter-commit",
      description: `${result.invoicesCreated} tagihan, ${result.purchasesCreated} pembelian, ${result.assetsCreated} aset dibuat.`,
    }),
    errorTitle: "Commit gagal",
    onDone: () => navigate("/ledger"),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Saldo Awal"
        description="Impor neraca saldo, piutang, hutang, dan daftar aset dari sebelum sistem ini dipakai. Hanya bisa dilakukan satu kali."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/ledger")}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali ke Buku Besar
          </Button>
        }
      />

      <Panel>
        <PanelHeader title="1. Unduh template" hint="Berisi semua akun yang bisa diisi saldo (sudah terisi otomatis), ditambah lembar Piutang, Hutang, dan Aset yang masih kosong." />
        <PanelBody className="space-y-3">
          <Field label="Per tanggal" htmlFor="ob-asof" required>
            <TextInput id="ob-asof" type="date" value={asOf} onChange={(e) => { setAsOf(e.target.value); setPreview(null); }} />
          </Field>
          <Button variant="outline" onClick={() => templateMutation.mutate(undefined as never)} disabled={templateMutation.isPending}>
            {templateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Unduh template
          </Button>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="2. Unggah & pratinjau" hint="Workbook .xlsx yang sudah diisi dari template di atas." />
        <PanelBody className="space-y-3">
          <FileDrop
            file={file}
            onFile={(f) => { setFile(f); setPreview(null); }}
            accept=".xlsx"
            hint="XLSX, maksimal 10 MB"
            label="Letakkan berkas di sini atau pilih dari komputer"
            disabled={previewMutation.isPending || commitMutation.isPending}
          />
          <Button onClick={() => previewMutation.mutate(undefined as never)} disabled={!file || previewMutation.isPending}>
            {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Pratinjau
          </Button>
        </PanelBody>
      </Panel>

      {preview && (
        <Panel spine={preview.balanced && preview.errors.length === 0 ? "text-pine" : "text-rust"}>
          <PanelHeader title="3. Hasil pratinjau" />
          <PanelBody className="space-y-4">
            <div className="flex items-start gap-2">
              {preview.balanced && preview.errors.length === 0 ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pine-ink" />
              ) : (
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rust-ink" />
              )}
              <p className="text-sm text-ink">
                {preview.balanced && preview.errors.length === 0
                  ? "Berkas lengkap dan seimbang. Siap disimpan."
                  : "Ada yang perlu diperbaiki di berkas sebelum disimpan."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Stat label="Baris neraca" value={preview.trialBalanceRows} />
              <Stat label="Baris piutang" value={preview.piutangRows} />
              <Stat label="Baris hutang" value={preview.hutangRows} />
              <Stat label="Baris aset" value={preview.asetRows} />
              <Stat label="Selisih" value={formatRupiah(Math.abs(preview.totalDebit - preview.totalCredit))} />
            </div>

            {preview.errors.length > 0 && (
              <div className="rounded-md border border-rust bg-rust/5 p-3 text-xs text-rust-ink">
                <p className="mb-1.5 font-semibold">{preview.errors.length} kesalahan:</p>
                <ul className="space-y-1">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      <span className="data">{e.sheet} baris {e.row}</span>: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <CanAccess permission={PERMISSIONS.FISCAL_YEARS_CLOSE}>
              <Button
                disabled={!preview.balanced || preview.errors.length > 0 || commitMutation.isPending}
                onClick={() => commitMutation.mutate(undefined as never)}
              >
                {commitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Commit saldo awal
              </Button>
            </CanAccess>
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-2xs text-ink-muted">{label}</p>
      <p className="data mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
