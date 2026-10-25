/**
 * One invoice: what it bills, what has been applied against it, the
 * journals it posted, and its evidence -- with everything a bookkeeper
 * does next (receive payment, credit note, void, print) in one place.
 * Accounting parity P3.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, FileText, Printer, Wallet, StickyNote } from "lucide-react";
import { getInvoice } from "@/features/finance/api/financeApi";
import { getActivity } from "@/features/finance/api/activityApi";
import { CreditNoteDialog } from "@/features/finance/components/CreditNoteDialog";
import { RequestVoidDialog } from "@/features/approvals/components/RequestVoidDialog";
import { DocumentActivityPanel } from "@/features/finance/components/DocumentActivityPanel";
import { printInvoice } from "@/features/finance/lib/printInvoice";
import { AttachmentsPanel } from "@/features/attachments/components/AttachmentsPanel";
import { useScope } from "@/features/tenancy/useScope";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { getStatusVariant } from "@/lib/status";
import { formatDateId, formatRupiah } from "@/lib/format";
import { outletLabel } from "@/lib/lexicon";
import { scopeKey } from "@/lib/scope";

const TYPE_LABEL = { delivery: "Pengiriman", registration: "Pendaftaran pangkalan", other: "Lain-lain" } as const;

export function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const { tenant } = useScope();
  const queryClient = useQueryClient();
  const [creditOpen, setCreditOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);

  const invoice = useQuery({ queryKey: [...scopeKey(), "invoice", id], queryFn: () => getInvoice(id), enabled: !!id });
  const activity = useQuery({ queryKey: [...scopeKey(), "activity", "invoice", id], queryFn: () => getActivity("invoice", id), enabled: !!id });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [...scopeKey(), "invoice", id] });
    void queryClient.invalidateQueries({ queryKey: [...scopeKey(), "activity", "invoice", id] });
    void queryClient.invalidateQueries({ queryKey: [...scopeKey(), "invoices"] });
  };

  if (invoice.isLoading) return <Skeleton className="h-96 w-full" />;
  const inv = invoice.data;
  if (!inv) {
    return (
      <EmptyState icon={FileText} title="Tagihan tidak ditemukan"
        description="Mungkin sudah tidak dapat diakses dari cabang ini."
        action={<Button asChild variant="outline"><Link to="/receivables">Kembali ke piutang</Link></Button>} />
    );
  }
  const open = inv.status !== "Batal" && inv.sisa > 0;
  // The backend is the judge (and says why); this only stops offering a
  // void it would refuse -- anything live applied against the invoice.
  const hasSettlement = (activity.data?.penyelesaian ?? []).some(
    (s) => !(s.jenis === "credit_note" && s.status === "cancelled"),
  );
  const voidable = inv.invoiceType !== "delivery" && inv.status !== "Batal" && !hasSettlement;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Piutang"
        title={inv.nomor}
        description={`${TYPE_LABEL[inv.invoiceType]} · ${outletLabel()} ${inv.outlet}`}
        meta={
          <Link to="/receivables" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Daftar tagihan
          </Link>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline"
              onClick={() => printInvoice(inv, { perusahaan: tenant?.nama ?? "", pelanggan: inv.outlet, alamat: inv.kecamatan })}>
              <Printer className="h-3.5 w-3.5" /> Cetak / PDF
            </Button>
            {open && (
              <CanAccess permission={PERMISSIONS.PAYMENTS_CREATE}>
                <Button size="sm" asChild>
                  <Link to={`/payments?outlet=${inv.outletId}`}><Wallet className="h-3.5 w-3.5" /> Terima pembayaran</Link>
                </Button>
              </CanAccess>
            )}
            {open && (
              <CanAccess permission={PERMISSIONS.CREDIT_NOTES_CREATE}>
                <Button size="sm" variant="outline" onClick={() => setCreditOpen(true)}>
                  <StickyNote className="h-3.5 w-3.5" /> Nota kredit
                </Button>
              </CanAccess>
            )}
            {voidable && (
              <CanAccess permissions={[PERMISSIONS.INVOICES_VOID, PERMISSIONS.VOID_REQUESTS_CREATE]} requireAll>
                <Button size="sm" variant="ghost" className="text-rust-ink" onClick={() => setVoidOpen(true)}>
                  <Ban className="h-3.5 w-3.5" /> Ajukan pembatalan
                </Button>
              </CanAccess>
            )}
          </div>
        }
      />

      {inv.status === "Batal" && (
        <Panel spine="text-rust">
          <PanelBody className="text-sm text-ink">
            <span className="font-semibold">Tagihan ini dibatalkan.</span>{" "}
            <span className="text-ink-muted">{inv.alasanBatal ?? ""} Jurnalnya sudah dibalik; tidak ada lagi piutang.</span>
          </PanelBody>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader title="Rincian tagihan" actions={<StatusBadge variant={getStatusVariant(inv.status)} label={inv.status} />} />
          <PanelBody className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
              <Meta label="Tanggal" value={formatDateId(inv.tanggal)} />
              <Meta label="Jatuh tempo" value={formatDateId(inv.jatuhTempo)} />
              <Meta label="Termin" value={`${inv.termin} hari`} />
              {inv.invoiceType === "delivery" && <Meta label="Surat jalan" value={inv.suratJalan} mono />}
              {inv.referensi && <Meta label="No. referensi" value={inv.referensi} mono />}
              <Meta label={outletLabel()} value={inv.outlet} />
            </dl>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th className="label py-2 text-2xs text-ink-muted">Uraian</th>
                    <th className="label py-2 text-right text-2xs text-ink-muted">Qty</th>
                    <th className="label py-2 text-right text-2xs text-ink-muted">Harga</th>
                    <th className="label py-2 text-right text-2xs text-ink-muted">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="py-2 text-sm text-ink">{l.uraian}</td>
                      <td className="data py-2 text-right text-sm text-ink">{l.qty}</td>
                      <td className="data py-2 text-right text-sm text-ink">{formatRupiah(l.harga)}</td>
                      <td className="data py-2 text-right text-sm text-ink">{formatRupiah(l.jumlah)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
              <Total label="Subtotal" value={inv.subtotal} />
              {inv.pajak > 0 && <Total label={`PPN ${inv.persenPajak}%`} value={inv.pajak} />}
              <Total label="Total" value={inv.total} strong />
              {inv.terbayar > 0 && <Total label="Dibayar" value={-inv.terbayar} />}
              {inv.kredit > 0 && <Total label="Nota kredit" value={-inv.kredit} />}
              <Total label="Sisa" value={inv.status === "Batal" ? 0 : inv.sisa} strong />
            </dl>
            {inv.keterangan && <p className="text-sm text-ink-muted">{inv.keterangan}</p>}
          </PanelBody>
        </Panel>

        <div className="space-y-5">
          <Panel>
            <PanelBody>
              <AttachmentsPanel ownerType="invoice" ownerId={inv.id} />
            </PanelBody>
          </Panel>
          <DocumentActivityPanel activity={activity.data} isLoading={activity.isLoading} />
        </div>
      </div>

      <CreditNoteDialog invoice={creditOpen ? inv : null} onClose={() => setCreditOpen(false)} onIssued={refresh} />
      <RequestVoidDialog
        target={voidOpen ? {
          documentType: "invoice", documentId: inv.id, version: inv.version, label: inv.nomor,
          effect: "Jurnal tagihan ini dibalik dan piutangnya hilang; tagihan tetap tercatat dengan status Batal.",
        } : null}
        onClose={() => setVoidOpen(false)}
        onRequested={refresh}
      />
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="label text-2xs text-ink-muted">{label}</dt>
      <dd className={mono ? "data mt-0.5 text-ink" : "mt-0.5 text-ink"}>{value}</dd>
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 border-t border-line pt-1.5 font-semibold" : "flex justify-between gap-4"}>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="data text-ink">{formatRupiah(value)}</dd>
    </div>
  );
}
