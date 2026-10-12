/**
 * Kas & Bank: cash vouchers (kas masuk/keluar/transfer), rekening koran
 * import with auto-match/classify, and reconciliation. Financial-
 * statements plan's gap-closing phase, Phase B -- P4's API has been
 * complete and live-verified since the original 8-phase plan; this page
 * is its first console surface.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, FolderOpen, Plus, Send, Wallet, X } from "lucide-react";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import {
  listCashVouchers,
  postCashVoucher,
  type CashVoucher,
  type CashVoucherStatus,
  type CashVoucherType,
} from "@/features/cashvouchers/api/cashVoucherApi";
import { CashVoucherDialog } from "@/features/cashvouchers/components/CashVoucherDialog";
import { VoidVoucherDialog } from "@/features/cashvouchers/components/VoidVoucherDialog";
import { listImports, getReconciliation } from "@/features/bankstatements/api/bankStatementApi";
import { ImportBankStatementDialog } from "@/features/bankstatements/components/ImportBankStatementDialog";
import { BankStatementDetailDialog } from "@/features/bankstatements/components/BankStatementDetailDialog";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Field, SegmentedControl, SelectInput } from "@/components/common/Field";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { getStatusVariant, spineFor } from "@/lib/status";
import { formatDateId, formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

type Tab = "transaksi" | "rekening-koran" | "rekonsiliasi";

const VOUCHER_TYPE_LABEL: Record<CashVoucherType, string> = {
  receipt: "Kas masuk",
  disbursement: "Kas keluar",
  transfer: "Transfer",
};
const VOUCHER_STATUS_LABEL: Record<CashVoucherStatus, string> = {
  draft: "Draft",
  posted: "Diposting",
  void: "Dibatalkan",
};

export function CashBankPage() {
  const [tab, setTab] = useState<Tab>("transaksi");

  /* ── Transaksi ─────────────────────────────────────────────────────── */
  const [voucherStatusFilter, setVoucherStatusFilter] = useState<CashVoucherStatus | "">("");
  const [voucherDialog, setVoucherDialog] = useState<"new" | CashVoucher | null>(null);
  const [voidTarget, setVoidTarget] = useState<CashVoucher | null>(null);

  const vouchers = useQuery({
    queryKey: [...scopeKey(), "cash-bank", "vouchers", voucherStatusFilter],
    queryFn: () => listCashVouchers(voucherStatusFilter ? { status: voucherStatusFilter } : undefined),
    enabled: tab === "transaksi",
  });

  const postMutation = useDeskMutation({
    mutationFn: (row: CashVoucher) => postCashVoucher(row.id, row.version),
    success: (row) => ({ title: `${row.voucherNumber} diposting`, description: "Jurnal telah ditulis." }),
    errorTitle: "Posting gagal",
  });

  const voucherColumns: Column<CashVoucher>[] = [
    {
      key: "number", header: "Nomor",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{row.voucherNumber}</span>
          <span className="text-2xs text-ink-muted">{VOUCHER_TYPE_LABEL[row.voucherType]}</span>
        </>
      ),
      sortValue: (row) => row.voucherNumber,
    },
    { key: "date", header: "Tanggal", render: (row) => <span className="data text-xs">{formatDateId(row.voucherDate)}</span>, sortValue: (row) => row.voucherDate },
    {
      key: "accounts", header: "Akun",
      render: (row) => (
        <span className="text-xs text-ink">
          {row.bankAccountLabel}
          {row.counterBankAccountLabel && ` → ${row.counterBankAccountLabel}`}
        </span>
      ),
    },
    { key: "counterparty", header: "Pihak terkait", render: (row) => <span className="text-xs text-ink-muted">{row.counterparty ?? "—"}</span> },
    { key: "amount", header: "Nilai", align: "right", render: (row) => <span className="data">{formatRupiah(row.totalAmount)}</span>, sortValue: (row) => row.totalAmount },
    { key: "status", header: "Status", render: (row) => <StatusBadge label={VOUCHER_STATUS_LABEL[row.status]} variant={getStatusVariant(VOUCHER_STATUS_LABEL[row.status])} /> },
    {
      key: "actions", header: "",
      render: (row) =>
        row.status === "draft" ? (
          <CanAccess permission={PERMISSIONS.CASH_VOUCHERS_APPROVE}>
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon-xs" aria-label={`Ubah ${row.voucherNumber}`} onClick={() => setVoucherDialog(row)}>
                <Wallet className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon-xs" aria-label={`Posting ${row.voucherNumber}`}
                onClick={() => postMutation.mutate(row)}
                disabled={postMutation.isPending}
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CanAccess>
        ) : row.status === "posted" ? (
          <CanAccess permission={PERMISSIONS.CASH_VOUCHERS_APPROVE}>
            <div className="flex justify-end">
              <Button
                variant="ghost" size="icon-xs" aria-label={`Batalkan ${row.voucherNumber}`}
                className="hover:bg-rust-soft hover:text-rust-ink"
                onClick={() => setVoidTarget(row)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CanAccess>
        ) : null,
    },
  ];

  /* ── Rekening Koran ────────────────────────────────────────────────── */
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [detailImportId, setDetailImportId] = useState<string | null>(null);

  const imports = useQuery({
    queryKey: [...scopeKey(), "cash-bank", "imports"],
    queryFn: () => listImports(),
    enabled: tab === "rekening-koran",
  });

  /* ── Rekonsiliasi ──────────────────────────────────────────────────── */
  const [reconBankAccountId, setReconBankAccountId] = useState("");
  const [reconAsOf, setReconAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const bankAccounts = useQuery({ queryKey: [...scopeKey(), "cash-bank", "bank-accounts"], queryFn: getBankAccounts });
  const reconciliation = useQuery({
    queryKey: [...scopeKey(), "cash-bank", "reconciliation", reconBankAccountId, reconAsOf],
    queryFn: () => getReconciliation(reconBankAccountId, reconAsOf),
    enabled: tab === "rekonsiliasi" && !!reconBankAccountId,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Kas & Bank"
        description="Voucher kas masuk/keluar/transfer, impor rekening koran, dan rekonsiliasi dengan buku besar."
        meta={
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "transaksi" as const, label: "Transaksi" },
              { value: "rekening-koran" as const, label: "Rekening Koran" },
              { value: "rekonsiliasi" as const, label: "Rekonsiliasi" },
            ]}
          />
        }
      />

      {tab === "transaksi" && (
        <Panel>
          <PanelHeader
            title="Voucher kas & bank"
            hint={`${vouchers.data?.length ?? 0} voucher`}
            actions={
              <div className="flex gap-2">
                <SelectInput value={voucherStatusFilter} onChange={(e) => setVoucherStatusFilter(e.target.value as CashVoucherStatus | "")}>
                  <option value="">Semua status</option>
                  {Object.entries(VOUCHER_STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </SelectInput>
                <CanAccess permission={PERMISSIONS.CASH_VOUCHERS_CREATE}>
                  <Button onClick={() => setVoucherDialog("new")}>
                    <Plus className="h-3.5 w-3.5" />
                    Voucher baru
                  </Button>
                </CanAccess>
              </div>
            }
          />
          <DataTable
            columns={voucherColumns}
            data={vouchers.data ?? []}
            isLoading={vouchers.isLoading}
            rowKey={(row) => row.id}
            spineFor={(row) => spineFor(VOUCHER_STATUS_LABEL[row.status])}
            pageSize={12}
            defaultSortKey="date"
            defaultSortDir="desc"
            dense
            emptyIcon={Wallet}
            emptyMessage="Belum ada voucher"
            emptyDescription="Catat kas masuk, kas keluar, atau transfer antar akun."
          />
        </Panel>
      )}

      {tab === "rekening-koran" && (
        <Panel>
          <PanelHeader
            title="Rekening koran"
            hint={`${imports.data?.length ?? 0} impor`}
            actions={
              <CanAccess permission={PERMISSIONS.BANK_STATEMENTS_IMPORT}>
                <Button onClick={() => setImportDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Impor rekening koran
                </Button>
              </CanAccess>
            }
          />
          {imports.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (imports.data ?? []).length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-muted">
              Belum ada rekening koran yang diimpor.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {(imports.data ?? []).map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{row.bankAccountLabel}</p>
                    <p className="text-xs text-ink-muted">
                      {formatDateId(row.periodFrom)} – {formatDateId(row.periodTo)} · {row.fileName}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-ink-muted">{row.rowCount} baris</p>
                    <Button variant="outline" size="sm" onClick={() => setDetailImportId(row.id)}>
                      <FolderOpen className="h-3.5 w-3.5" />
                      Lihat
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === "rekonsiliasi" && (
        <Panel>
          <PanelHeader title="Rekonsiliasi" hint="Saldo rekening koran dibandingkan dengan buku besar." />
          <div className="flex flex-wrap items-end gap-4 border-b border-line p-4">
            <Field label="Akun kas/bank" htmlFor="recon-bank">
              <SelectInput id="recon-bank" value={reconBankAccountId} onChange={(e) => setReconBankAccountId(e.target.value)}>
                <option value="">— Pilih —</option>
                {(bankAccounts.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.kind === "cash" ? "Kas" : a.bank} {a.nomorRekening}</option>
                ))}
              </SelectInput>
            </Field>
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

          {!reconBankAccountId ? (
            <p className="p-6 text-sm text-ink-muted">Pilih akun kas/bank di atas untuk melihat rekonsiliasinya.</p>
          ) : reconciliation.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : reconciliation.data ? (
            <div className="grid grid-cols-3 gap-4 p-5">
              <div>
                <p className="text-xs text-ink-muted">Saldo rekening koran</p>
                <p className="data mt-1 text-lg font-semibold text-ink">
                  {reconciliation.data.statementBalance != null ? formatRupiah(reconciliation.data.statementBalance) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Saldo buku besar</p>
                <p className="data mt-1 text-lg font-semibold text-ink">{formatRupiah(reconciliation.data.ledgerBalance)}</p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Selisih</p>
                <p className={`data mt-1 flex items-center gap-1.5 text-lg font-semibold ${reconciliation.data.difference === 0 ? "text-pine" : "text-rust"}`}>
                  {reconciliation.data.difference === 0 && <CheckCircle2 className="h-4 w-4" />}
                  {reconciliation.data.difference != null ? formatRupiah(reconciliation.data.difference) : "—"}
                </p>
                {reconciliation.data.unmatchedCount > 0 && (
                  <p className="mt-1 text-xs text-rust-ink">{reconciliation.data.unmatchedCount} baris belum dicocokkan</p>
                )}
              </div>
            </div>
          ) : null}
        </Panel>
      )}

      <CashVoucherDialog
        // Forces a fresh mount (so its lazy initial state re-reads
        // `voucher`) on every distinct target -- see the component's own
        // doc for why an effect was the wrong fix here.
        key={voucherDialog === "new" ? "new" : voucherDialog ? voucherDialog.id : "closed"}
        open={!!voucherDialog}
        voucher={voucherDialog === "new" ? null : voucherDialog}
        onClose={() => setVoucherDialog(null)}
        onSaved={() => void vouchers.refetch()}
      />
      <VoidVoucherDialog voucher={voidTarget} onClose={() => setVoidTarget(null)} onVoided={() => void vouchers.refetch()} />
      <ImportBankStatementDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImported={() => void imports.refetch()}
      />
      <BankStatementDetailDialog importId={detailImportId} onClose={() => setDetailImportId(null)} />
    </div>
  );
}
