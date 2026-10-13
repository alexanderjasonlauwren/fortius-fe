import { scopeKey } from "@/lib/scope";
import { AttachmentsButton } from "@/features/attachments/components/AttachmentsButton";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus, FileSpreadsheet, Receipt, ShieldAlert, StickyNote } from "lucide-react";
import {
  exportAging,
  getAgingReport,
  getInvoices,
  submitCreditNote,
  type AgingRow,
  type InvoiceView,
} from "@/features/finance/api/financeApi";
import { ManualInvoiceDialog } from "@/features/finance/components/ManualInvoiceDialog";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, Meter } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import {
  Field,
  SearchInput,
  SegmentedControl,
  TextInput,
  TextareaInput,
} from "@/components/common/Field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateId, formatNumber, formatRupiah, formatRupiahShort } from "@/lib/format";
import { outletLabel, outletLabelTitle, unitLabel } from "@/lib/lexicon";

type Tab = "umur" | "tagihan";

export function ReceivablesPage() {
  const [tab, setTab] = useState<Tab>("umur");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Piutang"
        description={`Siapa berutang berapa, dan sejak kapan. Tagihan yang lewat jatuh tempo memblokir pengiriman berikutnya ke ${outletLabel()} tersebut.`}
        meta={
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "umur" as const, label: "Umur piutang" },
              { value: "tagihan" as const, label: "Daftar tagihan" },
            ]}
          />
        }
      />
      {tab === "umur" ? <AgingSection /> : <InvoiceSection />}
    </div>
  );
}

/* ── ageing ────────────────────────────────────────────────────────────── */

