import { scopeKey } from "@/lib/scope";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import {
  addApprovedOrders,
  cancelDistributionPlan,
  confirmPlan,
  createPlan,
  createSourcePlan,
  dispatchTrip,
  getActiveSaOptions,
  getDriverOptions,
  getOutletOptions,
  getProductOptions,
  getSAProductOptions,
  getVehicleOptions,
  applyAssignment,
  getPlan,
  getPlanDetail,
  getPlanList,
  printRouteSheet,
  saveDraft,
} from "../api/distributionApi";
import type { CreditOverrideInput } from "../api/contract";
import type { DistributionPlan, PlanRow } from "../types";
import { compareStops } from "../lib/stopOrder";
import { outletLabel, unitLabel } from "@/lib/lexicon";
import { useResettableState } from "@/hooks/useResettableState";
import { useIntakePolicy } from "./useIntakePolicy";
import { getSourcePlanReview } from "../api/sourcePlanReview";
import { sourcePlanMessage } from "../api/sourcePlanReview.contract";
import { sourceRowsForEmptyDraft } from "../api/fillSourcePlan";

export function useDistributionPlan() {
  const queryClient = useQueryClient();
  const intakePolicy = useIntakePolicy();
  const actingScope = scopeKey();

  const planList = useQuery({ queryKey: [...scopeKey(), "plan-list"], queryFn: getPlanList });

  // Open on the plan that needs attention: today's, or the newest draft.
  //
  // Chosen during render rather than in an effect, so the first paint already
  // has a plan selected. Via an effect the panel rendered once with nothing
  // selected, which flashed the empty state on every load.
  //
  // The list is the only dependency: an explicit selection survives a refetch
  // because setSelectedPlanId replaces the value without disturbing the seed,
  // and only a genuinely new list re-runs the choice.
  const [selectedPlanId, setSelectedPlanId] = useResettableState<string | null>(
    [planList.data],
    () => {
      const plans = planList.data;
      if (!plans?.length) return null;
      return (plans.find((p) => p.status === "Draft") ?? plans[0]).id;
    },
  );

  // The selected plan is read on its own rather than found in the list.
  //
  // A list row cannot carry which agreement the plan spends: the service
  // records that per stop, so it is only known once the stops have been
  // fetched. Finding the plan in the list left the panel showing "—" for the SA
  // on the API build while the mock showed the real one — the exact kind of
  // difference between the two builds this split exists to prevent.
  const selectedPlanQuery = useQuery({
    queryKey: [...scopeKey(), "plan", selectedPlanId],
    queryFn: () => getPlan(selectedPlanId!),
    enabled: !!selectedPlanId,
  });

  const planDetail = useQuery({
    queryKey: [...scopeKey(), "plan-detail", selectedPlanId],
    queryFn: () => getPlanDetail(selectedPlanId!),
    enabled: !!selectedPlanId,
  });

  const sourceReview = useQuery({
    queryKey: [...scopeKey(), "source-plan-review", selectedPlanQuery.data?.saId, selectedPlanQuery.data?.tanggal],
    queryFn: () => getSourcePlanReview(selectedPlanQuery.data!.saId, selectedPlanQuery.data!.tanggal),
    enabled: !!selectedPlanQuery.data?.saId,
  });

  const fillSourceMutation = useDeskMutation({
    mutationFn: async (plan: DistributionPlan) => {
      const assertScope = () => {
        if (scopeKey().join("|") !== actingScope.join("|")) throw new Error("Tenant berubah. Buka rencana pada tenant yang sesuai untuk mencoba kembali.");
      };
      assertScope();
      const [review, currentPlan, currentRows] = await Promise.all([
        queryClient.fetchQuery({ queryKey: [...actingScope, "source-plan-review", plan.saId, plan.tanggal], queryFn: () => getSourcePlanReview(plan.saId, plan.tanggal) }),
        getPlan(plan.id), getPlanDetail(plan.id),
      ]);
      assertScope();
      if (currentPlan.saId !== plan.saId || currentPlan.tanggal !== plan.tanggal) {
        throw new Error("SA atau tanggal rencana berubah. Buka ulang rencana dan tinjau sumber yang sesuai.");
      }
      const rows = sourceRowsForEmptyDraft(currentPlan, currentRows, review, outletOptions.data ?? []);
      if (rows.length > 0) await saveDraft(plan.id, rows, currentPlan.version);
      return { review, count: rows.length };
    },
    errorTitle: "Alokasi SIM3LON belum diisi",
    success: ({ review, count }) => count > 0
      ? { title: `${count} pangkalan diisi dari SIM3LON`, description: "Menyimpan titik singgah mereservasi kuota SA. Tetapkan armada sebelum konfirmasi." }
      : { title: "Sumber belum dapat mengisi rencana", description: sourcePlanMessage(review), tone: "warning" },
  });

  const outletOptions = useQuery({
    queryKey: [...scopeKey(), "outlet-options"],
    queryFn: getOutletOptions,
  });

  const driverOptions = useQuery({
    queryKey: [...scopeKey(), "driver-options", selectedPlanId],
    queryFn: () => getDriverOptions(selectedPlanId!),
    enabled: !!selectedPlanId,
  });

  const vehicleOptions = useQuery({
    queryKey: [...scopeKey(), "vehicle-options"],
    queryFn: getVehicleOptions,
  });

  const productOptions = useQuery({
    queryKey: [...scopeKey(), "product-options"],
    queryFn: getProductOptions,
  });

  // What the open plan's own SA is for -- a new stop should default to this,
  // not to the catalogue-wide list above.
  const saProductOptions = useQuery({
    queryKey: [...scopeKey(), "sa-product-options", selectedPlanQuery.data?.saId],
    queryFn: () => getSAProductOptions(selectedPlanQuery.data!.saId),
    enabled: !!selectedPlanQuery.data?.saId,
  });

  const saOptions = useQuery({
    queryKey: [...scopeKey(), "active-sa-options"],
    queryFn: getActiveSaOptions,
  });

  // The version every write echoes back. Read from the plan the panel is
  // showing, never from a remembered value: the point of the guard is that it
  // is the number the caller actually saw.
  const version = () => selectedPlanQuery.data?.version ?? 1;

  /**
   * Saving a board is two writes, and both must happen.
   *
   * The stops and the crew live in different places — the plan's items, and the
   * runs those items ride on — with different permissions behind them. Saving
   * only the stops is what left the console able to plan a day and unable to
   * dispatch it: the driver and truck the dispatcher chose went nowhere, the
   * re-read came back with no crew, and the board was permanently unsaved.
   *
   * The assignment goes second, so a rejected stop list never leaves runs
   * pointing at items that were not written.
   *
   * A run with no truck is skipped rather than sent. The service requires one
   * and would refuse the whole board; skipping keeps the stops saved and leaves
   * the incomplete run visibly unassigned, which is what the dispatcher is
   * looking at anyway.
   */
  const saveDraftMutation = useDeskMutation({
    mutationFn: async ({ planId, rows, version }: { planId: string; rows: PlanRow[]; version: number }) => {
      const savedPlan = await saveDraft(planId, rows, version);

      const trips = toTripAssignments(rows);
      // The stop save advances the plan version. Use the exact version that
      // write returned, tied to this mutation's plan, rather than reading the
      // currently selected plan after an await and potentially assigning a
      // different plan's version.
      if (trips.length > 0) await applyAssignment(planId, trips, savedPlan.version);
      return { trips: trips.length };
    },
    errorTitle: "Draf tidak tersimpan",
    success: ({ trips }) =>
      trips > 0
        ? { title: "Draf disimpan", description: `${trips} rit ditetapkan.` }
        : { title: "Draf disimpan" },
  });

  const confirmPlanMutation = useDeskMutation({
    mutationFn: (planId: string) => confirmPlan(planId, version()),
    errorTitle: "Konfirmasi gagal",
    // What the confirmation actually committed, rather than how many delivery
    // notes it printed. The service confirms the obligation and leaves the
    // paperwork to dispatch, so a delivery count here would be a number only
    // the demo could fill.
    success: (plan) => ({
      title: `Rencana ${plan.kode} dikonfirmasi`,
      description: `${plan.jumlahOutlet} ${outletLabel()} · ${plan.totalUnit.toLocaleString("id-ID")} ${unitLabel()} terikat pada kuota SA. Pantau di Monitoring Distribusi.`,
    }),
  });

  /**
   * Sends one already-assigned run out — D3 A-Step 2/3.
   *
   * Refused for a credit-limit breach is a real, expected outcome, not a
   * failure the toast alone should carry: the page passes its own
   * `onError` at the call site (React Query runs it alongside this one) to
   * open the override dialog when the refusal is breach-shaped, so this
   * mutation itself stays generic — it does not know a dialog exists.
   */
  const dispatchTripMutation = useDeskMutation({
    mutationFn: ({ tripId, overrides }: { tripId: string; overrides?: CreditOverrideInput[] }) =>
      dispatchTrip(tripId, overrides),
    errorTitle: "Keberangkatan gagal",
    success: (result) => ({
      title: "Trip diberangkatkan",
      description: `${result.issued} surat jalan diterbitkan.`,
    }),
  });

  const createPlanMutation = useDeskMutation({
    mutationFn: async (input: Parameters<typeof createPlan>[0]) => {
      // Capture scope when the operator starts the write. React Query may call
      // the latest onSuccess options after a rerender, so a render-time scope
      // comparison can accidentally compare tenant B with tenant B even though
      // the request was issued in tenant A.
      const originScope = scopeKey();
      const assertOriginScope = () => {
        if (scopeKey().join("|") !== originScope.join("|")) {
          throw new Error("Tenant berubah. Buat rencana kembali pada tenant yang sesuai.");
        }
      };
      if (intakePolicy.data === "manual") {
        const plan = await createPlan(input);
        return { plan, originScope, sourceBacked: false };
      }
      if (intakePolicy.data !== "external_schedule") {
        throw new Error("Kebijakan sumber rencana belum tersedia. Muat ulang sebelum membuat rencana.");
      }
      const review = await queryClient.fetchQuery({
        queryKey: [...originScope, "source-plan-review", input.saId, input.tanggal],
        queryFn: () => getSourcePlanReview(input.saId, input.tanggal),
      });
      assertOriginScope();
      if (review.status !== "ready" || review.date !== input.tanggal || !review.batchId ||
          !review.branchId || !review.productId || review.periodMonth !== input.tanggal.slice(0, 7) ||
          review.rows.length === 0 || review.unresolvedRegistrationCodes.length > 0) {
        throw new Error(sourcePlanMessage(review));
      }
      const plan = await createSourcePlan({ batchId: review.batchId, tanggal: input.tanggal });
      assertOriginScope();
      return { plan, originScope, sourceBacked: true };
    },
    errorTitle: "Rencana tidak dibuat",
    success: ({ plan, sourceBacked }) => ({
      title: `Rencana ${plan.kode} dibuat`,
      description: sourceBacked
        ? "Rencana, alokasi pangkalan, reservasi kuota, dan sumber SIM3LON dibuat sebagai satu transaksi."
        : "Rencana dibuat. Alokasi dapat ditambahkan pada draf.",
    }),
    onDone: ({ plan, originScope, sourceBacked }) => {
      if (scopeKey().join("|") !== originScope.join("|")) return;
      setSelectedPlanId(plan.id);
      if (!sourceBacked && plan.saId) fillSourceMutation.mutate(plan);
    },
  });

  const cancelPlanMutation = useDeskMutation({
    mutationFn: (planId: string) => cancelDistributionPlan(planId, version()),
    errorTitle: "Pembatalan gagal",
    success: () =>
      selectedPlanQuery.data?.status === "Draft"
        ? { title: "Draf dibatalkan", description: "Reservasi kuota titik singgah yang belum berjalan dikembalikan ke SA." }
        : {
            title: "Rencana dibatalkan",
            description: "Kuota dikembalikan ke Schedule Agreement.",
          },
  });

  const addOrdersMutation = useDeskMutation({
    mutationFn: async ({ planId, orderIds }: { planId: string; orderIds: string[] }) => {
      if (!intakePolicy.allowsManualIntake) throw new Error("Intake manual tidak tersedia; gunakan alokasi SIM3LON.");
      return addApprovedOrders(planId, orderIds);
    },
    errorTitle: "Pesanan tidak dapat dijadwalkan",
    success: (count) => ({ title: `${count} pesanan masuk ke rencana` }),
  });

  const printMutation = useDeskMutation({
    mutationFn: (planId: string) => printRouteSheet(planId),
    errorTitle: "Cetak lembar rute gagal",
  });

  const selectedPlan = selectedPlanQuery.data;

  return {
    intakePolicy,
    sourceReview,
    fillSourceMutation,
    planList: planList.data ?? [],
    planDetail: planDetail.data ?? [],
    selectedPlan,
    isLoadingList: planList.isLoading,
    isLoadingDetail: planDetail.isLoading,
    isError: planList.isError,
    error: planList.error as Error | null,
    selectedPlanId,
    setSelectedPlanId,
    outletOptions: outletOptions.data ?? [],
    vehicleOptions: vehicleOptions.data ?? [],
    productOptions: productOptions.data ?? [],
    saProductOptions: saProductOptions.data ?? [],
    driverOptions: driverOptions.data ?? [],
    saOptions: saOptions.data ?? [],
    saveDraftMutation,
    confirmPlanMutation,
    dispatchTripMutation,
    createPlanMutation,
    cancelPlanMutation,
    addOrdersMutation,
    printMutation,
  };
}

