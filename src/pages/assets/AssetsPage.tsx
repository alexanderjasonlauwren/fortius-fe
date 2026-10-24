/**
 * Aset Tetap: the fixed-asset / intangible / prepaid register, monthly
 * depreciation runs, and reconciliation against the ledger. Financial-
 * statements plan P6's API has been complete and live-verified since the
 * original 8-phase plan; this page is its first console surface
 * (gap-closing plan, Phase D).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, LogOut, Pencil, Plus, TriangleAlert, X } from "lucide-react";
import { DisposeAssetDialog } from "@/features/assets/components/DisposeAssetDialog";
import { getAssetReconciliation, listAssets, type AssetClass, type AssetReconciliationRow, type AssetView } from "@/features/assets/api/assetApi";
import { AssetDialog } from "@/features/assets/components/AssetDialog";
import { AssetScheduleDialog } from "@/features/assets/components/AssetScheduleDialog";
import { listRuns, type DepreciationRunView } from "@/features/depreciationruns/api/depreciationRunApi";
import { RunDepreciationDialog } from "@/features/depreciationruns/components/RunDepreciationDialog";
import { RequestVoidDialog } from "@/features/approvals/components/RequestVoidDialog";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Field, SegmentedControl } from "@/components/common/Field";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { getStatusVariant } from "@/lib/status";
import { formatDateId, formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

type Tab = "daftar" | "penyusutan" | "rekonsiliasi";

const CLASS_LABEL: Record<AssetClass, string> = {
  building: "Bangunan",
  vehicle: "Kendaraan",
  office_equipment: "Inventaris Kantor",
  intangible: "Aset Tidak Berwujud",
  prepaid: "Sewa Dibayar Dimuka",
};

const STATUS_LABEL: Record<AssetView["status"], string> = {
  active: "Aktif",
  fully_depreciated: "Habis Disusutkan",
  disposed: "Dilepas",
};

const RUN_STATUS_LABEL: Record<DepreciationRunView["status"], string> = {
  posted: "Diposting",
  void: "Dibatalkan",
};

/** Prepaid expenses carry no accumulated account of their own. */
const isPrepaidOnly = (row: AssetReconciliationRow) =>
  row.assetClasses.length === 1 && row.assetClasses[0] === "prepaid";

