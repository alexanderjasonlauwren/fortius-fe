import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { scopeKey } from "@/lib/scope";
import { useDistributionPlan } from "@/features/distribution/hooks/useDistributionPlan";
import { PlanListPanel } from "@/features/distribution/components/PlanListPanel";
import { PlanDetailPanel } from "@/features/distribution/components/PlanDetailPanel";
import { AllocationMatrixPanel } from "@/features/distribution/components/AllocationMatrixPanel";
import { SourcePlanStatus } from "@/features/distribution/components/SourcePlanStatus";
import { getCreditApprovers } from "@/features/distribution/api/distributionApi";
import { creditBreachOf, type CreditBreach } from "@/features/distribution/lib/creditBreach";
import { useAuthStore } from "@/features/auth/store/authStore";
import { ApiError } from "@/lib/api";
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

/** How the dispatch refuses the approver named, rather than the run. */
const APPROVER_REFUSALS = new Set(["CONFLICT", "CONSTRAINT_VIOLATED"]);

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
   * approver — D3 A-Step 2/3. The refusal names the outlet
   * (CREDIT_LIMIT_BREACHED, `outlet_id` in its details).
   */
  const [overrideDialog, setOverrideDialog] = useState<{
    tripId: string;
    breach: CreditBreach;
    message: string;
  } | null>(null);
  const [secondApproverId, setSecondApproverId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  // Exactly the people the dispatch accepts, less the signed-in user: naming
  // yourself is refused (ck_deliveries_credit_override).
  const me = useAuthStore((s) => s.user?.id);
  const approvers = useQuery({
    queryKey: [...scopeKey(), "credit-approvers"],
    queryFn: getCreditApprovers,
    enabled: !!overrideDialog,
  });
  const approverChoices = (approvers.data ?? []).filter((a) => a.id !== me);
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

  const handleDispatchTrip = (tripId: string) => {
    dispatchTripMutation.mutate(
      { tripId },
      {
        onError: (error) => {
          const breach = creditBreachOf(error);
          if (breach) setOverrideDialog({ tripId, breach, message: error.message });
        },
      },
    );
  };

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
            <DialogTitle>Keberangkatan ditahan: kredit {overrideDialog?.breach.outletName}</DialogTitle>
            <DialogDescription>{overrideDialog?.message}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field
              label="Penyetuju kedua"
              hint={
                approvers.isSuccess && approverChoices.length === 0
                  ? "Belum ada orang lain yang berwenang menyetujui pengecualian kredit di agen ini. Atur di Pengguna & Akses."
                  : "Hanya yang berwenang menyetujui pengecualian kredit, selain Anda."
              }
              required
            >
              <SelectInput
                value={secondApproverId}
                onChange={(e) => setSecondApproverId(e.target.value)}
                disabled={!approvers.isSuccess}
              >
                <option value="">{approvers.isPending ? "Memuat…" : "Pilih penyetuju"}</option>
                {approverChoices.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nama} · {a.username}
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
                dispatchTripMutation.isPending
              }
              onClick={() => {
                if (!overrideDialog) return;
                dispatchTripMutation.mutate(
                  {
                    tripId: overrideDialog.tripId,
                    overrides: [
                      {
                        outletId: overrideDialog.breach.outletId,
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
                      // Another breached stop on the same run: move the
                      // dialog to it. An unauthorised or self-named approver
                      // comes back as a plain conflict or a constraint; the
                      // toast names it and the dialog stays so the choice can
                      // be corrected. Anything else has no override path.
                      const next = creditBreachOf(error);
                      if (next) {
                        setOverrideDialog({ tripId: overrideDialog.tripId, breach: next, message: error.message });
                        setSecondApproverId("");
                        setOverrideReason("");
                      } else if (!(error instanceof ApiError && APPROVER_REFUSALS.has(error.code))) {
                        setOverrideDialog(null);
                      }
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