/**
 * Turns the board's stops into the runs the service commits.
 *
 * Grouped by `(driver, trip)`, which is what a run is. The stop order is the
 * delivery order the dispatcher arranged — `sequence_no` starts at 1 because the
 * service validates `gte=1`, and positions need only be distinct within a run,
 * not contiguous.
 *
 * A run missing a driver or a truck is dropped, not sent half-formed: the
 * service refuses the whole board over one invalid run, and losing a colleague's
 * saved stops because one row was incomplete is the worse failure.
 */
export function toTripAssignments(rows: PlanRow[]) {
  const byRun = new Map<
    string,
    { driverId: string; vehicleId: string; tripNo: number; stops: { outletId: string; sequenceNo: number }[]; berangkat?: string }
  >();

  // Sorted once, up front, so each run's stops are pushed in the order the
  // optimizer proposed or the dispatcher rearranged (`urutan`) rather than in
  // whatever order the rows happen to sit in the draft array -- which used to
  // be alphabetical by outlet name, since that is how the board itself is
  // sorted for display.
  const ordered = [...rows].sort(compareStops);

  for (const row of ordered) {
    if (!row.driverId || !row.vehicleId) continue;
    const tripNo = row.tripNo ?? 1;
    const key = `${row.driverId}#${tripNo}`;
    const run = byRun.get(key) ?? {
      driverId: row.driverId,
      vehicleId: row.vehicleId,
      tripNo,
      stops: [],
      // Every row on a run carries the same departure -- it is a property of
      // the trip, stamped onto each of its rows the same way `vehicle` is --
      // so the first row seen for this run is as good a source as any.
      berangkat: row.berangkat ?? undefined,
    };
    run.stops.push({ outletId: row.outletId, sequenceNo: run.stops.length + 1 });
    byRun.set(key, run);
  }

  return [...byRun.values()].filter((run) => run.stops.length > 0);
}