export function AssetsPage() {
  const [tab, setTab] = useState<Tab>("daftar");

  /* ── Daftar aset ───────────────────────────────────────────────────── */
  const [assetDialog, setAssetDialog] = useState<"new" | AssetView | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<AssetView | null>(null);
  const [disposeTarget, setDisposeTarget] = useState<AssetView | null>(null);
  const assets = useQuery({ queryKey: [...scopeKey(), "assets", "list"], queryFn: () => listAssets(), enabled: tab === "daftar" || tab === "penyusutan" });

  const assetColumns: Column<AssetView>[] = [
    {
      key: "asset", header: "Aset",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{row.assetCode}</span>
          <span className="text-2xs text-ink-muted">{row.name}</span>
          {row.acquisitionJournal && <span className="data block text-2xs text-ink-muted">Perolehan {row.acquisitionJournal}</span>}
        </>
      ),
      sortValue: (row) => row.assetCode,
    },
    { key: "class", header: "Kelas", render: (row) => <span className="text-xs text-ink">{CLASS_LABEL[row.assetClass]}</span> },
    {
      key: "cost", header: "Harga perolehan", align: "right",
      render: (row) => <span className="data text-xs">{formatRupiah(row.cost)}</span>,
      sortValue: (row) => row.cost,
    },
    {
      key: "monthly", header: "Nilai/bulan", align: "right",
      render: (row) => <span className="data text-xs">{formatRupiah(row.monthlyAmount)}</span>,
    },
    {
      key: "accumulated", header: "Akumulasi s.d. ini", align: "right",
      render: (row) => <span className="data text-xs">{formatRupiah(row.accumulatedToDate)}</span>,
    },
    {
      key: "status", header: "Status",
      render: (row) => (
        <>
          <StatusBadge label={STATUS_LABEL[row.status]} variant={getStatusVariant(STATUS_LABEL[row.status])} />
          {row.status === "disposed" && (
            <span className="data mt-0.5 block text-2xs text-ink-muted">
              {row.disposedAt ? formatDateId(row.disposedAt) : ""}
              {row.disposalProceeds != null ? ` · ${formatRupiah(row.disposalProceeds)}` : ""}
              {row.disposalJournal ? ` · ${row.disposalJournal}` : ""}
            </span>
          )}
        </>
      ),
    },
    {
      key: "actions", header: "",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-xs" aria-label={`Jadwal ${row.assetCode}`} onClick={() => setScheduleTarget(row)}>
            <CalendarClock className="h-3.5 w-3.5" />
          </Button>
          {row.status !== "disposed" && (
            <CanAccess permission={PERMISSIONS.ASSETS_UPDATE}>
              <Button variant="ghost" size="icon-xs" aria-label={`Ubah ${row.assetCode}`} onClick={() => setAssetDialog(row)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon-xs" aria-label={`Lepas ${row.assetCode}`}
                className="hover:bg-rust-soft hover:text-rust-ink" onClick={() => setDisposeTarget(row)}>
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </CanAccess>
          )}
        </div>
      ),
    },
  ];

  /* ── Penyusutan ────────────────────────────────────────────────────── */
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<DepreciationRunView | null>(null);
  const runs = useQuery({ queryKey: [...scopeKey(), "depreciation-runs", "list"], queryFn: () => listRuns(), enabled: tab === "penyusutan" });
  const latestPosted = (runs.data ?? []).find((r) => r.status === "posted");

  /* ── Rekonsiliasi ──────────────────────────────────────────────────── */
  const [reconAsOf, setReconAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const reconciliation = useQuery({
    queryKey: [...scopeKey(), "assets", "reconciliation", reconAsOf],
    queryFn: () => getAssetReconciliation(reconAsOf),
    enabled: tab === "rekonsiliasi",
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Aset Tetap"
        description="Daftar aset tetap, aset tak berwujud, dan biaya dibayar di muka, beserta penyusutan bulanan dan pencocokannya dengan buku besar."
        meta={
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "daftar" as const, label: "Daftar aset" },
              { value: "penyusutan" as const, label: "Penyusutan" },
              { value: "rekonsiliasi" as const, label: "Rekonsiliasi" },
            ]}
          />
        }
      />

      {tab === "daftar" && (
        <Panel>
          <PanelHeader
            title="Register aset"
            hint={`${assets.data?.length ?? 0} aset`}
            actions={
              <CanAccess permission={PERMISSIONS.ASSETS_CREATE}>
                <Button onClick={() => setAssetDialog("new")}>
                  <Plus className="h-3.5 w-3.5" />
                  Daftarkan aset
                </Button>
              </CanAccess>
            }
          />
          <DataTable
            columns={assetColumns}
            data={assets.data ?? []}
            isLoading={assets.isLoading}
            rowKey={(row) => row.id}
            spineFor={(row) => getStatusVariant(STATUS_LABEL[row.status]) === "success" ? "text-pine" : "text-draft"}
            pageSize={12}
            defaultSortKey="asset"
            dense
            emptyMessage="Belum ada aset terdaftar"
            emptyDescription="Daftarkan bangunan, kendaraan, inventaris, aset tak berwujud, atau biaya dibayar di muka."
          />
        </Panel>
      )}

      {tab === "penyusutan" && (
        <Panel>
          <PanelHeader
            title="Run penyusutan"
            hint={`${runs.data?.length ?? 0} run`}
            actions={
              <CanAccess permission={PERMISSIONS.DEPRECIATION_RUNS_CREATE}>
                <Button onClick={() => setRunDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Jalankan penyusutan
                </Button>
              </CanAccess>
            }
          />
          {runs.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (runs.data ?? []).length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-muted">Belum ada penyusutan yang diposting.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(runs.data ?? []).map((run) => (
                <li key={run.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="data text-sm font-semibold text-ink">{run.period}</span>
                      <StatusBadge label={RUN_STATUS_LABEL[run.status]} variant={getStatusVariant(RUN_STATUS_LABEL[run.status])} />
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="data text-sm text-ink">{formatRupiah(run.totalAmount)}</span>
                      {run.status === "posted" && latestPosted?.id === run.id && (
                        <CanAccess permissions={[PERMISSIONS.DEPRECIATION_RUNS_UPDATE, PERMISSIONS.VOID_REQUESTS_CREATE]} requireAll>
                          <Button
                            variant="ghost" size="icon-xs" aria-label={`Ajukan pembatalan run ${run.period}`}
                            className="hover:bg-rust-soft hover:text-rust-ink"
                            onClick={() => setVoidTarget(run)}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </CanAccess>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">{run.lines.length} aset disusutkan</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === "rekonsiliasi" && (
        <Panel>
          <PanelHeader title="Rekonsiliasi" hint="Daftar aset dibandingkan dengan saldo buku besar, per kelas aset." />
          <div className="flex flex-wrap items-end gap-4 border-b border-line p-4">
            <Field label="Per tanggal" htmlFor="recon-asof">
              <input
                id="recon-asof"
                type="date"
                value={reconAsOf}
                onChange={(e) => setReconAsOf(e.target.value)}
                className="h-9 rounded-md border border-line bg-panel px-3 text-sm text-ink"
              />
            </Field>
          </div>

          {reconciliation.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (reconciliation.data ?? []).length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-muted">Tidak ada aset yang sudah diperoleh pada tanggal ini.</p>
          ) : (
            <div className="divide-y divide-line">
              {(reconciliation.data ?? []).map((row) => (
                <div key={row.assetClass} className="p-5">
                  <p className="text-sm font-semibold text-ink">
                    {row.assetClasses.map((c) => CLASS_LABEL[c]).join(" + ")}
                  </p>
                  {row.ledgerAccounts.length > 0 && (
                    <p className="mt-0.5 text-2xs text-ink-muted">
                      Akun {row.ledgerAccounts.join(", ")}
                      {row.assetClasses.length > 1 && " — digabung karena memakai akun yang sama"}
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div>
                      <p className="text-2xs text-ink-muted">Harga perolehan (register)</p>
                      <p className="data mt-0.5 text-sm text-ink">{formatRupiah(row.registerCost)}</p>
                    </div>
                    <div>
                      <p className="text-2xs text-ink-muted">Saldo akun aset (buku besar)</p>
                      <p className="data mt-0.5 text-sm text-ink">{formatRupiah(row.ledgerAssetBalance)}</p>
                    </div>
                    <div>
                      <p className="text-2xs text-ink-muted">Selisih harga perolehan</p>
                      <p className={`data mt-0.5 text-sm font-semibold ${row.costDifference === 0 ? "text-pine" : "text-rust"}`}>
                        {formatRupiah(row.costDifference)}
                      </p>
                    </div>
                    <div />
                    <div>
                      <p className="text-2xs text-ink-muted">Akumulasi (register)</p>
                      <p className="data mt-0.5 text-sm text-ink">{formatRupiah(row.registerAccumulated)}</p>
                    </div>
                    <div>
                      <p className="text-2xs text-ink-muted">Saldo akumulasi (buku besar)</p>
                      <p className="data mt-0.5 text-sm text-ink">{formatRupiah(row.ledgerAccumulatedBalance)}</p>
                    </div>
                    <div>
                      <p className="text-2xs text-ink-muted">Selisih akumulasi</p>
                      <p className={`data mt-0.5 text-sm font-semibold ${isPrepaidOnly(row) || row.accumulatedDifference === 0 ? "text-pine" : "text-rust"}`}>
                        {formatRupiah(row.accumulatedDifference)}
                      </p>
                    </div>
                  </div>
                  {isPrepaidOnly(row) && (
                    <p className="mt-2 flex items-start gap-1.5 text-2xs text-ink-muted">
                      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                      Biaya dibayar di muka tidak punya akun akumulasi sendiri karena amortisasinya langsung mengurangi akun asetnya, jadi selisih akumulasi di atas wajar.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      <AssetDialog
        key={assetDialog === "new" ? "new" : assetDialog ? assetDialog.id : "closed"}
        open={!!assetDialog}
        asset={assetDialog === "new" ? null : assetDialog}
        onClose={() => setAssetDialog(null)}
        onSaved={() => void assets.refetch()}
      />
      <AssetScheduleDialog asset={scheduleTarget} onClose={() => setScheduleTarget(null)} />
      <DisposeAssetDialog
        key={disposeTarget?.id ?? "closed"}
        asset={disposeTarget}
        onClose={() => setDisposeTarget(null)}
        onDisposed={() => void assets.refetch()}
      />
      <RunDepreciationDialog
        // Forces a fresh mount on every open, keyed on the latest posted
        // period -- without this, the dialog's own lazy initial `period`
        // state (computed from `latestPostedPeriod` once, on first mount)
        // would go stale the moment a run posts: reopening the same
        // instance after posting August would still default to August,
        // not September, since nothing re-runs the lazy initializer.
        key={runDialogOpen ? (latestPosted?.period ?? "none") : "closed"}
        open={runDialogOpen}
        latestPostedPeriod={latestPosted?.period}
        onClose={() => setRunDialogOpen(false)}
        onPosted={() => { void runs.refetch(); void assets.refetch(); }}
      />
      <RequestVoidDialog
        target={voidTarget ? {
          documentType: "depreciation_run", documentId: voidTarget.id, version: voidTarget.version,
          label: `penyusutan ${voidTarget.period}`,
          effect: "Jurnal penyusutan bulan ini dibalik dan nilai buku asetnya kembali.",
        } : null}
        onClose={() => setVoidTarget(null)}
        onRequested={() => { void runs.refetch(); void assets.refetch(); }}
      />
    </div>
  );
}
