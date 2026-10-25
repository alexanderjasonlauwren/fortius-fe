import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, FilePlus2, FileText, Printer, ReceiptText } from "lucide-react";
import {
  createInvoice,
  getClaims,
  getInvoiceDraft,
  listInvoices,
  type ClaimView,
  type TransportInvoice,
} from "@/features/transportation/api/transportationApi";
import { CLAIM_STATUS_LABEL } from "@/features/transportation/api/contract";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant } from "@/lib/status";
import { Field, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/common/ActionTooltip";
import { formatDateId, formatRupiah } from "@/lib/format";
import { printDocument } from "@/lib/export";
import { invoiceHtml } from "@/features/transportation/lib/invoiceHtml";
import { terbilang } from "@/lib/terbilang";

/** "September 2026" from a claim's period_start. */
function periodLabel(periodStart?: string): string {
  if (!periodStart) return "—";
  return new Date(`${periodStart}T00:00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

function printInvoice(invoice: TransportInvoice) {
  printDocument(`Invoice ${invoice.invoiceNumber}`, invoiceHtml(invoice));
}

interface FormState {
  claimId: string;
  invoiceNumber: string;
  invoiceDate: string;
  recipientName: string;
  recipientAddress: string;
  orderReference: string;
  orderDate: string;
  taxInvoiceNumber: string;
  taxInvoiceDate: string;
  description: string;
  vatAmount: string;
  bankAccountId: string;
  place: string;
}

function formFrom(draft: TransportInvoice, defaultBankId?: string): FormState {
  return {
    claimId: draft.claimId,
    invoiceNumber: draft.invoiceNumber,
    invoiceDate: draft.invoiceDate,
    recipientName: draft.recipientName,
    recipientAddress: draft.recipientAddress ?? "",
    orderReference: draft.orderReference ?? "",
    orderDate: draft.orderDate ?? "",
    taxInvoiceNumber: draft.taxInvoiceNumber ?? "",
    taxInvoiceDate: draft.taxInvoiceDate ?? "",
    description: draft.description,
    vatAmount: String(draft.vatAmount ?? 0),
    bankAccountId: draft.bank?.id ?? defaultBankId ?? "",
    place: draft.place ?? "",
  };
}

export function TransportInvoicePage() {
  const [creatingFor, setCreatingFor] = useState<ClaimView | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const invoices = useQuery({
    queryKey: [...scopeKey(), "transport-invoices"],
    queryFn: listInvoices,
  });
  // Tahap 2 starts once Pertamina accepts the BAST; a claim already paid
  // without an invoice can still get one.
  const claims = useQuery({
    queryKey: [...scopeKey(), "transportation-claims", "invoiceable"],
    queryFn: async () => {
      const [approved, paid] = await Promise.all([
        getClaims({ claimStatus: "approved" }),
        getClaims({ claimStatus: "paid" }),
      ]);
      return [...approved, ...paid];
    },
  });
  const banks = useQuery({ queryKey: [...scopeKey(), "bank-accounts"], queryFn: getBankAccounts });

  const invoiced = new Set((invoices.data ?? []).map((i) => i.claimId));
  const awaiting = (claims.data ?? []).filter((c) => !invoiced.has(c.id) && c.claimedAmount > 0);
  const bankOptions = (banks.data ?? []).filter((b) => b.aktif && b.kind !== "cash");
  const defaultBankId = bankOptions.find((b) => b.utama)?.id ?? bankOptions[0]?.id;

  const draft = useQuery({
    queryKey: [...scopeKey(), "transport-invoice-draft", creatingFor?.id],
    queryFn: () => getInvoiceDraft(creatingFor!.id),
    enabled: !!creatingFor,
    staleTime: 0,
    gcTime: 0,
  });
  // The form is seeded from the draft once it arrives, then belongs to the user.
  const values = form ?? (draft.data && creatingFor ? formFrom(draft.data, defaultBankId) : null);

  const close = () => {
    setCreatingFor(null);
    setForm(null);
  };

  const createMutation = useDeskMutation({
    mutationFn: (v: FormState) =>
      createInvoice({
        claimId: v.claimId,
        invoiceNumber: v.invoiceNumber,
        invoiceDate: v.invoiceDate,
        recipientName: v.recipientName,
        recipientAddress: v.recipientAddress,
        orderReference: v.orderReference,
        orderDate: v.orderDate,
        taxInvoiceNumber: v.taxInvoiceNumber,
        taxInvoiceDate: v.taxInvoiceDate,
        description: v.description,
        vatAmount: Number(v.vatAmount) || 0,
        bankAccountId: v.bankAccountId || undefined,
        place: v.place,
      }),
    errorTitle: "Invoice tidak tersimpan",
    success: (inv) => ({ title: `Invoice ${inv.invoiceNumber} dibuat senilai ${formatRupiah(inv.total)}` }),
    onDone: (inv) => {
      close();
      printInvoice(inv);
    },
  });

  const set = (key: keyof FormState) => (value: string) => values && setForm({ ...values, [key]: value });
  const amount = draft.data?.amount ?? 0;
  const vat = Number(values?.vatAmount) || 0;

  const awaitingColumns: Column<ClaimView>[] = [
    {
      key: "claim",
      header: "Klaim BAST",
      render: (row) => <span className="data text-xs font-semibold text-ink">{row.claimNumber}</span>,
      sortValue: (row) => row.claimNumber,
    },
    {
      key: "periode",
      header: "Periode",
      render: (row) => <span className="text-xs text-ink">{periodLabel(row.periodStart)}</span>,
      sortValue: (row) => row.periodStart ?? "",
    },
    {
      key: "nilai",
      header: "Nilai BA LO",
      align: "right",
      render: (row) => <span className="data text-xs text-ink">{formatRupiah(row.claimedAmount)}</span>,
      sortValue: (row) => row.claimedAmount,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          variant={getStatusVariant(CLAIM_STATUS_LABEL[row.claimStatus])}
          label={CLAIM_STATUS_LABEL[row.claimStatus]}
        />
      ),
    },
    {
      key: "aksi",
      header: "",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <ActionTooltip label="Lihat Berita Acara / BA LO klaim ini">
            <Button variant="ghost" size="icon-xs" asChild aria-label={`Lihat BA ${row.claimNumber}`}>
              <Link to={`/transportation-claims/${row.id}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </ActionTooltip>
          <CanAccess permission={PERMISSIONS.TRANSPORTATION_CLAIMS_EDIT}>
            <ActionTooltip label="Buat invoice senilai BA LO, terisi dari invoice sebelumnya">
              <Button size="xs" onClick={() => setCreatingFor(row)}>
                <FilePlus2 className="h-3.5 w-3.5" />
                Buat invoice
              </Button>
            </ActionTooltip>
          </CanAccess>
        </div>
      ),
    },
  ];

  const invoiceColumns: Column<TransportInvoice>[] = [
    {
      key: "nomor",
      header: "No. invoice",
      render: (row) => <span className="data text-xs font-semibold text-ink">{row.invoiceNumber}</span>,
      sortValue: (row) => row.invoiceNumber,
    },
    {
      key: "tanggal",
      header: "Tanggal",
      render: (row) => <span className="data text-xs text-ink">{formatDateId(row.invoiceDate)}</span>,
      sortValue: (row) => row.invoiceDate,
    },
    {
      key: "uraian",
      header: "Uraian",
      render: (row) => (
        <div className="flex flex-col">
          <span className="text-xs text-ink">{row.description}</span>
          <span className="data text-2xs text-ink-muted">{row.claimNumber}</span>
        </div>
      ),
    },
    {
      key: "faktur",
      header: "No. faktur",
      render: (row) => <span className="data text-xs text-ink-muted">{row.taxInvoiceNumber ?? "—"}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (row) => <span className="data text-xs text-ink">{formatRupiah(row.total)}</span>,
      sortValue: (row) => row.total,
    },
    {
      key: "aksi",
      header: "",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <ActionTooltip label="Lihat Berita Acara / BA LO yang ditagih invoice ini">
            <Button variant="ghost" size="icon-xs" asChild aria-label={`Lihat BA ${row.claimNumber}`}>
              <Link to={`/transportation-claims/${row.claimId}`}>
                <Eye className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </ActionTooltip>
          <ActionTooltip label="Cetak ulang invoice ini">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Cetak invoice ${row.invoiceNumber}`}
              onClick={() => printInvoice(row)}
            >
              <Printer className="h-3.5 w-3.5" />
            </Button>
          </ActionTooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan · Transaksi"
        title="Invoice Transport Fee"
        description="Tahap 2: setelah BAST disetujui Pertamina, buat invoice senilai BA LO. Unggah bersama e-Faktur, NPWP, SKT dan PKBP."
        meta={
          <span className="text-xs text-ink-muted">
            <span className="data">{awaiting.length}</span> menunggu invoice ·{" "}
            <span className="data">{invoices.data?.length ?? 0}</span> terbit
          </span>
        }
      />

      <Panel>
        <PanelHeader title="BAST disetujui, belum ada invoice" hint={`${awaiting.length} klaim`} />
        <DataTable
          columns={awaitingColumns}
          data={awaiting}
          isLoading={claims.isLoading || invoices.isLoading}
          rowKey={(row) => row.id}
          pageSize={8}
          defaultSortKey="periode"
          emptyIcon={FileText}
          emptyMessage="Tidak ada BAST yang menunggu invoice"
          emptyDescription="Klaim muncul di sini setelah statusnya Disetujui di Klaim Transportasi."
          dense
        />
      </Panel>

      <Panel>
        <PanelHeader title="Invoice terbit" hint={`${invoices.data?.length ?? 0} invoice`} />
        <DataTable
          columns={invoiceColumns}
          data={invoices.data ?? []}
          isLoading={invoices.isLoading}
          rowKey={(row) => row.id ?? row.claimId}
          pageSize={12}
          defaultSortKey="tanggal"
          emptyIcon={ReceiptText}
          emptyMessage="Belum ada invoice transport fee"
          dense
        />
      </Panel>

      <Dialog open={!!creatingFor} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-2xl">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (values) createMutation.mutate(values);
            }}
          >
            <DialogHeader>
              <DialogTitle>Buat invoice {creatingFor?.claimNumber}</DialogTitle>
              <DialogDescription>
                Nilai invoice adalah nilai BA LO dan tidak dapat diubah. Nomor, penerima, order dan rekening diisi dari invoice sebelumnya. Periksa lalu simpan.
              </DialogDescription>
            </DialogHeader>

            {draft.isError ? (
              <Panel spine="text-rust" className="my-4">
                <PanelBody className="text-sm text-rust-ink">{(draft.error as Error).message}</PanelBody>
              </Panel>
            ) : !values ? (
              <div className="my-4 space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <div className="my-4 grid gap-3 sm:grid-cols-2">
                <Field label="No. invoice" required>
                  <TextInput value={values.invoiceNumber} onChange={(e) => set("invoiceNumber")(e.target.value)} />
                </Field>
                <Field label="Tanggal invoice" required>
                  <TextInput type="date" value={values.invoiceDate} onChange={(e) => set("invoiceDate")(e.target.value)} />
                </Field>
                <Field label="Kepada" required className="sm:col-span-2">
                  <TextInput value={values.recipientName} onChange={(e) => set("recipientName")(e.target.value)} />
                </Field>
                <Field label="Alamat" className="sm:col-span-2">
                  <TextareaInput
                    rows={2}
                    value={values.recipientAddress}
                    onChange={(e) => set("recipientAddress")(e.target.value)}
                  />
                </Field>
                <Field label="No. PO / No. SPB">
                  <TextInput value={values.orderReference} onChange={(e) => set("orderReference")(e.target.value)} />
                </Field>
                <Field label="Tanggal PO / SPB">
                  <TextInput type="date" value={values.orderDate} onChange={(e) => set("orderDate")(e.target.value)} />
                </Field>
                <Field label="No. faktur pajak" hint="Nomor seri e-Faktur">
                  <TextInput
                    value={values.taxInvoiceNumber}
                    onChange={(e) => set("taxInvoiceNumber")(e.target.value)}
                    placeholder="08002600419112271"
                  />
                </Field>
                <Field label="Tanggal faktur">
                  <TextInput
                    type="date"
                    value={values.taxInvoiceDate}
                    onChange={(e) => set("taxInvoiceDate")(e.target.value)}
                  />
                </Field>
                <Field label="Uraian" required className="sm:col-span-2">
                  <TextInput value={values.description} onChange={(e) => set("description")(e.target.value)} />
                </Field>
                <Field label="PPN 12% (Rp)" hint="0 bila PPN dibebaskan (faktur kode 08)">
                  <TextInput
                    type="number"
                    min={0}
                    value={values.vatAmount}
                    onChange={(e) => set("vatAmount")(e.target.value)}
                  />
                </Field>
                <Field label="Rekening pembayaran">
                  <SelectInput value={values.bankAccountId} onChange={(e) => set("bankAccountId")(e.target.value)}>
                    <option value="">— tanpa rekening —</option>
                    {bankOptions.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank} {b.nomorRekening} · {b.atasNama}
                      </option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Tempat tanda tangan">
                  <TextInput value={values.place} onChange={(e) => set("place")(e.target.value)} />
                </Field>
                <div className="rounded-md border border-line bg-panel-sunk p-3 sm:col-span-2">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-ink-muted">Transport fee (BA LO)</span>
                    <span className="data text-ink">{formatRupiah(amount)}</span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-ink-muted">PPN</span>
                    <span className="data text-ink">{formatRupiah(vat)}</span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between border-t border-line pt-1 text-sm font-semibold">
                    <span className="text-ink">Total</span>
                    <span className="data text-ink">{formatRupiah(amount + vat)}</span>
                  </div>
                  <p className="mt-1 text-2xs uppercase text-ink-muted">{terbilang(amount + vat)}</p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>
                Batal
              </Button>
              <Button type="submit" disabled={!values || createMutation.isPending}>
                <Printer className="h-3.5 w-3.5" />
                Simpan &amp; cetak
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
