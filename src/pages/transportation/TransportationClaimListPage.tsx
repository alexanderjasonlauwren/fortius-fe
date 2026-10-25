import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Calculator, CloudDownload, Eye, FileText, Pencil, Plus, ReceiptText, ShieldCheck, Trash2 } from "lucide-react";
import {
  createClaim,
  deleteClaim,
  generateLines,
  generateFromSim3lon,
  getClaims,
  updateClaim,
  updateClaimStatus,
  type ClaimView,
} from "@/features/transportation/api/transportationApi";
import { CLAIM_NEXT_STATUSES, CLAIM_STATUSES, CLAIM_STATUS_LABEL } from "@/features/transportation/api/contract";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ActionTooltip } from "@/components/common/ActionTooltip";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import { Field, SearchInput, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatNumber, formatRupiah } from "@/lib/format";
import type { ClaimStatus } from "@/types/domain";

interface FormState {
  id?: string;
  version?: number;
  period: string; // YYYY-MM, only used on create -- immutable once the claim exists
  handoverDate: string;
  handoverReference: string;
}

const EMPTY: FormState = { period: "", handoverDate: "", handoverReference: "" };

/** "Oktober 2026" from an ISO period_start date -- Indonesian month name, matching every
 * other date the console renders (formatDateId's own MONTH_SHORT is not exported). */
