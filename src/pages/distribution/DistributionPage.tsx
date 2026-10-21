import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { scopeKey } from "@/lib/scope";
import { useDistributionPlan } from "@/features/distribution/hooks/useDistributionPlan";
import { PlanListPanel } from "@/features/distribution/components/PlanListPanel";
import { PlanDetailPanel } from "@/features/distribution/components/PlanDetailPanel";
import { AllocationMatrixPanel } from "@/features/distribution/components/AllocationMatrixPanel";
import { SourcePlanStatus } from "@/features/distribution/components/SourcePlanStatus";
import { getUsers } from "@/features/users/api/userApi";
import { PageHeader } from "@/components/common/PageHeader";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Field, SelectInput, TextInput, TextareaInput } from "@/components/common/Field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDateLong, formatNumber } from "@/lib/format";
import type { PlanRow } from "@/features/distribution/types";
import { unitLabel } from "@/lib/lexicon";

/**
 * The backend's own refusal reasons for a dispatch that never reach a credit
 * override at all — "the run has already left," "no stops" — must not open
 * this dialog; only a breach-shaped message should. Matched loosely rather
 * than on a code, because the service answers with a sentence, not one: see
 * `DispatchTrip`'s own controller doc comment for the other two shapes.
 */
function isCreditBreach(message: string): boolean {
  return /credit limit|overdue/i.test(message);
}

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function DistributionPage() {
  const {
    intakePolicy,
    sourceReview,
    fillSourceMutation,
    planList,
    planDetail,
    selectedPlan,
    isLoadingList,
    isLoadingDetail,
    selectedPlanId,
    setSelectedPlanId,
    outletOptions,
    vehicleOptions,
    productOptions,
    saProductOptions,
    driverOptions,
    saOptions,
    saveDraftMutation,
    confirmPlanMutation,
    dispatchTripMutation,
    createPlanMutation,
    cancelPlanMutation,
    printMutation,
  } = useDistributionPlan();

  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"daily" | "allocation">("daily");
  const [newDate, setNewDate] = useState(tomorrowIso());
  const [newSaId, setNewSaId] = useState("");
  /**
   * A credit-limit breach a dispatch attempt refused, waiting on a second
   * approver — D3 A-Step 2/3. `rows` is the trip's own stops at the moment of
   * refusal, kept only to resolve which one the service's message named (see
   * `outletOfBreach` below); it plays no other part in the retry.
   */
  const [overrideDialog, setOverrideDialog] = useState<{
    tripId: string;
    rows: PlanRow[];
    message: string;
  } | null>(null);
  const [secondApproverId, setSecondApproverId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  // Every active user in the tenant, unfiltered: there is no endpoint today
  // that answers "who holds distribution.override.deliveries" (`GET /users`
  // does not even return a role, per that adapter's own header comment), so
  // this picker cannot pre-filter by authority — the request the dialog
  // sends is what actually enforces it, and an unauthorised choice comes
  // back as its own clean refusal rather than silently succeeding.
  const users = useQuery({
    queryKey: [...scopeKey(), "users-for-override"],
    queryFn: () => getUsers(),
  });
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const total = planDetail.reduce((s, r) => s + r.jumlahUnit, 0);
  const drafts = planList.filter((p) => p.status === "Draf").length;
  const sourceBlocked = !intakePolicy.allowsManualIntake && (!sourceReview.isSuccess || sourceReview.data.status !== "ready");

  const handleSaveDraft = (rows: PlanRow[]) => {
    if (selectedPlan) {
      saveDraftMutation.mutate({ planId: selectedPlan.id, rows, version: selectedPlan.version });
    }
  };

  const handleDispatchTrip = (tripId: string, rows: PlanRow[]) => {
    dispatchTripMutation.mutate(
      { tripId },
      {
        onError: (error) => {
          if (isCreditBreach(error.message)) {
            setOverrideDialog({ tripId, rows, message: error.message });
          }
        },
      },
    );
  };

  // The outlet the service's own message named, resolved by matching its
  // display name against the trip's own stops -- the response carries no
  // structured outlet id, only the sentence. Falls back to the first
  // breached-looking stop if the match fails, so the dialog still opens
  // rather than silently doing nothing on a wording it did not expect.
  const breachedOutlet = overrideDialog
    ? (overrideDialog.rows.find((r) => overrideDialog.message.includes(r.outlet)) ??
      overrideDialog.rows.find((r) => r.alasanBlokir) ??
      overrideDialog.rows[0])
    : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasi harian"
        title="Perencanaan Distribusi"
        description="Tinjau alokasi dan tetapkan armada untuk satu hari pengiriman. Menyimpan titik singgah mereservasi kuota SA; surat jalan diterbitkan saat trip diberangkatkan."
        meta={
          <span className="text-xs text-ink-muted">
            {planList.length} rencana tercatat · {drafts} masih draf
          </span>
        }
      />

      {selectedPlan?.saId ? <SourcePlanStatus
        review={sourceReview.data}
        isLoading={sourceReview.isLoading}
        error={sourceReview.error}
        fillError={fillSourceMutation.variables?.id === selectedPlan.id ? fillSourceMutation.error : null}
        isFilling={fillSourceMutation.isPending && fillSourceMutation.variables?.id === selectedPlan.id}
        canFill={selectedPlan.status === "Draf" && !isLoadingDetail && planDetail.length === 0}
        onRetry={() => {
          if (selectedPlan.status === "Draf" && !isLoadingDetail && planDetail.length === 0) fillSourceMutation.mutate(selectedPlan);
          else void sourceReview.refetch();
        }}
      /> : null}

      <div className="flex w-fit rounded-lg border border-line bg-panel p-1">
        <Button
          size="sm"
          variant={view === "daily" ? "default" : "ghost"}
          onClick={() => setView("daily")}
        >
          Rencana harian
        </Button>
        <Button
          size="sm"
          variant={view === "allocation" ? "default" : "ghost"}
          onClick={() => setView("allocation")}
        >
          Matriks alokasi
        </Button>
      </div>

      {view === "allocation" ? (
        <AllocationMatrixPanel />
      ) : (
        <div className="grid min-h-[36rem] grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <PlanListPanel
              plans={planList}
              isLoading={isLoadingList}
              selectedId={selectedPlanId}
              onSelect={setSelectedPlanId}
              onCreate={() => {
                setNewSaId(saOptions.find((s) => !s.disabled)?.id ?? "");
                setCreating(true);
              }}
            />
          </div>

          <div className="lg:col-span-9">
            <PlanDetailPanel
              allowsManualDemand={intakePolicy.allowsManualIntake}
              sourceBlocked={sourceBlocked || fillSourceMutation.isPending}
              plan={selectedPlan}
              rows={planDetail}
              isLoading={isLoadingDetail}
              outletOptions={outletOptions}
              productOptions={productOptions}
              saProductOptions={saProductOptions}
              driverOptions={driverOptions}
              vehicleOptions={vehicleOptions}
              onSaveDraft={handleSaveDraft}
              onConfirm={() => setConfirming(true)}
              onCancelPlan={() => setCancelling(true)}
              onPrint={() => selectedPlanId && printMutation.mutate(selectedPlanId)}
              isSaving={saveDraftMutation.isPending}
              isConfirming={confirmPlanMutation.isPending}
              onDispatchTrip={handleDispatchTrip}
              dispatchingTripId={
                dispatchTripMutation.isPending
                  ? (dispatchTripMutation.variables?.tripId ?? null)
                  : null
              }
            />
          </div>
        </div>
      )}

      {/* New plan */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buat rencana distribusi</DialogTitle>
            <DialogDescription>
              Satu rencana mewakili satu hari pengiriman. Rencana kosong belum memakai
              kuota; menyimpan titik singgah langsung mereservasi kuota SA.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label="Tanggal pengiriman" htmlFor="tanggal" required>
              <TextInput
                id="tanggal"
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </Field>

            <Field
              label="SA"
              htmlFor="sa"
              hint="Hanya SA aktif yang masih punya sisa kuota."
              required
            >
              <SelectInput
                id="sa"
                value={newSaId}
                onChange={(e) => setNewSaId(e.target.value)}
              >
                <option value="">Pilih SA</option>
                {saOptions.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.disabled}>
                    {s.label} · {s.sublabel}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Batal
            </Button>
            <Button
              disabled={!newDate || !newSaId || createPlanMutation.isPending}
              onClick={() =>
                createPlanMutation.mutate(
                  { tanggal: newDate, saId: newSaId },
                  { onSuccess: () => setCreating(false) },
                )
              }
            >
              Buat rencana
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm — spell out what confirmation actually does. */}
      <ConfirmDialog
        isOpen={confirming}
        variant="default"
        title={`Konfirmasi ${selectedPlan?.kode ?? "rencana"}?`}
        message="Setelah dikonfirmasi, rencana tidak dapat diubah dan armada dapat berangkat."
        details={
          selectedPlan && (
            <ul className="space-y-1.5">
              <li>
                <span className="data">{formatNumber(total)}</span> {unitLabel()} sudah direservasi dari{" "}
                <span className="data">{selectedPlan.nomorSA}</span>. Sisa kuota tersedia:{" "}
                <span className="data">
                  {formatNumber(selectedPlan.sisaKuotaSA)}
                </span>
                .
              </li>
              <li>
                <span className="data">{planDetail.length}</span> titik singgah direncanakan
                untuk {formatDateLong(selectedPlan.tanggal)}. Surat jalan terbit saat rit berangkat.
              </li>
              <li>Pemberhentian muncul di Monitoring Distribusi dan papan berangkat.</li>
            </ul>
          )
        }
        confirmLabel="Konfirmasi rencana"
        isPending={confirmPlanMutation.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          if (sourceBlocked || fillSourceMutation.isPending) return;
          if (!selectedPlanId) return;
          confirmPlanMutation.mutate(selectedPlanId, {
            onSettled: () => setConfirming(false),
          });
        }}
      />

      <ConfirmDialog
        isOpen={cancelling}
        title={
          selectedPlan?.status === "Draf"
            ? `Batalkan ${selectedPlan?.kode ?? "draf"}?`
            : `Batalkan ${selectedPlan?.kode ?? "rencana"}?`
        }
        message={
          selectedPlan?.status === "Draf"
            ? "Draf dibatalkan tanpa menghapus histori. Kuota yang dipesan titik singgah yang belum berjalan dikembalikan ke SA."
            : "Surat jalan yang belum berjalan akan ditarik kembali dan kuotanya dikembalikan ke SA."
        }
        details={
          selectedPlan?.status === "Draf"
            ? undefined
            : "Rencana yang sebagian armadanya sudah berangkat tidak bisa dibatalkan sekaligus. Tutup surat jalannya satu per satu di Monitoring Distribusi."
        }
        confirmLabel={selectedPlan?.status === "Draf" ? "Batalkan draf" : "Batalkan rencana"}
        isPending={cancelPlanMutation.isPending}
        onCancel={() => setCancelling(false)}
        onConfirm={() => {
          if (!selectedPlanId) return;
          cancelPlanMutation.mutate(selectedPlanId, {
            onSettled: () => setCancelling(false),
          });
        }}
      />

      {/*
        Credit-limit override (D3 A-Step 2/3). One outlet at a time: the
        service refuses on the first unresolved breach it finds and never
        names more than one per attempt, so retrying after each fix is the
        only shape this dialog needs to handle.
      */}
      <Dialog
        open={!!overrideDialog}
        onOpenChange={(open) => {
          if (!open) {
            setOverrideDialog(null);
            setSecondApproverId("");
            setOverrideReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keberangkatan ditahan: kredit</DialogTitle>
            <DialogDescription>{overrideDialog?.message}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field
              label="Penyetuju kedua"
              hint="Harus orang lain, bukan yang memberangkatkan armada. Haknya diperiksa saat disimpan."
              required
            >
              <SelectInput
                value={secondApproverId}
                onChange={(e) => setSecondApproverId(e.target.value)}
              >
                <option value="">Pilih pengguna</option>
                {(users.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nama} · {u.email}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Alasan" required>
              <TextareaInput
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Mis. Pangkalan lama, pelunasan sudah dijadwalkan minggu ini"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideDialog(null)}>
              Batal
            </Button>
            <Button
              disabled={
                !secondApproverId ||
                !overrideReason.trim() ||
                !breachedOutlet ||
                dispatchTripMutation.isPending
              }
              onClick={() => {
                if (!overrideDialog || !breachedOutlet) return;
                dispatchTripMutation.mutate(
                  {
                    tripId: overrideDialog.tripId,
                    overrides: [
                      {
                        outletId: breachedOutlet.outletId,
                        secondApproverId,
                        reason: overrideReason,
                      },
                    ],
                  },
                  {
                    onSuccess: () => {
                      setOverrideDialog(null);
                      setSecondApproverId("");
                      setOverrideReason("");
                    },
                    onError: (error) => {
                      // Refused again -- self-approval, an unauthorised
                      // approver, or another breach on the same trip. The
                      // toast already named it; keep the dialog open on the
                      // same outlet so the reason is visible to try again.
                      if (!isCreditBreach(error.message)) setOverrideDialog(null);
                    },
                  },
                );
              }}
            >
              Kirim persetujuan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
