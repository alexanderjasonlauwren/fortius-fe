/**
 * One vendor bill: its lines, what was paid and when, what is left, its
 * evidence and its journals -- with pay, void a payment and void the bill
 * in one place (accounting parity P3).
 */
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, CircleDollarSign, FileText, Undo2 } from "lucide-react";
import { getPurchase, voidPurchase, voidPurchasePayment } from "@/features/purchases/api/purchaseApi";
import type { PurchasePaymentView } from "@/features/purchases/api/contract";
import { PayBillDialog } from "@/features/purchases/components/PayBillDialog";
import { isOverdue, PURCHASE_STATUS_LABEL, purchaseStatusVariant } from "@/features/purchases/lib/status";
import { getActivity } from "@/features/finance/api/activityApi";
import { DocumentActivityPanel } from "@/features/finance/components/DocumentActivityPanel";
import { AttachmentsPanel } from "@/features/attachments/components/AttachmentsPanel";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ReasonDialog } from "@/components/common/ReasonDialog";
import { Button } from "@/components/ui/button";
import { formatDateId, formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

export function PurchaseDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState(false);
  const [voidingBill, setVoidingBill] = useState(false);
  const [voidingPayment, setVoidingPayment] = useState<PurchasePaymentView | null>(null);

  const bill = useQuery({ queryKey: [...scopeKey(), "purchase", id], queryFn: () => getPurchase(id), enabled: !!id });
  const activity = useQuery({ queryKey: [...scopeKey(), "activity", "purchase", id], queryFn: () => getActivity("purchase", id), enabled: !!id });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [...scopeKey(), "purchase", id] });
    void queryClient.invalidateQueries({ queryKey: [...scopeKey(), "activity", "purchase", id] });
    void queryClient.invalidateQueries({ queryKey: [...scopeKey(), "purchases"] });
  };

  const voidBill = useDeskMutation({
    mutationFn: (reason: string) => voidPurchase(id, bill.data!.version, reason),
    success: (row) => ({ title: `${row.purchaseNumber} dibatalkan`, description: "Jurnalnya sudah dibalik." }),
    errorTitle: "Tagihan tidak dapat dibatalkan",
    onDone: () => { setVoidingBill(false); refresh(); },
  });
  const voidPayment = useDeskMutation({
    mutationFn: (reason: string) => voidPurchasePayment(id, voidingPayment!.id, voidingPayment!.version, reason),
    success: () => ({ title: `${voidingPayment?.number} dibatalkan`, description: "Tagihan kembali terhutang sebesar pembayaran itu." }),
    errorTitle: "Pembayaran tidak dapat dibatalkan",
    onDone: () => { setVoidingPayment(null); refresh(); },
  });

  if (bill.isLoading) return <Skeleton className="h-96 w-full" />;
  const b = bill.data;
  if (!b) {
    return (
      <EmptyState icon={FileText} title="Tagihan tidak ditemukan"
        action={<Button asChild variant="outline"><Link to="/purchases">Kembali ke pembelian</Link></Button>} />
    );
  }
  const owed = b.paymentStatus === "unpaid" || b.paymentStatus === "partial";
  const livePayments = b.payments.filter((p) => p.status === "posted");
  const voidable = b.paymentStatus !== "void" && !b.scheduleAgreementId && livePayments.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Pembelian"
        title={b.purchaseNumber}
        description={`${b.scheduleAgreementId ? "Penebusan SA" : "Tagihan vendor"} · ${b.supplierName ?? "—"}`}
        meta={
          <Link to="/purchases" className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Daftar pembelian
          </Link>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {owed && (
              <CanAccess permission={PERMISSIONS.PURCHASES_VERIFY}>
                <Button size="sm" onClick={() => setPaying(true)}>
                  <CircleDollarSign className="h-3.5 w-3.5" /> Bayar
                </Button>
              </CanAccess>
            )}
            {voidable && (
              <CanAccess permission={PERMISSIONS.PURCHASES_VOID}>
                <Button size="sm" variant="ghost" className="text-rust-ink" onClick={() => setVoidingBill(true)}>
                  <Ban className="h-3.5 w-3.5" /> Batalkan
                </Button>
              </CanAccess>
            )}
          </div>
        }
      />

      {b.paymentStatus === "void" && (
        <Panel spine="text-rust">
          <PanelBody className="text-sm">
            <span className="font-semibold text-ink">Tagihan ini dibatalkan.</span>{" "}
            <span className="text-ink-muted">{b.voidReason} Jurnalnya sudah dibalik.</span>
          </PanelBody>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Panel>
            <PanelHeader title="Rincian tagihan" actions={<StatusBadge label={PURCHASE_STATUS_LABEL[b.paymentStatus]} variant={purchaseStatusVariant(b)} />} />
            <PanelBody className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <Meta label="Tanggal" value={formatDateId(b.redeemedAt)} />
                <Meta label="Jatuh tempo" value={formatDateId(b.dueDate)} danger={isOverdue(b)} />
                <Meta label="No. tagihan vendor" value={b.vendorInvoiceNumber ?? "—"} mono />
                <Meta label="Vendor" value={b.supplierName ?? "—"} />
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
                    {b.lines.map((l, i) => (
                      <tr key={i} className="border-b border-line">
                        <td className="py-2 text-sm text-ink">
                          {l.kind === "account" ? (
                            <>
                              {l.description}
                              <span className="data block text-2xs text-ink-muted">{l.accountCode} {l.accountName}</span>
                            </>
                          ) : (l.productName ?? "—")}
                        </td>
                        <td className="data py-2 text-right text-sm text-ink">{l.quantity}</td>
                        <td className="data py-2 text-right text-sm text-ink">{formatRupiah(l.unitCost)}</td>
                        <td className="data py-2 text-right text-sm text-ink">{formatRupiah(l.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
                <Row label="Total" value={b.totalAmount} strong />
                {b.amountPaid > 0 && <Row label="Dibayar" value={-b.amountPaid} />}
                <Row label="Sisa" value={b.paymentStatus === "void" ? 0 : b.outstanding} strong />
              </dl>
              {b.notes && <p className="text-sm text-ink-muted">{b.notes}</p>}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Pembayaran" hint="Setiap pembayaran dicatat sendiri dan dapat dibatalkan sendiri" />
            <PanelBody>
              {b.payments.length === 0 ? (
                <p className="text-xs text-ink-muted">Belum ada pembayaran.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {b.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span>
                        <span className={p.status === "void" ? "data text-ink-muted line-through" : "data text-ink"}>{p.number}</span>
                        <span className="block text-2xs text-ink-muted">
                          {formatDateId(p.paidOn)}{p.bankReference ? ` · ${p.bankReference}` : ""}
                          {p.status === "void" ? ` · dibatalkan: ${p.voidReason ?? ""}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="data whitespace-nowrap text-ink">{formatRupiah(p.amount)}</span>
                        {p.status === "posted" && (
                          <CanAccess permission={PERMISSIONS.PURCHASES_VOID}>
                            <Button variant="ghost" size="icon-xs" aria-label={`Batalkan ${p.number}`}
                              className="hover:bg-rust-soft hover:text-rust-ink" onClick={() => setVoidingPayment(p)}>
                              <Undo2 className="h-3.5 w-3.5" />
                            </Button>
                          </CanAccess>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </PanelBody>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <PanelBody>
              <AttachmentsPanel ownerType="purchase" ownerId={b.id} />
            </PanelBody>
          </Panel>
          <DocumentActivityPanel activity={activity.data} isLoading={activity.isLoading} />
        </div>
      </div>

      <PayBillDialog bill={paying ? b : null} onClose={() => setPaying(false)} onPaid={refresh} />
      <ReasonDialog
        open={voidingBill}
        title={`Batalkan ${b.purchaseNumber}?`}
        description="Jurnal tagihan ini dibalik pada tanggal aslinya dan hutangnya hilang. Tidak dapat diurungkan."
        confirmLabel="Batalkan tagihan"
        placeholder="Contoh: tagihan ganda dari vendor."
        pending={voidBill.isPending}
        onConfirm={(reason) => voidBill.mutate(reason)}
        onClose={() => setVoidingBill(false)}
      />
      <ReasonDialog
        open={!!voidingPayment}
        title={`Batalkan ${voidingPayment?.number}?`}
        description="Jurnal pembayaran ini dibalik dan tagihan kembali terhutang sebesar pembayaran itu."
        confirmLabel="Batalkan pembayaran"
        placeholder="Contoh: transfer gagal, dana kembali."
        pending={voidPayment.isPending}
        onConfirm={(reason) => voidPayment.mutate(reason)}
        onClose={() => setVoidingPayment(null)}
      />
    </div>
  );
}

function Meta({ label, value, mono, danger }: { label: string; value: string; mono?: boolean; danger?: boolean }) {
  return (
    <div>
      <dt className="label text-2xs text-ink-muted">{label}</dt>
      <dd className={[mono ? "data" : "", danger ? "font-semibold text-rust-ink" : "text-ink", "mt-0.5"].join(" ")}>{value}</dd>
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