function periodLabel(periodStart: string): string {
  const d = new Date(periodStart);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

interface StatusFormState {
  id: string;
  version: number;
  /** The claim's status now; claimStatus is where it is being moved. */
  fromStatus: ClaimStatus;
  claimStatus: ClaimStatus;
  principalInvoiceNumber: string;
  statusNote: string;
  settledAt: string;
  settledAmount: string;
  taxWithheld: string;
  settlementMode: "cash" | "bank";
  labelForTitle: string;
  /** The claim's own claimedAmount -- settledAmount + taxWithheld must make it up. */
  expectedAmount: number;
}

/**
 * The BAST ledger -- D3's own A-Step 1/5/6/7. A claim is opened empty for a
 * calendar month; "Buat lini" derives its lines and its amount from actual
 * deliveries in that period, priced against the tariff covering each one's
 * own date. Nothing here is typed by hand once a claim exists past draft.
 */
export function TransportationClaimListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ClaimStatus | "Semua">("Semua");
  const [editing, setEditing] = useState<FormState | null>(null);
  const [statusEditing, setStatusEditing] = useState<StatusFormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ClaimView | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const list = useQuery({
    queryKey: [...scopeKey(), "transportation-claims", search, status],
    queryFn: () => getClaims({ search, claimStatus: status }),
  });

  const saveMutation = useDeskMutation({
    mutationFn: (values: FormState) =>
      values.id
        ? updateClaim({
            id: values.id,
            version: values.version!,
            handoverReference: values.handoverReference || undefined,
            handoverDate: values.handoverDate,
          })
        : createClaim({
            period: values.period,
            handoverDate: values.handoverDate,
            handoverReference: values.handoverReference || undefined,
          }),
    errorTitle: "BAST tidak tersimpan",
    success: (c) => ({ title: `${c.claimNumber} tersimpan` }),
    onDone: () => setEditing(null),
  });

  const generateMutation = useDeskMutation({
    mutationFn: (id: string) => generateLines(id),
    errorTitle: "Lini klaim tidak dapat dibuat",
    success: (c) => ({
      title: `${c.claimNumber}: ${c.totalQty} tabung senilai ${formatRupiah(c.claimedAmount)}`,
    }),
  });

  // The BA LO: the period's LPG 3 kg Loading Orders from SIM3LON, per kg.
  const loMutation = useDeskMutation({
    mutationFn: (id: string) => generateFromSim3lon(id),
    errorTitle: "LO dari SIM3LON tidak dapat diambil",
    success: (c) => ({
      title: `${c.claimNumber}: ${formatNumber(c.totalWeightKg)} kg dari SIM3LON senilai ${formatRupiah(c.claimedAmount)}`,
    }),
  });

  const statusMutation = useDeskMutation({
    mutationFn: (values: StatusFormState) =>
      updateClaimStatus({
        id: values.id,
        version: values.version,
        claimStatus: values.claimStatus,
        principalInvoiceNumber: values.principalInvoiceNumber || undefined,
        statusNote: values.statusNote || undefined,
        settledAt: values.claimStatus === "paid" ? values.settledAt || undefined : undefined,
        settledAmount:
          values.claimStatus === "paid" && values.settledAmount
            ? Number(values.settledAmount)
            : undefined,
        taxWithheld:
          values.claimStatus === "paid" && Number(values.taxWithheld) > 0
            ? Number(values.taxWithheld)
            : undefined,
        settlementMode: values.claimStatus === "paid" ? values.settlementMode : undefined,
      }),
    errorTitle: "Status tidak tersimpan",
    success: (c) => ({ title: `Status ${c.claimNumber} diperbarui` }),
    onDone: () => setStatusEditing(null),
  });

  const deleteMutation = useDeskMutation({
    mutationFn: (id: string) => deleteClaim(id),
    errorTitle: "Hapus BAST gagal",
    success: "BAST dihapus",
    onDone: () => setPendingDelete(null),
  });

  const openEditor = (state: FormState) => {
    setErrors({});
    setEditing(state);
  };

  const openStatusEditor = (row: ClaimView) => {
    setStatusEditing({
      id: row.id,
      version: row.version,
      fromStatus: row.claimStatus,
      claimStatus: CLAIM_NEXT_STATUSES[row.claimStatus][0] ?? row.claimStatus,
      principalInvoiceNumber: row.principalInvoiceNumber ?? "",
      statusNote: "",
      settledAt: row.settledAt ?? "",
      settledAmount: row.settledAmount ? String(row.settledAmount) : String(row.claimedAmount || ""),
      taxWithheld: row.taxWithheld ? String(row.taxWithheld) : "",
      settlementMode: row.settlementMode ?? "bank",
      labelForTitle: row.claimNumber,
      expectedAmount: row.claimedAmount,
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const next: typeof errors = {};
    if (!editing.id && !editing.period) next.period = "Periode wajib diisi.";
    if (!editing.handoverDate) next.handoverDate = "Tanggal serah terima wajib diisi.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saveMutation.mutate(editing);
  };

  const rows = list.data ?? [];

  const columns: Column<ClaimView>[] = [
    {
      key: "claimNumber",
      header: "Nomor",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{row.claimNumber}</span>
          <span className="block text-2xs text-ink-muted">
            {row.handoverReference ? `BAST ${row.handoverReference}` : "Belum ada nomor BAST"}
          </span>
        </>
      ),
      sortValue: (row) => row.claimNumber,
    },
    {
      key: "period",
      header: "Periode",
      render: (row) => (
        <span className="data text-xs text-ink">{row.periodStart ? periodLabel(row.periodStart) : "—"}</span>
      ),
      sortValue: (row) => row.periodStart ?? "",
    },
    {
      key: "totalQty",
      header: "Tabung",
      align: "right",
      render: (row) => <span className="data text-xs text-ink">{row.totalQty.toLocaleString("id-ID")}</span>,
      sortValue: (row) => row.totalQty,
    },
    {
      key: "claimedAmount",
      header: "Nilai Klaim",
      align: "right",
      render: (row) => <span className="data text-ink">{formatRupiah(row.claimedAmount)}</span>,
      sortValue: (row) => row.claimedAmount,
    },
    {
      key: "principalInvoiceNumber",
      header: "No. Invoice iVendor",
      render: (row) => (
        <span className="data text-xs text-ink-muted">{row.principalInvoiceNumber ?? "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex flex-col gap-1">
          <StatusBadge
            variant={getStatusVariant(CLAIM_STATUS_LABEL[row.claimStatus])}
            label={CLAIM_STATUS_LABEL[row.claimStatus]}
          />
          {row.statusNote && (
            <span className="max-w-[16rem] truncate text-2xs text-ink-muted" title={row.statusNote}>
              {row.statusNote}
            </span>
          )}
        </div>
      ),
      sortValue: (row) => row.claimStatus,
    },
    {
      key: "aksi",
      header: "",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <CanAccess permission={PERMISSIONS.TRANSPORTATION_CLAIMS_VIEW}>
            <ActionTooltip label="Lihat Berita Acara / BA LO. Cetak atau unduh PDF dari sana">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Lihat Berita Acara ${row.claimNumber}`}
                onClick={() => navigate(`/transportation-claims/${row.id}`)}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            </ActionTooltip>
          </CanAccess>
          {(row.claimStatus === "approved" || row.claimStatus === "paid") && (
            <ActionTooltip label="Invoice transport fee (Tahap 2) untuk BAST yang sudah disetujui">
              <Button variant="ghost" size="icon-xs" asChild aria-label={`Invoice ${row.claimNumber}`}>
                <Link to="/transport-invoices">
                  <ReceiptText className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </ActionTooltip>
          )}
          {row.claimStatus === "draft" && (
            <CanAccess permission={PERMISSIONS.TRANSPORTATION_CLAIMS_EDIT}>
              <ActionTooltip
                label="Hitung lini dari pengiriman (surat jalan) yang selesai pada periode ini"
                disabled={generateMutation.isPending}
              >
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Buat lini ${row.claimNumber}`}
                  disabled={generateMutation.isPending}
                  onClick={() => generateMutation.mutate(row.id)}
                >
                  <Calculator className="h-3.5 w-3.5" />
                </Button>
              </ActionTooltip>
              <ActionTooltip
                label="Ambil LO dari SIM3LON (BA LO): setiap LO LPG 3 kg pada periode ini × tarif per kg"
                disabled={loMutation.isPending}
              >
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Ambil LO dari SIM3LON ${row.claimNumber}`}
                  disabled={loMutation.isPending}
                  onClick={() => loMutation.mutate(row.id)}
                >
                  <CloudDownload className="h-3.5 w-3.5" />
                </Button>
              </ActionTooltip>
            </CanAccess>
          )}
          <CanAccess permission={PERMISSIONS.TRANSPORTATION_CLAIMS_EDIT}>
            <ActionTooltip
              label={
                CLAIM_NEXT_STATUSES[row.claimStatus].length > 0
                  ? "Ubah status: ajukan, tinjau, setujui, tolak, atau tandai lunas"
                  : `Klaim ${CLAIM_STATUS_LABEL[row.claimStatus].toLowerCase()} tidak dapat diubah lagi`
              }
            >
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Ubah status ${row.claimNumber}`}
                disabled={CLAIM_NEXT_STATUSES[row.claimStatus].length === 0}
                onClick={() => openStatusEditor(row)}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
              </Button>
            </ActionTooltip>
            <ActionTooltip label="Ubah nomor dan tanggal serah terima BAST">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Ubah ${row.claimNumber}`}
                onClick={() =>
                  openEditor({
                    id: row.id,
                    version: row.version,
                    period: row.periodStart?.slice(0, 7) ?? "",
                    handoverReference: row.handoverReference ?? "",
                    handoverDate: row.handoverDate,
                  })
                }
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </ActionTooltip>
          </CanAccess>
          {/* Only a draft may be deleted -- mirrors the service's own rule
              (a submitted claim is a record of something already sent to
              the principal), rather than offering an action that would
              always fail past draft. */}
          {row.claimStatus === "draft" && (
            <CanAccess permission={PERMISSIONS.TRANSPORTATION_CLAIMS_DELETE}>
              <ActionTooltip label="Hapus klaim draf ini">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Hapus ${row.claimNumber}`}
                  onClick={() => setPendingDelete(row)}
                  className="hover:bg-rust-soft hover:text-rust-ink"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </ActionTooltip>
            </CanAccess>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasi harian"
        title="Klaim Transportasi (BAST)"
        description="Buka klaim untuk satu periode, lalu isi lininya dari LO SIM3LON atau dari pengiriman yang sudah selesai. Nilai klaim dihitung otomatis."
        actions={
          <div className="flex gap-2">
            <CanAccess permission={PERMISSIONS.TRANSPORTATION_CLAIMS_VIEW}>
              <ActionTooltip label="Rekap per bulan: jumlah klaim, nilai, yang sudah dibayar dan sisa piutang">
                <Button variant="outline" asChild>
                  <Link to="/transportation-claims/recap">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Rekap bulanan
                  </Link>
                </Button>
              </ActionTooltip>
            </CanAccess>
            <CanAccess permission={PERMISSIONS.TRANSPORTATION_CLAIMS_CREATE}>
              <ActionTooltip label="Buka klaim draf untuk satu bulan, lalu isi lininya dari LO SIM3LON atau pengiriman">
                <Button onClick={() => openEditor(EMPTY)}>
                  <Plus className="h-3.5 w-3.5" />
                  Buka klaim baru
                </Button>
              </ActionTooltip>
            </CanAccess>
          </div>
        }
        meta={
          <span className="text-xs text-ink-muted">
            <span className="data">{rows.length}</span> klaim
          </span>
        }
      />

      <Panel>
        <PanelHeader
          title="Daftar klaim"
          hint={`${rows.length} baris`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Nomor BAST, klaim, atau invoice"
                className="w-72"
              />
              <SelectInput value={status} onChange={(e) => setStatus(e.target.value as ClaimStatus | "Semua")}>
                <option value="Semua">Semua status</option>
                {CLAIM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {CLAIM_STATUS_LABEL[s]}
                  </option>
                ))}
              </SelectInput>
            </div>
          }
        />
        <DataTable
          columns={columns}
          data={rows}
          isLoading={list.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) => spineFor(CLAIM_STATUS_LABEL[row.claimStatus])}
          pageSize={12}
          defaultSortKey="handoverDate"
          emptyIcon={FileText}
          emptyMessage="Belum ada klaim BAST"
          emptyDescription="Buka klaim pertama untuk periode yang sudah berjalan."
          emptyAction={
            <CanAccess permission={PERMISSIONS.TRANSPORTATION_CLAIMS_CREATE}>
              <Button size="sm" onClick={() => openEditor(EMPTY)}>
                Buka klaim baru
              </Button>
            </CanAccess>
          }
          dense
        />
      </Panel>

      {/* Open a draft, or edit its own paperwork fields once it exists. */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Ubah BAST" : "Buka klaim baru"}</DialogTitle>
              <DialogDescription>
                {editing?.id
                  ? "Nomor BAST adalah nomor di dokumen serah terimanya. Kosongkan bila belum terbit."
                  : "Nomor klaim diterbitkan otomatis. Setelah dibuka, gunakan “Buat lini” pada baris klaim untuk menghitung nilainya dari pengiriman pada periode ini."}
              </DialogDescription>
            </DialogHeader>

            {editing && (
              <div className="grid grid-cols-1 gap-4 py-4">
                {!editing.id && (
                  <Field label="Periode" htmlFor="tc-period" error={errors.period} required>
                    <TextInput
                      id="tc-period"
                      type="month"
                      value={editing.period}
                      invalid={!!errors.period}
                      onChange={(e) => setEditing({ ...editing, period: e.target.value })}
                    />
                  </Field>
                )}

                <Field
                  label="Tanggal serah terima"
                  htmlFor="tc-date"
                  error={errors.handoverDate}
                  required
                >
                  <TextInput
                    id="tc-date"
                    type="date"
                    value={editing.handoverDate}
                    invalid={!!errors.handoverDate}
                    onChange={(e) => setEditing({ ...editing, handoverDate: e.target.value })}
                  />
                </Field>

                <Field
                  label="Nomor BAST"
                  htmlFor="tc-ref"
                  hint="Nomor di dokumen fisik atau hasil pindaian. Kosongkan bila belum ada."
                >
                  <TextInput
                    id="tc-ref"
                    mono
                    placeholder="BAST/123/2026"
                    value={editing.handoverReference}
                    onChange={(e) => setEditing({ ...editing, handoverReference: e.target.value })}
                  />
                </Field>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record what the agent read off iVendor. */}
      <Dialog open={!!statusEditing} onOpenChange={(open) => !open && setStatusEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (statusEditing) statusMutation.mutate(statusEditing);
            }}
          >
            <DialogHeader>
              <DialogTitle>Ubah status {statusEditing?.labelForTitle}</DialogTitle>
              <DialogDescription>
                Catat status terbaru dari iVendor. Status bisa diubah kapan saja mengikuti iVendor.
              </DialogDescription>
            </DialogHeader>

            {statusEditing && (
              <div className="grid grid-cols-1 gap-4 py-4">
                <Field label="Status" htmlFor="tc-status">
                  <SelectInput
                    id="tc-status"
                    value={statusEditing.claimStatus}
                    onChange={(e) =>
                      setStatusEditing({
                        ...statusEditing,
                        claimStatus: e.target.value as ClaimStatus,
                      })
                    }
                  >
                    {CLAIM_NEXT_STATUSES[statusEditing.fromStatus].map((s) => (
                      <option key={s} value={s}>
                        {CLAIM_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>

                <Field label="Nomor invoice iVendor" htmlFor="tc-inv" hint="Kosongkan jika belum diterbitkan.">
                  <TextInput
                    id="tc-inv"
                    mono
                    value={statusEditing.principalInvoiceNumber}
                    onChange={(e) =>
                      setStatusEditing({ ...statusEditing, principalInvoiceNumber: e.target.value })
                    }
                  />
                </Field>

                <Field label="Catatan" htmlFor="tc-note" hint="Misalnya pesan dari iVendor yang tidak jelas.">
                  <TextareaInput
                    id="tc-note"
                    rows={3}
                    value={statusEditing.statusNote}
                    onChange={(e) =>
                      setStatusEditing({ ...statusEditing, statusNote: e.target.value })
                    }
                  />
                </Field>

                {/* Only relevant on the transition to "paid" -- date, amount
                    and method are required together, and the money received
                    plus the tax Pertamina withheld must make up the claim's
                    own claimedAmount (the backend's UpdateStatusRequest rule). */}
                {statusEditing.claimStatus === "paid" && (
                  <>
                    <Field label="Tanggal pelunasan" htmlFor="tc-settled-at" required>
                      <TextInput
                        id="tc-settled-at"
                        type="date"
                        value={statusEditing.settledAt}
                        onChange={(e) =>
                          setStatusEditing({ ...statusEditing, settledAt: e.target.value })
                        }
                      />
                    </Field>
                    <Field
                      label="Uang diterima"
                      htmlFor="tc-settled-amount"
                      hint={`Diterima + pajak dipotong harus sama dengan nilai klaim: ${formatRupiah(statusEditing.expectedAmount)}.`}
                      required
                    >
                      <TextInput
                        id="tc-settled-amount"
                        type="number"
                        mono
                        value={statusEditing.settledAmount}
                        onChange={(e) =>
                          setStatusEditing({ ...statusEditing, settledAmount: e.target.value })
                        }
                      />
                    </Field>
                    <Field
                      label="Pajak dipotong Pertamina"
                      htmlFor="tc-tax-withheld"
                      hint="Sesuai bukti potong; dicatat ke Pajak Dibayar Dimuka. Kosongkan bila tidak ada."
                    >
                      <TextInput
                        id="tc-tax-withheld"
                        type="number"
                        mono
                        value={statusEditing.taxWithheld}
                        onChange={(e) => {
                          const tax = e.target.value;
                          // The money that arrived is what is left once the
                          // tax is taken out; the operator can still correct it.
                          const left = statusEditing.expectedAmount - (Number(tax) || 0);
                          setStatusEditing({
                            ...statusEditing,
                            taxWithheld: tax,
                            settledAmount: left > 0 ? String(Math.round(left * 100) / 100) : statusEditing.settledAmount,
                          });
                        }}
                      />
                    </Field>
                    <Field label="Metode pembayaran" htmlFor="tc-settlement-mode" required>
                      <SelectInput
                        id="tc-settlement-mode"
                        value={statusEditing.settlementMode}
                        onChange={(e) =>
                          setStatusEditing({
                            ...statusEditing,
                            settlementMode: e.target.value as "cash" | "bank",
                          })
                        }
                      >
                        <option value="bank">Bank</option>
                        <option value="cash">Tunai</option>
                      </SelectInput>
                    </Field>
                  </>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStatusEditing(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={statusMutation.isPending}>
                Simpan status
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Hapus ${pendingDelete?.claimNumber}?`}
        message="Hanya klaim draf yang bisa dihapus. Klaim yang sudah diajukan ke Pertamina cukup diubah statusnya bila perlu dikoreksi."
        confirmLabel="Hapus"
        variant="destructive"
        isPending={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}
