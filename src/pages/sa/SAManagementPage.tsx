import { useState } from "react";
import { SupplierSection } from "@/features/settings/components/SupplierSection";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, CalendarClock, FileSpreadsheet, Upload } from "lucide-react";
import { useScheduleAgreement } from "@/features/sa/hooks/useScheduleAgreement";
import { SAFilterBar } from "@/features/sa/components/SAFilterBar";
import { SATable } from "@/features/sa/components/SATable";
import { UploadSAForm } from "@/features/sa/components/UploadSAForm";
import { ImportTargetsDialog } from "@/features/sa/components/ImportTargetsDialog";
import { SIM3LONImportDialog } from "@/features/sa/components/SIM3LONImportDialog";
import { LivePenyaluranPanel } from "@/features/sa/components/LivePenyaluranPanel";
import { QuotaSummaryPanel } from "@/features/sa/components/QuotaSummaryPanel";
import { PlanningCutoverDialog } from "@/features/sa/components/PlanningCutoverDialog";
import { useAuthStore } from "@/features/auth/store/authStore";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader } from "@/components/common/Panel";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import type { ScheduleAgreement } from "@/features/sa/types";
import type { UploadSAFormValues } from "@/features/sa/schema";
import { supplierLabel, unitLabel } from "@/lib/lexicon";

