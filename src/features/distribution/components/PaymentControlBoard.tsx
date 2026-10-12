import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock3, Wallet } from "lucide-react";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { Field, SelectInput, TextInput } from "@/components/common/Field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getPaymentBoard } from "@/features/distribution/api/distributionApi";
import {
  fundDistributionStop,
  getOutletReceipts,
  releaseDistributionStop,
} from "@/features/finance/api/financeApi";
import { useAuthStore } from "@/features/auth/store/authStore";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { scopeKey } from "@/lib/scope";
import { formatNumber, formatRupiah, formatRupiahShort } from "@/lib/format";
import { cn } from "@/lib/utils";

/** One outlet's stop for one plan, on the date the board is showing --
 *  everything Alokasikan/Lepas needs that a board row already carries. */
interface StopTarget {
  outletId: string;
  outletCode: string;
  outletName: string;
  distributionOrderId: string;
  fundingPaymentId?: string;
  hasUnpricedLine: boolean;
}

function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const stateLabel = {
  paid: "Terverifikasi",
  partial: "Sebagian",
  unpaid: "Belum bayar",
  credit: "Kredit disetujui",
} as const;

export function PaymentControlBoard() {
  const [date, setDate] = useState(today);
  const [funding, setFunding] = useState<StopTarget | null>(null);
  const canSeePayments = useAuthStore((state) => state.hasPermission(PERMISSIONS.PAYMENTS_VIEW));
  // The route this hangs off requires BOTH finance.create.payment_allocations
  // AND distribution.update.distribution_orders (see fortius-backend's
  // routes.go) -- funding a stop writes payment state and releases a
  // distribution slot, and neither permission alone carries both authorities.
  // DISTRIBUTION_EDIT is the frontend constant for the second; the first has
  // none yet, matching PaymentPage's own "Alokasikan" button, which is
  // likewise ungated in the console and left to the backend to refuse.
  const canEditDistribution = useAuthStore((state) => state.hasPermission(PERMISSIONS.DISTRIBUTION_EDIT));
  const canFund = canSeePayments && canEditDistribution;

  const releaseMutation = useDeskMutation({
    mutationFn: (input: { paymentId: string; distributionOrderId: string; outletId: string }) =>
      releaseDistributionStop(input),
    errorTitle: "Gagal melepas dana",
    success: (result) => ({
      title: "Dana dilepas",
      description: `${formatRupiahShort(result.availableBalance)} tersedia kembali pada penerimaan ini.`,
      tone: "warning",
    }),
  });

  const board = useQuery({
    queryKey: [...scopeKey(), "distribution-payment-board", date],
    queryFn: () => getPaymentBoard(date),
    enabled: canSeePayments && /^\d{4}-\d{2}-\d{2}$/.test(date),
  });

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="Verifikasi pembayaran sebelum berangkat" hint="Hanya pembayaran terverifikasi yang dihitung sebagai dana tersedia" />
        <PanelBody className="space-y-4">
          <div className="max-w-xs">
            <Field label="Tanggal pengiriman">
              <TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
          </div>
          {!canSeePayments ? (
            <p className="text-sm text-ink-muted">Status pembayaran memerlukan izin membaca penerimaan kas.</p>
          ) : board.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : board.isError ? (
            <p className="text-sm text-danger">Verifikasi pembayaran tidak dapat dimuat: {board.error.message}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  ["Direncanakan", board.data?.summary.planned ?? 0],
                  ["Terverifikasi", board.data?.summary.funded ?? 0],
                  ["Belum dialokasikan", board.data?.summary.unpaid ?? 0],
                  ["Terkirim", board.data?.summary.delivered ?? 0],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg border border-line bg-panel-sunk px-4 py-3">
                    <p className="text-xs text-ink-muted">{label}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(Number(value))}</p>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[920px] text-sm">
                  <thead className="border-b border-line bg-panel-sunk text-xs text-ink-muted">
                    <tr>
                      <th className="px-4 py-2 text-left">Pangkalan</th>
                      <th className="px-4 py-2 text-right">Rencana</th>
                      <th className="px-4 py-2 text-right">Terverifikasi</th>
                      <th className="px-4 py-2 text-right">Belum dialokasikan</th>
                      <th className="px-4 py-2 text-right">Kredit</th>
                      <th className="px-4 py-2 text-right">Terkirim</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.data?.rows.map((row) => {
                      const target: StopTarget = {
                        outletId: row.outletId,
                        outletCode: row.outletCode,
                        outletName: row.outletName,
                        distributionOrderId: row.distributionOrderId,
                        fundingPaymentId: row.fundingPaymentId,
                        hasUnpricedLine: row.hasUnpricedLine,
                      };
                      const anomaly = row.planCount > 1;
                      const isFunded = !!row.fundingPaymentId;
                      return (
                        <tr key={row.outletId} className="border-b border-line last:border-0">
                          <td className="px-4 py-3">
                            <span className="block font-mono text-xs text-ink-muted">{row.outletCode}</span>
                            {row.outletName}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.plannedQty)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.fundedQty)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.unpaidQty)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.creditQty)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.deliveredQty)}</td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={row.state === "unpaid" ? "destructive" : "outline"}
                              className={cn(
                                (row.state === "paid" || row.state === "credit") && "border-success/30 bg-success/10 text-success",
                                row.state === "partial" && "border-warning/30 bg-warning/10 text-warning",
                              )}
                            >
                              {row.state === "paid" ? <CheckCircle2 className="mr-1 h-3 w-3" /> : row.hasUnverifiedPayment ? <Clock3 className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
                              {row.hasUnverifiedPayment ? "Menunggu verifikasi" : stateLabel[row.state]}
                            </Badge>
                            {row.lastPaymentAt && (
                              <span className={cn("mt-1 block text-2xs text-ink-muted", row.late && "text-rust-ink")}>
                                {row.late ? "Terlambat — " : ""}dibayar {new Date(row.lastPaymentAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                            {row.hasUnpricedLine && (
                              <span className="mt-1 block text-2xs text-warning">Harga jual belum ditetapkan</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {row.state === "credit" ? (
                              <span className="text-xs text-ink-muted">Kredit, tanpa penerimaan</span>
                            ) : !canFund ? (
                              <span className="text-xs text-ink-muted">—</span>
                            ) : anomaly ? (
                              <Button
                                size="xs"
                                variant="outline"
                                disabled
                                title="Pangkalan ini ada pada lebih dari satu rencana untuk tanggal ini — pilih rencana yang benar secara manual."
                              >
                                Alokasikan
                              </Button>
                            ) : isFunded ? (
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={releaseMutation.isPending}
                                onClick={() =>
                                  releaseMutation.mutate({
                                    paymentId: row.fundingPaymentId!,
                                    distributionOrderId: row.distributionOrderId,
                                    outletId: row.outletId,
                                  })
                                }
                              >
                                Lepas
                              </Button>
                            ) : (
                              <Button size="xs" onClick={() => setFunding(target)}>
                                <Wallet className="mr-1 h-3 w-3" />
                                Alokasikan
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </PanelBody>
      </Panel>

      <FundStopDialog target={funding} onClose={() => setFunding(null)} />
    </div>
  );
}

/**
 * Alokasikan's picker. A stop is funded from an existing, already-recorded
 * receipt -- not by recording one here -- because a receipt can arrive
 * before or after the plan, and RecordPaymentDialog on PaymentPage is
 * already the one place that creates one. This dialog answers a narrower
 * question: which already-recorded receipt covers this stop.
 */
function FundStopDialog({ target, onClose }: { target: StopTarget | null; onClose: () => void }) {
  const [paymentId, setPaymentId] = useState("");

  const receipts = useQuery({
    queryKey: [...scopeKey(), "outlet-receipts", target?.outletId],
    queryFn: () => getOutletReceipts(target!.outletId),
    enabled: !!target,
  });

  const mutation = useDeskMutation({
    mutationFn: (input: { paymentId: string; distributionOrderId: string; outletId: string }) =>
      fundDistributionStop(input),
    errorTitle: "Gagal mengalokasikan titik ini",
    success: (result) => ({
      title: "Titik dialokasikan",
      description: `Sisa penerimaan setelah ini: ${formatRupiahShort(result.availableBalance)}.`,
      tone: "success",
    }),
    onDone: () => {
      onClose();
      setPaymentId("");
    },
  });

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alokasikan penerimaan untuk {target?.outletName}</DialogTitle>
          <DialogDescription>
            Pilih penerimaan yang menutup seluruh titik ini pada rencana hari ini. Satu
            penerimaan mengalokasikan satu titik secara penuh — tidak ada alokasi sebagian.
          </DialogDescription>
        </DialogHeader>

        {target?.hasUnpricedLine && (
          <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            Salah satu produk pada titik ini belum punya harga jual yang berlaku. Alokasi
            akan ditolak sampai harga ditetapkan.
          </p>
        )}

        {receipts.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (receipts.data ?? []).length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">
            Belum ada penerimaan tercatat untuk pangkalan ini. Catat penerimaan dari halaman
            Pembayaran, lalu kembali ke sini untuk mengalokasikan titik ini.
          </p>
        ) : (
          <Field label="Penerimaan">
            <SelectInput value={paymentId} onChange={(e) => setPaymentId(e.target.value)}>
              <option value="">Pilih penerimaan…</option>
              {(receipts.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nomor} — {formatRupiah(r.jumlah)} ({r.status})
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        {/* No receipt exists yet -- the disabled "Alokasikan ke titik ini" this
            branch used to show next to Batal was a dead end: two buttons that
            read as a real choice when only one of them could ever be clicked.
            Sending the operator straight to where a receipt gets recorded,
            with the outlet already chosen, is the actual next step. */}
        {!receipts.isLoading && (receipts.data ?? []).length === 0 ? (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Tutup
            </Button>
            <Button asChild onClick={onClose}>
              <Link to={`/payments?outlet=${target?.outletId ?? ""}`}>Catat penerimaan</Link>
            </Button>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button
              disabled={!paymentId || mutation.isPending}
              onClick={() =>
                target &&
                mutation.mutate({
                  paymentId,
                  distributionOrderId: target.distributionOrderId,
                  outletId: target.outletId,
                })
              }
            >
              Alokasikan ke titik ini
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