function AgingSection() {
  const report = useQuery({ queryKey: [...scopeKey(), "aging"], queryFn: getAgingReport });

  const exportMutation = useDeskMutation({
    mutationFn: () => exportAging(),
    errorTitle: "Ekspor gagal",
    success: (n) => ({
      title: "Umur piutang diunduh",
      description: `${n} ${outletLabel()} diekspor ke Excel.`,
    }),
  });

  const r = report.data;
  const buckets = r?.buckets ?? [];

  const columns: Column<AgingRow>[] = [
    {
      key: outletLabel(),
      header: outletLabelTitle(),
      render: (row) => (
        <>
          <Link
            to={`/outlet/${row.outletId}`}
            className="block font-medium text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
          >
            {row.outlet}
          </Link>
          <span className="block text-2xs text-ink-muted">
            Termin <span className="data">{row.termin}</span> hari
            {row.batasKredit > 0 && (
              <>
                {" · plafon "}
                <span className="data">{formatRupiahShort(row.batasKredit)}</span>
              </>
            )}
          </span>
        </>
      ),
      sortValue: (row) => row.outlet,
    },
    ...buckets.map((b) => ({
      key: b,
      header: b,
      align: "right" as const,
      render: (row: AgingRow) =>
        row.buckets[b] > 0 ? (
          <span
            className={cn(
              "data",
              b === "Belum jatuh tempo" ? "text-ink-muted" : "text-rust-ink",
            )}
          >
            {formatRupiahShort(row.buckets[b])}
          </span>
        ) : (
          <span className="text-2xs text-ink-muted">—</span>
        ),
      sortValue: (row: AgingRow) => row.buckets[b] ?? 0,
    })),
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (row) => (
        <span className="data font-semibold text-ink">{formatRupiah(row.total)}</span>
      ),
      sortValue: (row) => row.total,
    },
    {
      key: "blokir",
      header: "",
      width: "1%",
      render: (row) =>
        row.terblokir ? (
          <span
            className="flex items-center gap-1 text-2xs font-semibold text-rust-ink"
            title="Pengiriman berikutnya akan ditolak sampai tunggakan diselesaikan"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            Diblokir
          </span>
        ) : null,
    },
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Total piutang"
          value={formatRupiahShort(r?.grandTotal ?? 0)}
          hint={`Dari ${formatNumber(r?.rows.length ?? 0)} ${outletLabel()}`}
        />
        <Stat
          label="Lewat jatuh tempo"
          value={formatRupiahShort(r?.jatuhTempoTotal ?? 0)}
          hint={
            r
              ? `${formatNumber(r.outletMenunggak)} ${outletLabel()} menunggak`
              : undefined
          }
          tone={r && r.jatuhTempoTotal > 0 ? "rust" : undefined}
        />
        <Stat
          label="Belum jatuh tempo"
          value={formatRupiahShort(r?.totals["Belum jatuh tempo"] ?? 0)}
          hint="Masih dalam termin"
          tone="pine"
        />
        <Stat
          label="Di atas 90 hari"
          value={formatRupiahShort(r?.totals["> 90 hari"] ?? 0)}
          hint="Kandidat penyisihan piutang ragu-ragu"
          tone={r && (r.totals["> 90 hari"] ?? 0) > 0 ? "rust" : undefined}
        />
      </div>

      {/* Composition, so the shape of the problem is visible at a glance. */}
      {r && r.grandTotal > 0 && (
        <Panel>
          <PanelHeader title="Komposisi umur piutang" />
          <div className="p-5">
            <div className="flex h-3 w-full overflow-hidden rounded-sm">
              {buckets.map((b, i) => {
                const value = r.totals[b] ?? 0;
                if (value <= 0) return null;
                const tone = [
                  "bg-pine",
                  "bg-signal",
                  "bg-signal/70",
                  "bg-rust/70",
                  "bg-rust",
                ][i];
                return (
                  <div
                    key={b}
                    className={tone}
                    style={{ width: `${(value / r.grandTotal) * 100}%` }}
                    title={`${b}: ${formatRupiah(value)}`}
                  />
                );
              })}
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
              {buckets.map((b, i) => (
                <li key={b} className="flex items-center gap-1.5 text-2xs text-ink-muted">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-[2px]",
                      ["bg-pine", "bg-signal", "bg-signal/70", "bg-rust/70", "bg-rust"][i],
                    )}
                  />
                  {b}
                  <span className="data text-ink">
                    {formatRupiahShort(r.totals[b] ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title={`Umur piutang per ${outletLabel()}`}
          hint="Dihitung dari tanggal jatuh tempo masing-masing tagihan"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportMutation.mutate(undefined as never)}
              disabled={exportMutation.isPending}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Unduh Excel
            </Button>
          }
        />
        <DataTable
          columns={columns}
          data={r?.rows ?? []}
          isLoading={report.isLoading}
          rowKey={(row) => row.outletId}
          spineFor={(row) => (row.jatuhTempo > 0 ? "text-rust" : "text-pine")}
          pageSize={15}
          defaultSortKey="total"
          defaultSortDir="desc"
          emptyIcon={Receipt}
          emptyMessage="Tidak ada piutang terbuka"
          emptyDescription="Semua tagihan sudah lunas. Piutang muncul saat surat jalan ditutup."
          dense
        />
      </Panel>
    </>
  );
}

/* ── invoices ──────────────────────────────────────────────────────────── */

const INVOICE_TYPE_LABEL: Record<InvoiceView["invoiceType"], string> = {
  delivery: "Pengiriman",
  registration: "Pendaftaran",
  other: "Lain-lain",
};

function InvoiceSection() {
  const [status, setStatus] = useState("Belum lunas");
  const [search, setSearch] = useState("");
  const [creditNote, setCreditNote] = useState<InvoiceView | null>(null);
  const [form, setForm] = useState({ jumlah: 0, alasan: "" });
  const [manualInvoiceOpen, setManualInvoiceOpen] = useState(false);
  const queryClient = useQueryClient();

  const invoices = useQuery({
    queryKey: [...scopeKey(), "invoices", status, search],
    queryFn: () => getInvoices({ status: status as never, search }),
  });

  const mutation = useDeskMutation({
    mutationFn: () =>
      submitCreditNote({
        outletId: creditNote!.outletId,
        invoiceId: creditNote!.id,
        jumlah: form.jumlah,
        alasan: form.alasan,
      }),
    errorTitle: "Nota kredit gagal diterbitkan",
    success: (n) => ({
      title: `${n.nomor} diterbitkan`,
      description: "Piutang berkurang dan retur tercatat di buku besar.",
    }),
    onDone: () => setCreditNote(null),
  });

  const columns: Column<InvoiceView>[] = [
    {
      key: "nomor",
      header: "Tagihan",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{row.nomor}</span>
          {row.invoiceType === "delivery" ? (
            <span className="data block text-2xs text-ink-muted">{row.suratJalan}</span>
          ) : (
            <span className="mt-0.5 inline-flex rounded-sm bg-panel-sunk px-1.5 py-0.5 text-2xs font-medium text-ink-muted">
              {INVOICE_TYPE_LABEL[row.invoiceType]}
            </span>
          )}
        </>
      ),
      sortValue: (row) => row.nomor,
    },
    {
      key: outletLabel(),
      header: outletLabelTitle(),
      render: (row) => (
        <Link
          to={`/outlet/${row.outletId}`}
          className="font-medium text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
        >
          {row.outlet}
        </Link>
      ),
      sortValue: (row) => row.outlet,
    },
    {
      key: "jatuhTempo",
      header: "Jatuh tempo",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">
            {formatDateId(row.jatuhTempo)}
          </span>
          <span
            className={cn(
              "data block text-2xs",
              row.umurHari > 0 ? "text-rust-ink" : "text-ink-muted",
            )}
          >
            {row.umurHari > 0 ? `telat ${row.umurHari} hari` : row.bucket}
          </span>
        </>
      ),
      sortValue: (row) => row.jatuhTempo,
    },
    {
      key: "total",
      header: "Tagihan",
      align: "right",
      render: (row) => (
        <span className="data text-ink">{formatRupiah(row.total)}</span>
      ),
      sortValue: (row) => row.total,
    },
    {
      key: "terbayar",
      header: "Terbayar",
      align: "right",
      width: "12rem",
      render: (row) => (
        <div className="min-w-[8rem]">
          <p className="data mb-1.5 text-xs text-ink">
            {formatRupiah(row.terbayar)}
            {row.kredit > 0 && (
              <span className="text-ink-muted"> +NK {formatRupiahShort(row.kredit)}</span>
            )}
          </p>
          <Meter
            value={row.terbayar + row.kredit}
            max={row.total}
            tone={row.sisa <= 0 ? "pine" : row.umurHari > 0 ? "rust" : "signal"}
            label={`${row.nomor} terbayar`}
          />
        </div>
      ),
      sortValue: (row) => row.terbayar,
    },
    {
      key: "sisa",
      header: "Sisa",
      align: "right",
      render: (row) => (
        <span
          className={cn(
            "data font-semibold",
            row.sisa > 0 ? "text-ink" : "text-ink-muted",
          )}
        >
          {formatRupiah(row.sisa)}
        </span>
      ),
      sortValue: (row) => row.sisa,
    },
    {
      key: "status",
      header: "Status",
      width: "8rem",
      render: (row) => (
        <StatusBadge variant={getStatusVariant(row.status)} label={row.status} />
      ),
      sortValue: (row) => row.status,
    },
    {
      key: "aksi",
      header: "",
      align: "right",
      width: "1%",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {row.sisa > 0 && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setForm({ jumlah: 0, alasan: "" });
                setCreditNote(row);
              }}
            >
              <StickyNote className="h-3 w-3" />
              Nota kredit
            </Button>
          )}
          <AttachmentsButton ownerType="invoice" ownerId={row.id} label={row.nomor} />
        </div>
      ),
    },
  ];

  return (
    <>
      <Panel>
        <PanelHeader
          title="Daftar tagihan"
          hint={`${(invoices.data ?? []).length} baris`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={`Nomor tagihan, ${outletLabel()}, surat jalan`}
                className="w-56"
              />
              <SegmentedControl
                value={status}
                onChange={setStatus}
                options={[
                  { value: "Belum lunas", label: "Belum lunas" },
                  { value: "Jatuh Tempo", label: "Jatuh tempo" },
                  { value: "Sebagian", label: "Sebagian" },
                  { value: "Lunas", label: "Lunas" },
                  { value: "Semua", label: "Semua" },
                ]}
              />
              <CanAccess permission={PERMISSIONS.INVOICES_CREATE}>
                <Button size="sm" onClick={() => setManualInvoiceOpen(true)}>
                  <FilePlus className="h-3.5 w-3.5" />
                  Buat tagihan
                </Button>
              </CanAccess>
            </div>
          }
        />
        <DataTable
          columns={columns}
          data={invoices.data ?? []}
          isLoading={invoices.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) => spineFor(row.status)}
          pageSize={15}
          defaultSortKey="jatuhTempo"
          emptyIcon={Receipt}
          emptyMessage="Tidak ada tagihan"
          emptyDescription="Tagihan terbit otomatis saat surat jalan ditutup."
          dense
        />
      </Panel>

      <Dialog open={!!creditNote} onOpenChange={(o) => !o && setCreditNote(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nota kredit untuk {creditNote?.nomor}</DialogTitle>
            <DialogDescription>
              Mengurangi jumlah yang ditagih — untuk barang yang dikembalikan atau
              koreksi penagihan. Tercatat sebagai retur penjualan, bukan pengurangan
              omzet kotor.
            </DialogDescription>
          </DialogHeader>

          {creditNote && (
            <div className="rounded-md border border-line bg-panel-sunk px-4 py-3 text-xs">
              <div className="flex justify-between gap-4">
                <span className="text-ink-muted">Sisa tagihan</span>
                <span className="data font-semibold text-ink">
                  {formatRupiah(creditNote.sisa)}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <Field label="Nilai nota kredit" htmlFor="nk-jumlah" required>
              <TextInput
                id="nk-jumlah"
                type="number"
                mono
                min={1}
                max={creditNote?.sisa}
                value={form.jumlah}
                onChange={(e) => setForm({ ...form, jumlah: Number(e.target.value) })}
              />
            </Field>
            <Field label="Alasan" htmlFor="nk-alasan" required>
              <TextareaInput
                id="nk-alasan"
                rows={3}
                value={form.alasan}
                onChange={(e) => setForm({ ...form, alasan: e.target.value })}
                placeholder={`Contoh: 5 ${unitLabel()} dikembalikan karena segel rusak.`}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditNote(null)}>
              Batal
            </Button>
            <Button
              disabled={
                form.jumlah <= 0 || !form.alasan.trim() || mutation.isPending
              }
              onClick={() => mutation.mutate(undefined as never)}
            >
              Terbitkan nota kredit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ManualInvoiceDialog
        open={manualInvoiceOpen}
        onClose={() => setManualInvoiceOpen(false)}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: [...scopeKey(), "invoices"] })}
      />
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "pine" | "rust";
}) {
  const spine = { pine: "spine text-pine", rust: "spine text-rust" };
  return (
    <div className={cn("rounded-md border border-line bg-panel p-4", tone && spine[tone])}>
      <p className="label text-2xs text-ink-muted">{label}</p>
      <p className="data mt-1.5 truncate text-figure font-semibold text-ink">{value}</p>
      {hint && <p className="mt-2 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
