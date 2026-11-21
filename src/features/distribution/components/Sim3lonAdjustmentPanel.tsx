import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateLong, formatNumber } from "@/lib/format";
import { adjustmentAction, type Sim3lonAdjustment } from "../api/sim3lonAdjustment.contract";
import type { DistributionPlan } from "../types";

/**
 * What SIM3LON moved on a day whose plan has left draft, and the one button
 * that acts on it. Sits above the plan, like the SIM3LON source status.
 *
 * The guide is part of the panel rather than a help page: the manager meets
 * this in the morning with a truck waiting, and the three steps after the
 * button are the part people forget.
 */
export function Sim3lonAdjustmentPanel({
  plan,
  adjustment,
  isLoading,
  error,
  isApplying,
  onApply,
  onOpenPlan,
}: {
  plan: DistributionPlan;
  adjustment?: Sim3lonAdjustment;
  isLoading: boolean;
  error?: Error | null;
  isApplying: boolean;
  onApply: (adjustment: Sim3lonAdjustment) => void;
  onOpenPlan: (planId: string) => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const links = <PlanLinks plan={plan} onOpenPlan={onOpenPlan} />;

  if (error) {
    return (
      <section aria-label="Perbandingan dengan SIM3LON" className="rounded-lg border border-line bg-panel p-4 text-sm">
        {links}
        <p role="alert" className="text-rust-ink">
          Perbandingan dengan SIM3LON gagal dimuat: {error.message}
        </p>
      </section>
    );
  }
  if (isLoading || !adjustment) {
    return plan.topupOf || plan.topups.length > 0 ? (
      <section aria-label="Rencana tambahan" className="rounded-lg border border-line bg-panel p-4 text-sm">
        {links}
      </section>
    ) : null;
  }

  const actionable = adjustment.state === "adjustable";
  const overOnly = adjustment.state === "over_only";
  if (!actionable && !overOnly) {
    if (!plan.topupOf && plan.topups.length === 0) return null;
    return (
      <section aria-label="Perbandingan dengan SIM3LON" className="rounded-lg border border-line bg-panel p-4 text-sm text-ink-muted">
        {links}
        <p role="status">
          {adjustment.state === "in_sync"
            ? `Sama dengan SIM3LON: ${formatNumber(adjustment.sim3lon)} tabung untuk ${formatDateLong(adjustment.tanggal)}.`
            : adjustment.message}
        </p>
      </section>
    );
  }

  const action = adjustmentAction(adjustment);
  return (
    <section
      aria-label="SIM3LON berubah"
      className="rounded-lg border border-signal/40 bg-signal-soft/40 p-4 text-sm text-ink"
    >
      {links}
      <p className="label text-xs text-signal-ink">SIM3LON berubah setelah rencana dikonfirmasi</p>
      <p className="mt-1">
        SIM3LON kini mencatat <span className="data">{formatNumber(adjustment.sim3lon)}</span> tabung untuk{" "}
        {formatDateLong(adjustment.tanggal)}; rencana hari itu memuat{" "}
        <span className="data">{formatNumber(adjustment.committed)}</span>.
      </p>
      <ul className="mt-2 space-y-1">
        {adjustment.add > 0 ? (
          <li>
            Tambah <span className="data">{formatNumber(adjustment.add)}</span> tabung untuk{" "}
            {adjustment.rows.filter((r) => r.add > 0).length} pangkalan
            {adjustment.draftTopup ? ` (masuk ke ${adjustment.draftTopup.kode} yang masih draf)` : " (dibuatkan rencana tambahan)"}.
          </li>
        ) : null}
        {adjustment.reduce > 0 ? (
          <li>
            Kurangi <span className="data">{formatNumber(adjustment.reduce)}</span> tabung yang belum berangkat.
          </li>
        ) : null}
        {adjustment.over > 0 ? (
          <li className="text-rust-ink">
            <span className="data">{formatNumber(adjustment.over)}</span> tabung sudah terkirim melebihi SIM3LON. Tidak
            dikurangi otomatis; periksa selisihnya di halaman SA.
          </li>
        ) : null}
      </ul>

      {actionable ? (
        <>
          <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-xs text-ink-muted">
            <li>Manajer menekan <strong>{action}</strong> dan memeriksa daftarnya.</li>
            {adjustment.add > 0 ? (
              <>
                <li>Dispatcher menetapkan sopir dan truk untuk rencana tambahan, lalu menyimpan.</li>
                <li>Manajer mengonfirmasi rencana tambahan; ritnya berangkat seperti biasa.</li>
              </>
            ) : (
              <li>Rit yang belum berangkat memuat jumlah baru; kuota yang dikurangi kembali ke SA.</li>
            )}
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <CanAccess
              permission={PERMISSIONS.DISTRIBUTION_APPROVE}
              fallback={<p className="text-xs text-ink-muted">Minta manajer menekan {action} pada rencana ini.</p>}
            >
              <Button size="sm" disabled={isApplying} onClick={() => setReviewing(true)}>
                {action}
              </Button>
            </CanAccess>
          </div>
        </>
      ) : null}

      <Dialog open={reviewing} onOpenChange={setReviewing}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{action}</DialogTitle>
            <DialogDescription>
              {plan.topupOf ? plan.topupOf.kode : adjustment.planKode} · {formatDateLong(adjustment.tanggal)}. Angka
              diambil dari data SIM3LON yang terakhir diterapkan.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-muted">
                <tr>
                  <th className="py-1 pr-2 font-normal">Pangkalan</th>
                  <th className="py-1 pr-2 text-right font-normal">SIM3LON</th>
                  <th className="py-1 pr-2 text-right font-normal">Rencana</th>
                  <th className="py-1 pr-2 text-right font-normal">Terkirim</th>
                  <th className="py-1 text-right font-normal">Perubahan</th>
                </tr>
              </thead>
              <tbody>
                {adjustment.rows.map((row) => (
                  <tr key={row.outletId} className="border-t border-line">
                    <td className="py-1.5 pr-2">
                      {row.outletName}
                      <span className="block text-xs text-ink-muted data">{row.outletCode}</span>
                    </td>
                    <td className="py-1.5 pr-2 text-right data">{formatNumber(row.sim3lon)}</td>
                    <td className="py-1.5 pr-2 text-right data">{formatNumber(row.committed)}</td>
                    <td className="py-1.5 pr-2 text-right data">{formatNumber(row.sent)}</td>
                    <td className="py-1.5 text-right data">
                      {row.add > 0 ? `+${formatNumber(row.add)}` : null}
                      {row.reduce > 0 ? `−${formatNumber(row.reduce)}` : null}
                      {row.over > 0 ? (
                        <span className="block text-xs text-rust-ink">{formatNumber(row.over)} lebih, tidak diubah</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-1 text-xs text-ink-muted">
            {adjustment.add > 0 ? (
              <li>
                Tambahan {formatNumber(adjustment.add)} tabung{" "}
                {adjustment.draftTopup
                  ? `masuk ke ${adjustment.draftTopup.kode}, yang masih draf.`
                  : "dibuatkan rencana tambahan untuk hari yang sama; surat jalan dan tagihannya terbit saat ritnya berangkat."}
              </li>
            ) : null}
            {adjustment.reduce > 0 ? (
              <li>
                Pengurangan {formatNumber(adjustment.reduce)} tabung diambil dari rencana tambahan yang terbaru dulu, baru
                rencana SIM3LON; hanya pemberhentian yang belum berangkat.
              </li>
            ) : null}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(false)}>
              Batal
            </Button>
            <Button
              disabled={isApplying}
              onClick={() => {
                onApply(adjustment);
                setReviewing(false);
              }}
            >
              {action}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** The link between a SIM3LON plan and its extra plans, both ways. */
function PlanLinks({ plan, onOpenPlan }: { plan: DistributionPlan; onOpenPlan: (planId: string) => void }) {
  if (plan.topupOf) {
    return (
      <p className="mb-2 text-xs text-ink-muted">
        Rencana tambahan dari SIM3LON untuk{" "}
        <button type="button" className="data text-ink underline" onClick={() => onOpenPlan(plan.topupOf!.id)}>
          {plan.topupOf.kode}
        </button>
        . Isinya hanya berubah lewat Tambah atau Sesuaikan dengan SIM3LON.
      </p>
    );
  }
  if (plan.topups.length === 0) return null;
  return (
    <p className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
      <span>Rencana tambahan:</span>
      {plan.topups.map((topup) => (
        <button key={topup.id} type="button" className="text-ink underline" onClick={() => onOpenPlan(topup.id)}>
          <span className="data">{topup.kode}</span> · {topup.status} · {formatNumber(topup.totalUnit)} tabung
        </button>
      ))}
    </p>
  );
}