export function SAManagementPage() {
  const {
    saList,
    isLoading,
    isError,
    error,
    refetch,
    supplierOptions,
    filters,
    setFilters,
    uploadMutation,
    activateMutation,
    deleteMutation,
    printMutation,
  } = useScheduleAgreement();

  const [pendingDelete, setPendingDelete] = useState<ScheduleAgreement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState<ScheduleAgreement | null>(null);
  const [importingSIM3LON, setImportingSIM3LON] = useState(false);
  const [settingCutover, setSettingCutover] = useState(false);

  // Importing replaces a month of contractual obligations from a spreadsheet,
  // which is not the same authority as recording an agreement — so it has its
  // own permission, and the action is absent rather than disabled for whoever
  // lacks it.
  const canImport = useAuthStore((state) =>
    state.hasPermission(PERMISSIONS.SA_IMPORT),
  );
  const canSetCutover = useAuthStore((state) =>
    state.hasPermission(PERMISSIONS.SA_PLANNING_CUTOVER),
  );

  const live = saList.filter((s) => s.status === "Aktif" || s.status === "Limit");
  const drafts = saList.filter((s) => s.status === "Draft");
  const expiringSoon = live.filter((s) => s.sisaHari >= 0 && s.sisaHari <= 7);

  const handleUpload = (values: UploadSAFormValues & { namaDokumen?: string }) =>
    uploadMutation.mutate(values, { onSuccess: () => setUploading(false) });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasi harian"
        title="Schedule Agreement"
        description={`Kuota yang diterbitkan ${supplierLabel()} mitra. Setiap rencana distribusi menarik dari agreement yang aktif, jadi angka di sini adalah batas atas operasi bulan ini.`}
        actions={<div className="flex gap-2">
          <Button variant="outline" onClick={() => setUploading(true)}>
            <Upload className="h-3.5 w-3.5" />
            Catat manual
          </Button>
          {canSetCutover && (
            <Button variant="outline" onClick={() => setSettingCutover(true)}>
              <CalendarClock className="h-3.5 w-3.5" />
              Tanggal mulai sistem
            </Button>
          )}
          {canImport && (
            <Button onClick={() => setImportingSIM3LON(true)}>
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Impor SIM3LON
            </Button>
          )}
        </div>}
      />

      {canImport && <LivePenyaluranPanel />}

      {isError && (
        <Panel spine="text-rust" className="flex items-center gap-3 px-5 py-3.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-rust-ink" />
          <p className="flex-1 text-sm text-ink">
            Daftar agreement gagal dimuat.{" "}
            <span className="text-ink-muted">{error?.message}</span>
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Coba lagi
          </Button>
        </Panel>
      )}

      {expiringSoon.length > 0 && (
        <Panel spine="text-signal" className="flex flex-wrap items-center gap-3 px-5 py-3.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-signal-ink" />
          <p className="flex-1 text-sm text-ink">
            <span className="font-semibold">
              {expiringSoon.length} agreement berakhir dalam sepekan.
            </span>{" "}
            <span className="text-ink-muted">
              Sisa {formatNumber(expiringSoon.reduce((s, x) => s + x.sisaKuota, 0))}{" "}
              {unitLabel()} akan hangus jika tidak dijadwalkan.
            </span>
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/distribution">
              Susun rencana
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <QuotaSummaryPanel className="lg:col-span-2" />

        <Panel>
          <PanelHeader title="Alur kuota" />
          <PanelBody>
            {/* Numbered because this genuinely is a sequence — quota cannot move
                to the next step until the previous one is done. */}
            <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {[
                `${supplierLabel()} menerbitkan agreement. Unggah dokumennya, dan sistem mencatatnya sebagai draf.`,
                "Aktifkan agreement setelah dokumen diverifikasi. Kuota baru dapat ditarik setelah langkah ini.",
                "Rencana distribusi yang dikonfirmasi menarik kuota dan menerbitkan surat jalan.",
                "Agreement berstatus Limit saat tersisa di bawah 5%, dan Selesai saat habis atau periodenya lewat.",
              ].map((text, i) => (
                <li key={i} className="flex gap-3">
                  <span className="data flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-ink text-2xs font-semibold text-ink-on">
                    {i + 1}
                  </span>
                  <p className="text-xs leading-relaxed text-ink-muted">{text}</p>
                </li>
              ))}
            </ol>
          </PanelBody>
        </Panel>
      </div>

      <SAFilterBar filters={filters} onFilterChange={setFilters} />

      <Panel>
        <PanelHeader
          title="Daftar agreement"
          hint={`${saList.length} agreement · ${drafts.length} menunggu aktivasi`}
        />
        <SATable
          data={saList}
          isLoading={isLoading}
          onActivate={(id) => activateMutation.mutate(id)}
          onPrint={(id) => printMutation.mutate(id)}
          onDelete={setPendingDelete}
          onImport={canImport ? setImporting : undefined}
          pendingId={activateMutation.variables}
        />
      </Panel>

      <Dialog open={uploading} onOpenChange={setUploading}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Unggah Schedule Agreement</DialogTitle>
            <DialogDescription>
              Catat kuota yang diterbitkan {supplierLabel()} mitra. Agreement masuk sebagai draf
              sampai Anda mengaktifkannya.
            </DialogDescription>
          </DialogHeader>
          <UploadSAForm
            onSubmit={handleUpload}
            isPending={uploadMutation.isPending}
            supplierOptions={supplierOptions}
          />
        </DialogContent>
      </Dialog>

      <ImportTargetsDialog sa={importing} onClose={() => setImporting(null)} />
      <SIM3LONImportDialog
        open={importingSIM3LON}
        onClose={() => setImportingSIM3LON(false)}
        supplierOptions={supplierOptions}
      />
      <PlanningCutoverDialog open={settingCutover} onClose={() => setSettingCutover(false)} />

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Hapus ${pendingDelete?.nomorSA}?`}
        message="Agreement ini belum menarik kuota apa pun, jadi aman dihapus. Tindakan ini tidak dapat dibatalkan."
        details={
          pendingDelete && (
            <dl className="space-y-1">
              <div className="flex justify-between gap-4">
                <dt>{supplierLabel()}</dt>
                <dd className="text-ink">{pendingDelete.supplier}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Total kuota</dt>
                <dd className="data text-ink">{formatNumber(pendingDelete.totalKuota)} {unitLabel()}</dd>
              </div>
            </dl>
          )
        }
        confirmLabel="Hapus agreement"
        isPending={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteMutation.mutate(pendingDelete.id, {
            onSettled: () => setPendingDelete(null),
          });
        }}
      />

      {/* The SA issuers, derived from the agreements themselves. Lived in
          Pengaturan until accounting parity P6. */}
      <SupplierSection />
    </div>
  );
}
