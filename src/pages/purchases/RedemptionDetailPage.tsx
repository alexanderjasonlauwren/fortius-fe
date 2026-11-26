/**
 * One penebusan SA: the BNI Pops transfer, its delivery lines and whether
 * each has arrived, and its PDF. Deliveries whose date has come are received
 * from here; a mistake is undone through a void request.
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, FileText, PackageCheck } from "lucide-react";
import { getRedemption, receiveDeliveries } from "@/features/saredemptions/api/saRedemptionApi";
import { AttachmentsPanel } from "@/features/attachments/components/AttachmentsPanel";
import { RequestVoidDialog } from "@/features/approvals/components/RequestVoidDialog";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { todayIso } from "@/lib/date";
import { scopeKey } from "@/lib/scope";
import { formatDateId, formatRupiah, formatNumber } from "@/lib/format";

const DELIVERY_LABEL = { scheduled: "Dijadwalkan", received: "Diterima", void: "Batal" } as const;
const DELIVERY_VARIANT = { scheduled: "warning", received: "success", void: "draft" } as const;

export function RedemptionDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [voiding, setVoiding] = useState(false);
  const query = useQuery({ queryKey: [...scopeKey(), "sa-redemption", id], queryFn: () => getRedemption(id), enabled: !!id });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [...scopeKey(), "sa-redemption", id] });
    void queryClient.invalidateQueries({ queryKey: [...scopeKey(), "sa-redemptions"] });
  };
  const receive = useDeskMutation({
    mutationFn: () => receiveDeliveries(id),
    success: (row) => ({
      title: "Barang diterima",
      description: `${formatNumber(row.receivedQuantity)} dari ${formatNumber(row.totalQuantity)} tabung sudah masuk persediaan.`,
    }),
    errorTitle: "Penerimaan gagal",
    onDone: refresh,
  });

  if (query.isLoading) return <Skeleton className="h-96 w-full" />;
  const r = query.data;
  if (!r) {
    return (
      <EmptyState icon={FileText} title="Penebusan tidak ditemukan"
        action={<Button asChild variant="outline"><Link to="/purchases?tab=penebusan">Kembali ke penebusan</Link></Button>} />
    );
  }
  const today = todayIso();
  const dueNow = r.deliveries.filter((d) => d.status === "scheduled" && d.deliveryDate <= today);
  const advanceLeft = r.deliveries.filter((d) => d.status === "scheduled").reduce((s, d) => s + d.amount, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Pembelian · Penebusan SA"
        title={r.redemptionNumber}
        description={`SA ${r.saNumber} · ref ${r.transactionReference}`}
        meta={
          <Link to="/purchases?tab=penebusan" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Daftar penebusan
          </Link>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {r.status === "posted" && dueNow.length > 0 && (
              <CanAccess permission={PERMISSIONS.PURCHASES_CREATE}>
                <Button size="sm" onClick={() => receive.mutate(undefined as never)} disabled={receive.isPending}>
                  <PackageCheck className="h-3.5 w-3.5" /> Terima yang sudah datang ({dueNow.length})
                </Button>
              </CanAccess>
            )}
            {r.status === "posted" && (
              <CanAccess permissions={[PERMISSIONS.PURCHASES_VOID, PERMISSIONS.VOID_REQUESTS_CREATE]} requireAll>
                <Button size="sm" variant="ghost" className="text-rust-ink" onClick={() => setVoiding(true)}>
                  <Ban className="h-3.5 w-3.5" /> Ajukan pembatalan
                </Button>
              </CanAccess>
            )}
          </div>
        }
      />

      {r.status === "void" && (
        <Panel spine="text-rust">
          <PanelBody className="text-sm">
            <span className="font-semibold text-ink">Penebusan ini dibatalkan.</span>{" "}
            <span className="text-ink-muted">{r.voidReason} Jurnal dan persediaannya sudah dibalik.</span>
          </PanelBody>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Panel>
            <PanelHeader title="Transfer" hint="Dr Uang Muka Pembelian / Cr rekening, pada tanggal bayar" />
            <PanelBody className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <Meta label="Dibayar" value={formatDateId(r.paidOn)} />
                <Meta label="Rekening" value={r.bankAccountName ?? "Rekening utama"} />
                <Meta label="Depot" value={r.depot ?? "—"} />
                <Meta label="Tabung" value={`${formatNumber(r.receivedQuantity)} / ${formatNumber(r.totalQuantity)}`} mono />
              </dl>
              <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
                {r.netPrice !== undefined && <Row label="Net Price" value={r.netPrice} />}
                {r.ppn !== undefined && <Row label="PPn" value={r.ppn} />}
                {!!r.pbbkb && <Row label="PBBKB" value={r.pbbkb} />}
                {r.pph !== undefined && <Row label="PPh" value={r.pph} />}
                <Row label="Total debit" value={r.totalDebit} strong />
                {r.status === "posted" && <Row label="Masih di Uang Muka" value={advanceLeft} />}
              </dl>
              {r.notes && <p className="text-sm text-ink-muted">{r.notes}</p>}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Pengiriman" hint="Dr Persediaan / Cr Uang Muka Pembelian, pada tanggal kirim" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left">
                <thead>
                  <tr className="border-b border-line bg-panel-sunk">
                    <th className="label px-5 py-2 text-2xs text-ink-muted">Tanggal kirim</th>
                    <th className="label px-3 py-2 text-2xs text-ink-muted">Keterangan</th>
                    <th className="label px-3 py-2 text-right text-2xs text-ink-muted">Tabung</th>
                    <th className="label px-3 py-2 text-right text-2xs text-ink-muted">Nilai</th>
                    <th className="label px-5 py-2 text-2xs text-ink-muted">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {r.deliveries.map((d) => (
                    <tr key={d.id} className="border-b border-line">
                      <td className="data px-5 py-2 text-xs">{formatDateId(d.deliveryDate)}</td>
                      <td className="px-3 py-2 text-sm text-ink">{d.description ?? d.productName}</td>
                      <td className="data px-3 py-2 text-right text-sm">{formatNumber(d.quantity)}</td>
                      <td className="data px-3 py-2 text-right text-sm">{formatRupiah(d.amount)}</td>
                      <td className="px-5 py-2"><StatusBadge label={DELIVERY_LABEL[d.status]} variant={DELIVERY_VARIANT[d.status]} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <PanelHeader title="PDF BNI Pops" />
            <PanelBody>
              <AttachmentsPanel ownerType="sa_redemption" ownerId={r.id} />
            </PanelBody>
          </Panel>
        </div>
      </div>

      <RequestVoidDialog
        target={voiding ? {
          documentType: "sa_redemption", documentId: r.id, version: r.version, label: r.redemptionNumber,
          effect: "Jurnal pembayaran dan setiap penerimaan dibalik, dan tabungnya keluar dari persediaan.",
        } : null}
        onClose={() => setVoiding(false)}
        onRequested={refresh}
      />
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="label text-2xs text-ink-muted">{label}</dt>
      <dd className={[mono ? "data" : "", "mt-0.5 text-ink"].join(" ")}>{value}</dd>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-4 border-t border-line pt-1.5 font-semibold" : "flex justify-between gap-4"}>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="data text-ink">{formatRupiah(value)}</dd>
    </div>
  );
}
