import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
  Plus,
  Printer,
  Save,
  Trash2,
  TriangleAlert,
  Truck,
  Wand2,
  XCircle,
} from "lucide-react";
import { Meter, PanelHeader } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { Skeleton } from "@/components/common/Panel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant } from "@/lib/status";
import { SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/useToast";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { formatDateLong, formatNumber } from "@/lib/format";
import type {
  AssignmentSuggestion,
  DistributionPlan,
  DriverOption,
  PlanOption,
  PlanRow,
  UnroutableStop,
  VehicleOption,
} from "../types";
import { suggestAssignment } from "../api/distributionApi";
import { applySuggestion, compareStops, moveStop } from "../lib/stopOrder";
import { outletLabel, outletLabelTitle, unitLabel } from "@/lib/lexicon";
import { useResettableState } from "@/hooks/useResettableState";

interface PlanDetailPanelProps {
  allowsManualDemand?: boolean;
  sourceBlocked?: boolean;
  plan?: DistributionPlan;
  rows: PlanRow[];
  isLoading: boolean;
  outletOptions: PlanOption[];
  productOptions: { id: string; label: string; satuan: string }[];
  /**
   * What the open plan's own SA is actually for. A new stop defaults to this
   * rather than to `productOptions[0]`, which is the whole catalogue sorted
   * alphabetically and unrelated to any agreement. Empty for an SA typed by
   * hand with no product quota recorded yet.
   */
  saProductOptions: { id: string; label: string; satuan: string }[];
  driverOptions: DriverOption[];
  vehicleOptions: VehicleOption[];
  onSaveDraft: (rows: PlanRow[]) => void;
  onConfirm: () => void;
  onCancelPlan: () => void;
  onPrint: () => void;
  isSaving: boolean;
  isConfirming: boolean;
  /**
   * Sends one confirmed trip out (D3 A-Step 2/3). Absent on a plan still
   * being drafted — there is nothing to dispatch until the board is
   * confirmed and a real trip exists to name.
   */
  onDispatchTrip?: (tripId: string, rows: PlanRow[]) => void;
  /** The trip currently mid-dispatch, so only its own button shows pending. */
  dispatchingTripId?: string | null;
}

/** A stop that has not been persisted yet gets a temporary id. */
let tempSeq = 0;

/**
 * How many depot cycles one driver may be given by hand.
 *
 * Matches the planner's own ceiling, so a board typed manually and a board
 * accepted from a suggestion can express the same days.
 */
const MAX_TRIP = 3;

interface TripGroup {
  key: string;
  driverId: string;
  vehicleId: string | null;
  tripNo: number;
  driver: DriverOption | undefined;
  vehicle: VehicleOption | undefined;
  kapasitas: number;
  muatan: number;
  /** Cylinders on this trip that no payment has arrived for. */
  berisiko: number;
  rows: PlanRow[];
  /**
   * The id `dispatchTrip` needs to send this run out — see `PlanRow.tripId`'s
   * own doc comment. Every row on one trip carries the same value, so the
   * first one answers for the group.
   */
  tripId: string | null;
  tripStatus?: string;
  /**
   * When this run leaves the pool, "HH:MM" -- an estimate, not something the
   * board edits here. Every row on the trip carries the same value, so the
   * first one answers for the group, same as `tripId`.
   */
  berangkat: string | null;
}

/**
 * A row with a driver but no trip number is trip 1.
 *
 * Every board saved before trips existed is in that shape, so treating the
 * absence as "unassigned" would empty the panel for every historical plan.
 */
function tripOf(row: PlanRow): number {
  return row.tripNo ?? 1;
}

function groupIntoTrips(
  rows: PlanRow[],
  drivers: DriverOption[],
  vehicles: VehicleOption[],
): TripGroup[] {
  const byKey = new Map<string, TripGroup>();

  for (const row of rows) {
    if (!row.driverId) continue;
    const tripNo = tripOf(row);
    const key = `${row.driverId}#${tripNo}`;
    let group = byKey.get(key);
    if (!group) {
      const driver = drivers.find((d) => d.id === row.driverId);
      const vehicle = vehicles.find((v) => v.id === row.vehicleId);
      group = {
        key,
        driverId: row.driverId,
        vehicleId: row.vehicleId,
        tripNo,
        driver,
        vehicle,
        // The truck's capacity, and only as a fallback the driver's — which is
        // itself the largest truck the depot could give them. A driver has no
        // capacity of their own; this is the ceiling of whatever they are in.
        kapasitas: vehicle?.kapasitas ?? driver?.kapasitas ?? 0,
        muatan: 0,
        berisiko: 0,
        rows: [],
        tripId: row.tripId ?? null,
        tripStatus: row.tripStatus,
        berangkat: row.berangkat ?? null,
      };
      byKey.set(key, group);
    }
    group.rows.push(row);
    group.muatan += row.jumlahUnit;
    // A credit stop was approved to go out unpaid, not left unpaid -- it is
    // not the risk this figure warns about (see suggestAssignment's own copy
    // of this rule).
    if (row.statusBayar === "Belum Lunas") group.berisiko += row.jumlahUnit;
  }

  // Fleet order, then trip number: the board reads down the day the way the
  // pool dispatches it. The driver id breaks ties so a driver missing from the
  // options list still lands somewhere fixed rather than moving on each render.
  const rank = new Map(drivers.map((d, i) => [d.id, i]));
  const groups = [...byKey.values()].sort(
    (a, b) =>
      (rank.get(a.driverId) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.driverId) ?? Number.MAX_SAFE_INTEGER) ||
      a.driverId.localeCompare(b.driverId) ||
      a.tripNo - b.tripNo,
  );
  // Within a trip, stops are driven in `urutan` order -- the sequence the
  // optimizer proposed or the dispatcher rearranged -- not the order rows
  // happen to sit in the array.
  for (const group of groups) group.rows.sort(compareStops);
  return groups;
}

export function PlanDetailPanel({
  allowsManualDemand = false,
  sourceBlocked = false,
  plan,
  rows,
  isLoading,
  outletOptions,
  productOptions,
  saProductOptions,
  driverOptions,
  vehicleOptions,
  onSaveDraft,
  onConfirm,
  onCancelPlan,
  onPrint,
  isSaving,
  isConfirming,
  onDispatchTrip,
  dispatchingTripId,
}: PlanDetailPanelProps) {
  // Server state wins whenever the selected plan or its saved rows change.
  const [draft, setDraft] = useResettableState<PlanRow[]>([rows, plan?.id], () => rows);
  const [dirty, setDirty] = useResettableState<boolean>([rows, plan?.id], () => false);
  // Both reset with the plan: a proposal is about the board it was made from,
  // and showing yesterday's leftovers beside today's stops would be a lie.
  const [unroutable, setUnroutable] = useResettableState<UnroutableStop[]>(
    [rows, plan?.id],
    () => [],
  );
  const [dasar, setDasar] = useResettableState<string | null>([rows, plan?.id], () => null);

  const editable = plan?.status === "Draft";

  const total = draft.reduce((s, r) => s + r.jumlahUnit, 0);
  /**
   * How much MORE this draft would draw than the plan already has.
   *
   * `sisaKuotaSA` is what the agreement has left, and against the service that
   * figure already accounts for this plan's saved stops — the quota moves when
   * a stop is written, not when the plan is confirmed, because
   * `quota_allocations.allocated_qty > 0` means the row and the first draw are
   * the same event.
   *
   * So subtracting the whole draft from it counts this plan's own stops twice:
   * a saved 100-cylinder stop against a 5.000 agreement showed 4.800 left when
   * the database said 4.900. Only the unsaved delta is new.
   */
  const saved = rows.reduce((s, r) => s + r.jumlahUnit, 0);
  const belumTersimpan = total - saved;
  const overQuota = plan ? belumTersimpan > plan.sisaKuotaSA : false;

  /**
   * Trips, in the order they are driven.
   *
   * Capacity applies to a trip, not to a driver: someone who loads at the pool,
   * runs four outlets, comes back and loads again carries two truckloads in a
   * day. Summing both against one truck reported an overload that was not real
   * and blocked a board the fleet could actually run.
   */
  const trips = useMemo(
    () => groupIntoTrips(draft, driverOptions, vehicleOptions),
    [draft, driverOptions, vehicleOptions],
  );

  /**
   * Which trip currently holds each truck.
   *
   * Keyed by driver, not by trip: the same driver running the truck out twice
   * in a day (trip 1, trip 2) is the normal multi-cycle case documented above
   * and must stay pickable, but a second driver reaching for a truck already
   * out with someone else is a double-booking the picker should refuse rather
   * than let the planner discover at the gate.
   */
  const vehicleUsage = useMemo(() => {
    const map = new Map<string, TripGroup>();
    for (const t of trips) {
      if (t.vehicleId && !map.has(t.vehicleId)) map.set(t.vehicleId, t);
    }
    return map;
  }, [trips]);

  const overloaded = trips.filter((t) => t.muatan > t.kapasitas);
  const unassigned = draft.filter((r) => !r.driverId);
  // A line with no product cannot be priced, so it cannot be invoiced either.
  const tanpaProduk = draft.filter((r) => r.lines.some((l) => !l.productId));
  const kreditDiblokir = draft.filter((r) => r.alasanBlokir);
  const adaHambatan =
    overQuota ||
    overloaded.length > 0 ||
    unassigned.length > 0 ||
    tanpaProduk.length > 0 ||
    kreditDiblokir.length > 0;

  /**
   * Proposes a board. Nothing is saved: the dispatcher accepts it by pressing
   * Simpan draf, or edits it first, or reloads and loses it.
   *
   * That is the shape the client asked for -- "propose, they accept or edit" --
   * and it is why this writes into the draft rather than calling the service.
   */
  const [isSuggesting, setIsSuggesting] = useState(false);
  const { toast } = useToast();

  const suggest = async () => {
    if (!plan) return;
    setIsSuggesting(true);
    let suggestion: AssignmentSuggestion;
    try {
      // Over the SAVED plan, in both builds. The service reads the order's own
      // stops -- it has no way to see a draft that exists only in this
      // component -- so proposing over unsaved edits would give one build a
      // different answer from the other for the same screen. The button is
      // disabled while the draft is dirty for exactly that reason.
      suggestion = await suggestAssignment(plan.id);
    } catch (error) {
      // A refused suggestion has to say so.
      //
      // The service can decline for reasons the planner can act on -- "this
      // branch has no coordinates, so no route can be measured from it" is the
      // first one it says -- and this handler used to swallow every one of
      // them: the button spun, nothing changed on screen, and the advice went
      // to the network tab where nobody was looking.
      toast({
        title: "Usulan tidak bisa disusun",
        description: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
      return;
    } finally {
      setIsSuggesting(false);
    }

    // Carries the optimizer's stop order and truck onto the draft, not only
    // the driver and trip number -- see `applySuggestion`'s own header for why
    // this used to be inline and what silently dropping the order used to
    // cost.
    setDraft((prev) => applySuggestion(prev, suggestion, vehicleOptions));
    setUnroutable(suggestion.unroutable);
    setDasar(suggestion.dasar);
    setDirty(true);
  };

  const patchRow = (id: string, patch: Partial<PlanRow>) => {
    setDraft((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        // Moving a stop to a different driver or trip invalidates its old
        // position: two stops on the new run would otherwise collide on the
        // same `urutan`, and the service treats a position as belonging to one
        // outlet. `compareStops` sorts a null position last, so the moved stop
        // simply lands at the end of its new run until someone reorders it.
        if (patch.driverId !== undefined || patch.tripNo !== undefined) next.urutan = null;
        return next;
      }),
    );
    setDirty(true);
  };

  const move = (id: string, direction: -1 | 1) => {
    setDraft((prev) => moveStop(prev, id, direction));
    setDirty(true);
  };

  /**
   * Lines are what the stop is; the total is a consequence of them.
   *
   * Recomputed here on every edit so the quota and capacity warnings above the
   * table respond as the planner types, rather than after a save round trip.
   */
  const patchLines = (id: string, lines: PlanRow["lines"]) => {
    if (!allowsManualDemand) return;
    patchRow(id, { lines, jumlahUnit: lines.reduce((s, l) => s + l.jumlah, 0) });
  };

  /**
   * Puts a truck on a run — every stop of it.
   *
   * The trip key is `driverId#tripNo`, which is exactly the set of rows the
   * service will send as one `TripRequest`. Patching them together is what keeps
   * the board expressible: a run carries one vehicle, and rows that disagreed
   * would have no valid shape to be committed in.
   */
  const setTripVehicle = (tripKey: string, vehicleId: string) => {
    const label = vehicleOptions.find((v) => v.id === vehicleId)?.label ?? "Belum ditetapkan";
    setDraft((prev) =>
      prev.map((row) => {
        if (!row.driverId) return row;
        if (`${row.driverId}#${tripOf(row)}` !== tripKey) return row;
        return { ...row, vehicleId: vehicleId || null, vehicle: label };
      }),
    );
    setDirty(true);
  };

  const addRow = () => {
    if (!allowsManualDemand) return;
    const used = new Set(draft.map((r) => r.outletId));
    const next = outletOptions.find((p) => !used.has(p.id));
    if (!next) return;
    tempSeq += 1;
    const hour = Math.min(17, 7 + draft.length);
    // The SA this plan draws on, first -- not the whole catalogue's
    // alphabetically-first entry, which has nothing to do with what this
    // agreement was actually imported for.
    const defaultProductId = saProductOptions[0]?.id ?? productOptions[0]?.id ?? "";
    setDraft((prev) => [
      ...prev,
      {
        id: `baru-${tempSeq}`,
        outletId: next.id,
        vehicleId: null,
        vehicle: "Belum ditetapkan",
        outlet: next.label,
        alamat: next.sublabel ?? "",
        lines: [{ productId: defaultProductId, jumlah: 100 }],
        jumlahUnit: 100,
        driverId: null,
        driver: "Belum ditetapkan",
        tripNo: null,
        jamPengiriman: `${String(hour).padStart(2, "0")}:00`,
        statusBayar: "Lunas",
        sisaKuotaOutlet: 0,
        piutang: 0,
        piutangJatuhTempo: 0,
      },
    ]);
    setDirty(true);
  };

  const removeRow = (id: string) => {
    if (!allowsManualDemand) return;
    setDraft((prev) => prev.filter((r) => r.id !== id));
    setDirty(true);
  };

  /**
   * Which stops the bulk bar acts on.
   *
   * Reset with the same seed as the draft itself: a selection made on
   * yesterday's board applying itself to today's after a plan switch would be
   * a silent mass-edit of stops the planner never looked at.
   */
  const [selected, setSelected] = useResettableState<Set<string>>(
    [rows, plan?.id],
    () => new Set<string>(),
  );
  const [bulkDriverId, setBulkDriverId] = useState("");
  const [bulkTripNo, setBulkTripNo] = useState("1");
  const [bulkJam, setBulkJam] = useState("");

  const toggleSelected = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const allSelected = draft.length > 0 && draft.every((r) => selected.has(r.id));
  const toggleSelectAll = (checked: boolean) => {
    setSelected(checked ? new Set(draft.map((r) => r.id)) : new Set());
  };

  const clearSelection = () => setSelected(new Set());

  const applyBulkDriver = () => {
    if (!bulkDriverId || selected.size === 0) return;
    const driver = driverOptions.find((d) => d.id === bulkDriverId);
    const tripNo = Number(bulkTripNo);
    setDraft((prev) =>
      prev.map((r) =>
        selected.has(r.id)
          ? {
              ...r,
              driverId: bulkDriverId,
              driver: driver?.label ?? "Belum ditetapkan",
              tripNo,
              // Same reasoning as `patchRow`: a bulk move onto a (possibly new)
              // run cannot keep the old position without risking a collision.
              urutan: null,
            }
          : r,
      ),
    );
    setDirty(true);
    clearSelection();
  };

  const applyBulkJam = () => {
    if (!bulkJam || selected.size === 0) return;
    setDraft((prev) =>
      prev.map((r) => (selected.has(r.id) ? { ...r, jamPengiriman: bulkJam } : r)),
    );
    setDirty(true);
  };

  const bulkRemove = () => {
    if (!allowsManualDemand) return;
    if (selected.size === 0) return;
    setDraft((prev) => prev.filter((r) => !selected.has(r.id)));
    setDirty(true);
    clearSelection();
  };

  if (!plan) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-line bg-panel">
        <EmptyState
          icon={Truck}
          title="Pilih rencana di sebelah kiri"
          description="Atau buat rencana baru untuk tanggal pengiriman berikutnya."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border border-line bg-panel">
      <PanelHeader
        title={
          <span className="flex items-center gap-2">
            <span className="data text-xs normal-case tracking-normal text-ink">
              {plan.kode}
            </span>
            <StatusBadge variant={getStatusVariant(plan.status)} label={plan.status} />
          </span>
        }
        hint={`${formatDateLong(plan.tanggal)} · menarik kuota dari ${plan.nomorSA}`}
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={onPrint}>
              <Printer className="h-3.5 w-3.5" />
              Lembar rute
            </Button>
            {editable ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void suggest()}
                  disabled={draft.length === 0 || dirty || isSuggesting}
                  title={
                    draft.length === 0
                      ? `Tambahkan ${outletLabel()} terlebih dahulu`
                      : dirty
                        ? "Simpan draf dulu — usulan disusun dari titik singgah yang tersimpan"
                        : "Susun usulan trip; belum tersimpan sampai Anda menekan Simpan."
                  }
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Sarankan penugasan
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSaveDraft(draft)}
                  disabled={isSaving || !dirty}
                >
                  <Save className="h-3.5 w-3.5" />
                  {dirty ? "Simpan draf" : "Tersimpan"}
                </Button>
                {/*
                  Confirming is an approval, not an edit, and the backend guards
                  it with its own permission: a planner builds the day and a
                  supervisor commits the agency to it. Hidden rather than
                  disabled for someone who does not hold it -- a greyed button
                  invites them to ask why, and the answer is that this is not
                  their decision to make.
                */}
                <CanAccess permission={PERMISSIONS.DISTRIBUTION_APPROVE}>
                  <Button
                    size="sm"
                    onClick={onConfirm}
                    disabled={
                      isConfirming || sourceBlocked || draft.length === 0 || dirty || adaHambatan
                    }
                    title={
                      sourceBlocked
                        ? "Sumber SIM3LON belum siap ditinjau; perbaiki sumber sebelum konfirmasi"
                        : dirty
                        ? "Simpan draf terlebih dahulu"
                        : adaHambatan
                          ? "Selesaikan hambatan di atas sebelum konfirmasi"
                          : "Kunci rencana dan serahkan ke dispatch"
                    }
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Konfirmasi
                  </Button>
                </CanAccess>
                {/* Cancelling preserves the record and releases eligible draft reservations. */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onCancelPlan}
                  className="hover:bg-rust-soft hover:text-rust-ink"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Hapus draf
                </Button>
              </>
            ) : plan.status === "Terkonfirmasi" ? (
              <Button variant="outline" size="sm" onClick={onCancelPlan}>
                <XCircle className="h-3.5 w-3.5" />
                Batalkan
              </Button>
            ) : null}
          </>
        }
      />

      {/* Running totals — the ceiling the planner works against. */}
      <div className="grid grid-cols-2 divide-x divide-line border-b border-line sm:grid-cols-4">
        <Figure label="Titik singgah" value={formatNumber(draft.length)} unit={outletLabel()} />
        <Figure
          label="Total muatan"
          value={formatNumber(total)}
          unit={unitLabel()}
          tone={overQuota ? "rust" : undefined}
        />
        <Figure
          label="Sisa kuota SA"
          value={formatNumber(
            Math.max(0, plan.sisaKuotaSA - (editable ? belumTersimpan : 0)),
          )}
          unit={unitLabel()}
          tone={overQuota ? "rust" : undefined}
        />
        <Figure label="Trip" value={formatNumber(trips.length)} unit="rit" />
      </div>

      {/* What the last proposal could not place, and what it was based on.
          Both are stated rather than implied: a suggestion that quietly drops
          a stop is worse than none, and one that implies it minimised driving
          when it did not is worse still. */}
      {editable && dasar && (
        <div className="border-b border-line bg-panel-sunk px-5 py-2.5">
          <p className="text-xs text-ink-muted">{dasar}</p>
          {unroutable.length > 0 && (
            <ul className="mt-2 space-y-1">
              {unroutable.map((u) => {
                // The backend's own wording for a stop with no coordinates --
                // see `ReasonNoLocation` in `usecase/dispatch/entities.go`.
                // Matched by substring rather than exact equality: the point is
                // to offer the fix for the one reason a person can act on from
                // here, not to fail silently the day the copy is reworded.
                const noCoordinates = u.alasan.toLowerCase().includes("coordinates");
                return (
                  <li key={u.outletId} className="flex items-baseline gap-2 text-xs">
                    <TriangleAlert className="h-3 w-3 shrink-0 translate-y-0.5 text-rust-ink" />
                    <span className="text-ink">{u.outlet}</span>
                    <span className="data text-2xs text-ink-muted">
                      {formatNumber(u.jumlahUnit)} {unitLabel()}
                    </span>
                    <span className="text-ink-muted">— {u.alasan}</span>
                    {noCoordinates && (
                      // The path segment is always the literal "outlet", not
                      // this tenant's word for it: the router's routes are
                      // built once at module load, before the tenant's
                      // vocabulary hydrates, so `outletLabel()` here would
                      // read a word the registered route never used. See
                      // OutletListPage.tsx's own "/outlet/new" link.
                      <Link
                        to={`/outlet/${u.outletId}/edit`}
                        className="text-signal-ink underline underline-offset-2"
                      >
                        Petakan {outletLabel()} ini
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Blockers, stated as what to do about them. */}
      {editable && adaHambatan && (
        <ul className="divide-y divide-line border-b border-line">
          {overQuota && (
            <Blocker>
              Muatan melebihi sisa kuota {plan.nomorSA} sebanyak{" "}
              <span className="data">
                {formatNumber(belumTersimpan - plan.sisaKuotaSA)}
              </span>{" "}
              {unitLabel()}. Kurangi jumlah, atau aktifkan agreement lain di{" "}
              <Link to="/sa" className="font-semibold text-ink underline decoration-signal decoration-2 underline-offset-2">
                Schedule Agreement
              </Link>
              .
            </Blocker>
          )}
          {overloaded.map((t) => (
            <Blocker key={t.key}>
              {t.driver?.label ?? "Driver"} pada trip{" "}
              <span className="data">{t.tripNo}</span> membawa{" "}
              <span className="data">{formatNumber(t.muatan)}</span> {unitLabel()},
              melebihi kapasitas{" "}
              <span className="data">{formatNumber(t.kapasitas)}</span>. Pindahkan
              sebagian titik ke armada lain, atau ke trip berikutnya.
            </Blocker>
          ))}
          {tanpaProduk.length > 0 && (
            <Blocker>
              {tanpaProduk.length} titik punya baris muatan tanpa produk. Pilih
              produknya agar tagihan dapat dihitung.
            </Blocker>
          )}
          {unassigned.length > 0 && (
            <Blocker>
              {unassigned.length} titik belum punya driver. Tetapkan armada sebelum
              konfirmasi.
            </Blocker>
          )}
          {kreditDiblokir.map((r) => (
              <Blocker key={`kredit-${r.id}`}>
                {r.outlet} diblokir karena kredit. {r.alasanBlokir} Selesaikan
                tagihan di{" "}
                <Link
                  to="/receivables"
                  className="font-semibold text-ink underline decoration-signal decoration-2 underline-offset-2"
                >
                  Piutang
                </Link>
                , atau naikkan plafon pada data {outletLabel()}.
            </Blocker>
          ))}
        </ul>
      )}

      {/*
        Bulk-assign bar — one driver/trip or one delivery hour applied to
        every checked stop at once. Typing the same driver into fifteen rows
        one at a time is exactly the input cost this exists to cut; the
        per-row controls stay underneath for the stop that needs its own
        answer.
      */}
      {editable && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-signal-soft/40 px-5 py-2.5">
          <span className="text-xs font-semibold text-ink">
            {selected.size} titik dipilih
          </span>

          <span className="mx-1 h-4 w-px bg-line" aria-hidden />

          <SelectInput
            aria-label="Driver untuk titik terpilih"
            className="h-8 w-44 py-1.5 text-xs"
            value={bulkDriverId}
            onChange={(e) => setBulkDriverId(e.target.value)}
          >
            <option value="">Pilih driver</option>
            {driverOptions.map((d) => (
              <option key={d.id} value={d.id} disabled={d.disabled}>
                {d.label} — {d.sublabel}
                {d.disabled ? " (cuti)" : ""}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            aria-label="Trip untuk titik terpilih"
            className="h-8 w-24 py-1.5 text-xs"
            value={bulkTripNo}
            onChange={(e) => setBulkTripNo(e.target.value)}
          >
            {Array.from({ length: MAX_TRIP }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                Trip {n}
              </option>
            ))}
          </SelectInput>
          <Button
            size="sm"
            variant="outline"
            disabled={!bulkDriverId}
            onClick={applyBulkDriver}
          >
            Tetapkan
          </Button>

          <span className="mx-1 h-4 w-px bg-line" aria-hidden />

          <TextInput
            type="time"
            mono
            aria-label="Jam pengiriman untuk titik terpilih"
            className="h-8 w-28 py-1.5 text-xs"
            value={bulkJam}
            onChange={(e) => setBulkJam(e.target.value)}
          />
          <Button size="sm" variant="outline" disabled={!bulkJam} onClick={applyBulkJam}>
            Atur jam
          </Button>

          <span className="mx-1 h-4 w-px bg-line" aria-hidden />

          <Button
            size="sm"
            variant="ghost"
            className="hover:bg-rust-soft hover:text-rust-ink"
            onClick={bulkRemove}
            disabled={!allowsManualDemand}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Hapus
          </Button>

          <Button size="sm" variant="ghost" className="ml-auto" onClick={clearSelection}>
            Batal pilih
          </Button>
        </div>
      )}

      {/* Stop list */}
      <div className="flex-1 overflow-x-auto">
        {isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : draft.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="Rencana ini belum punya titik singgah"
            description={allowsManualDemand ? `Tambahkan ${outletLabel()} satu per satu, atau tarik pesanan yang sudah disetujui dari halaman Pesanan ${outletLabelTitle()}.` : "Tinjau alokasi SIM3LON untuk tanggal ini. Sumber gagal atau belum lengkap tidak boleh diganti dengan demand manual."}
            action={
              editable && allowsManualDemand && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={addRow}>
                    <Plus className="h-3.5 w-3.5" />
                    Tambah {outletLabel()}
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/orders">Lihat pesanan</Link>
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-panel-sunk">
                {editable && (
                  <th className="px-3 py-2.5" style={{ width: "2.5rem" }}>
                    <Checkbox
                      aria-label="Pilih semua titik"
                      checked={allSelected}
                      onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                    />
                  </th>
                )}
                <th className="label px-5 py-2.5 text-2xs text-ink-muted">{outletLabelTitle()}</th>
                <th className="label px-3 py-2.5 text-2xs text-ink-muted" style={{ width: "6.5rem" }}>
                  Jam
                </th>
                <th className="label px-3 py-2.5 text-2xs text-ink-muted" style={{ width: "19rem" }}>
                  Muatan
                </th>
                <th className="label px-3 py-2.5 text-2xs text-ink-muted" style={{ width: "14rem" }}>
                  Driver / armada
                </th>
                <th className="label px-3 py-2.5 text-2xs text-ink-muted" style={{ width: "8rem" }}>
                  Kredit
                </th>
                {editable && <th style={{ width: "1%" }} />}
              </tr>
            </thead>
            <tbody>
              {trips.map((trip) => (
                <Fragment key={trip.key}>
                  <TripHeader
                    trip={trip}
                    colSpan={editable ? 7 : 5}
                    editable={editable}
                    vehicleOptions={vehicleOptions}
                    vehicleUsage={vehicleUsage}
                    onVehicleChange={setTripVehicle}
                    onDispatchTrip={onDispatchTrip}
                    isDispatching={
                      !!trip.tripId && trip.tripId === dispatchingTripId
                    }
                  />
                  {trip.rows.map((row, i) => (
                    <StopRow
                      key={row.id}
                      row={row}
                      editable={editable}
                      editableDemand={editable && allowsManualDemand}
                      over={trip.muatan > trip.kapasitas}
                      driverOptions={driverOptions}
                      productOptions={productOptions}
                      patchRow={patchRow}
                      patchLines={patchLines}
                      removeRow={removeRow}
                      selected={selected.has(row.id)}
                      onToggleSelected={toggleSelected}
                      position={i + 1}
                      canMoveUp={i > 0}
                      canMoveDown={i < trip.rows.length - 1}
                      onMove={move}
                    />
                  ))}
                </Fragment>
              ))}

              {/* Stops nobody is carrying, last and named as such. A stop that
                  simply vanished from the board is one the pangkalan telephones
                  about. */}
              {unassigned.length > 0 && (
                <Fragment>
                  <tr className="border-b border-line bg-panel-sunk">
                    <td colSpan={editable ? 7 : 5} className="px-5 py-2">
                      <span className="label text-2xs text-rust-ink">
                        Belum ditugaskan · {unassigned.length} titik ·{" "}
                        {formatNumber(unassigned.reduce((s, r) => s + r.jumlahUnit, 0))}{" "}
                        {unitLabel()}
                      </span>
                    </td>
                  </tr>
                  {unassigned.map((row) => (
                    <StopRow
                      key={row.id}
                      row={row}
                      editable={editable}
                      editableDemand={editable && allowsManualDemand}
                      over={false}
                      driverOptions={driverOptions}
                      productOptions={productOptions}
                      patchRow={patchRow}
                      patchLines={patchLines}
                      removeRow={removeRow}
                      selected={selected.has(row.id)}
                      onToggleSelected={toggleSelected}
                    />
                  ))}
                </Fragment>
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
        {editable && allowsManualDemand ? (
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" />
            Tambah {outletLabel()}
          </Button>
        ) : (
          <p className="flex items-center gap-2 text-xs text-ink-muted">
            <Lock className="h-3.5 w-3.5" />
            {editable
              ? "Alokasi mengikuti SIM3LON; kuantitas tidak diedit manual. Atur armada dan rute sebelum konfirmasi."
              : plan.status === "Batal"
              ? "Rencana dibatalkan. Kuota sudah dikembalikan ke agreement."
              : `Dikonfirmasi oleh ${plan.dikonfirmasiOleh ?? "—"}. Titik singgah tidak dapat diubah di sini; surat jalan diterbitkan saat trip diberangkatkan.`}
          </p>
        )}
        {dirty && editable && (
          <p className="text-xs font-medium text-signal-ink">
            Ada perubahan yang belum disimpan.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * What one stop carries, per product.
 *
 * The planner used to type a single number here and the API guessed which
 * product it meant — fine while everything was 3 kg cylinders, wrong the moment
 * a round carries two sizes at very different prices. A stop is a set of lines,
 * so this edits lines.
 */
function LoadEditor({
  row,
  products,
  onChange,
}: {
  row: PlanRow;
  products: { id: string; label: string; satuan: string }[];
  onChange: (lines: PlanRow["lines"]) => void;
}) {
  const used = new Set(row.lines.map((l) => l.productId));
  const spare = products.find((p) => !used.has(p.id));

  return (
    <div className="space-y-1.5">
      {row.lines.map((line, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <SelectInput
            aria-label={`Produk baris ${i + 1} untuk ${row.outlet}`}
            className="min-w-0 flex-1 py-1.5 text-xs"
            value={line.productId}
            invalid={!line.productId}
            onChange={(e) =>
              onChange(
                row.lines.map((l, li) =>
                  li === i ? { ...l, productId: e.target.value } : l,
                ),
              )
            }
          >
            <option value="">Pilih produk</option>
            {products.map((p) => (
              <option key={p.id} value={p.id} disabled={used.has(p.id) && p.id !== line.productId}>
                {p.label}
              </option>
            ))}
          </SelectInput>

          <TextInput
            type="number"
            min={1}
            step="any"
            mono
            aria-label={`Jumlah baris ${i + 1} untuk ${row.outlet}`}
            className="w-20 shrink-0 py-1.5 text-right text-xs"
            value={line.jumlah}
            onChange={(e) =>
              onChange(
                row.lines.map((l, li) =>
                  li === i ? { ...l, jumlah: Math.max(0, Number(e.target.value)) } : l,
                ),
              )
            }
          />

          {/* The last line stays: a stop with nothing on it is not a stop. */}
          {row.lines.length > 1 && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Hapus baris ${i + 1}`}
              onClick={() => onChange(row.lines.filter((_, li) => li !== i))}
              className="shrink-0 hover:bg-rust-soft hover:text-rust-ink"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        {spare ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => onChange([...row.lines, { productId: spare.id, jumlah: 10 }])}
          >
            <Plus className="h-3 w-3" />
            Produk
          </Button>
        ) : (
          <span />
        )}
        <span className="data text-2xs font-semibold text-ink">
          {formatNumber(row.jumlahUnit)}
        </span>
      </div>
    </div>
  );
}

/** The same load, once the plan is frozen. */
function LoadSummary({
  row,
  products,
}: {
  row: PlanRow;
  products: { id: string; label: string; satuan: string }[];
}) {
  return (
    <div className="space-y-0.5">
      {row.lines.map((line, i) => {
        const p = products.find((x) => x.id === line.productId);
        return (
          <p key={i} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-ink-muted">
              {p?.label ?? "Produk tidak dikenal"}
            </span>
            <span className="data shrink-0 font-semibold text-ink">
              {formatNumber(line.jumlah)}
            </span>
          </p>
        );
      })}
    </div>
  );
}

function Figure({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  tone?: "rust";
}) {
  return (
    <div className="px-5 py-3">
      <p className="label text-2xs text-ink-muted">{label}</p>
      <p
        className={cn(
          "data mt-0.5 text-lg font-semibold",
          tone === "rust" ? "text-rust-ink" : "text-ink",
        )}
      >
        {value}
        <span className="ml-1 font-sans text-2xs font-medium tracking-normal text-ink-muted">
          {unit}
        </span>
      </p>
    </div>
  );
}

function Blocker({ children }: { children: React.ReactNode }) {
  return (
    <li className="spine flex items-start gap-2.5 bg-rust-soft/40 px-5 py-2.5 text-rust">
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rust-ink" />
      <p className="text-xs leading-relaxed text-ink">{children}</p>
    </li>
  );
}

/**
 * One stop, wherever it sits.
 *
 * Shared by the trip groups and the unassigned list so a row cannot drift into
 * looking different depending on whether anyone has been given it to carry.
 */
function StopRow({
  row,
  editable,
  editableDemand,
  over,
  driverOptions,
  productOptions,
  patchRow,
  patchLines,
  removeRow,
  selected,
  onToggleSelected,
  position,
  canMoveUp,
  canMoveDown,
  onMove,
}: {
  row: PlanRow;
  editable: boolean;
  editableDemand: boolean;
  /** True when the trip this row sits on is over its truck's capacity. */
  over: boolean;
  driverOptions: DriverOption[];
  productOptions: { id: string; label: string; satuan: string }[];
  patchRow: (id: string, patch: Partial<PlanRow>) => void;
  patchLines: (id: string, lines: PlanRow["lines"]) => void;
  removeRow: (id: string) => void;
  selected?: boolean;
  onToggleSelected?: (id: string, checked: boolean) => void;
  /** This stop's place in its run, 1-based. Absent on the unassigned list. */
  position?: number;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMove?: (id: string, direction: -1 | 1) => void;
}) {
  const driver = driverOptions.find((d) => d.id === row.driverId);

  return (
      <tr className={cn("border-b border-line last:border-b-0", selected && "bg-signal-soft/30")}>
        {editable && (
          <td className="px-3 py-2.5">
            <Checkbox
              aria-label={`Pilih ${row.outlet}`}
              checked={!!selected}
              onCheckedChange={(checked) => onToggleSelected?.(row.id, checked === true)}
            />
          </td>
        )}
        <td className="px-5 py-2.5">
          <div className="flex items-start gap-2">
            {position != null && (
              <span className="data mt-0.5 flex h-5 min-w-5 shrink-0 items-center justify-center rounded bg-panel-sunk px-1 text-2xs font-semibold text-ink-muted">
                {position}
              </span>
            )}
            {editable && onMove && (
              <div className="mt-0.5 flex shrink-0 flex-col">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Naikkan ${row.outlet}`}
                  disabled={!canMoveUp}
                  onClick={() => onMove(row.id, -1)}
                  className="h-4 w-4"
                >
                  <ChevronUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Turunkan ${row.outlet}`}
                  disabled={!canMoveDown}
                  onClick={() => onMove(row.id, 1)}
                  className="h-4 w-4"
                >
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </div>
            )}
            <div>
              <span className="block text-sm font-medium text-ink">
                {row.outlet}
              </span>
              <span className="block text-xs text-ink-muted">{row.alamat}</span>
            </div>
          </div>
        </td>

        <td className="px-3 py-2.5">
          {editable ? (
            // The service plans a delivery date, not a clock time to type in
            // -- this cell shows the board's own ETA estimate (or "—" before
            // one exists) rather than an input nothing here persists. See
            // distributionApi.http.ts's own note on jamPengiriman.
            <span className="data text-sm text-ink-muted">
              {row.jamPengiriman === "—" ? "—" : `± ${row.jamPengiriman}`}
            </span>
          ) : (
            <span className="data text-sm text-ink">{row.jamPengiriman}</span>
          )}
        </td>

        <td className="px-3 py-2.5">
          {editableDemand ? (
            <LoadEditor
              row={row}
              products={productOptions}
              onChange={(lines) => patchLines(row.id, lines)}
            />
          ) : (
            <LoadSummary row={row} products={productOptions} />
          )}
        </td>

        <td className="px-3 py-2.5">
          {editable ? (
            <>
              <SelectInput
                aria-label={`Driver untuk ${row.outlet}`}
                value={row.driverId ?? ""}
                invalid={!row.driverId || over}
                onChange={(e) =>
                  patchRow(row.id, {
                    driverId: e.target.value || null,
                    driver:
                      driverOptions.find((d) => d.id === e.target.value)
                        ?.label ?? "Belum ditetapkan",
                  })
                }
              >
                <option value="">Belum ditetapkan</option>
                {driverOptions.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.disabled}>
                    {d.label} — {d.sublabel}
                    {d.disabled ? " (cuti)" : ""}
                  </option>
                ))}
              </SelectInput>
              {/* Which of that driver's runs this stop rides on. Only shown
                  once there is a driver: a trip number with nobody to drive it
                  is not an assignment, and the grouping has nowhere to put it. */}
              {driver && (
                <SelectInput
                  aria-label={`Trip untuk ${row.outlet}`}
                  className="mt-1 py-1.5 text-xs"
                  value={String(tripOf(row))}
                  invalid={over}
                  onChange={(e) => patchRow(row.id, { tripNo: Number(e.target.value) })}
                >
                  {Array.from({ length: MAX_TRIP }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      Trip {n}
                    </option>
                  ))}
                </SelectInput>
              )}
            </>
          ) : (
            <>
              <span className="block text-sm text-ink">{row.driver}</span>
              {driver && (
                <span className="data block text-2xs text-ink-muted">
                  {driver.sublabel}
                </span>
              )}
            </>
          )}
        </td>

        <td className="px-3 py-2.5">
          <StatusBadge
            variant={row.alasanBlokir ? "danger" : "success"}
            label={row.alasanBlokir ? "Diblokir" : "Lancar"}
          />
          {row.piutang > 0 && (
            <span className="data mt-1 block text-2xs text-ink-muted">
              piutang {formatNumber(Math.round(row.piutang / 1000))} rb
            </span>
          )}
          {/* Payment standing for THIS stop, distinct from the credit-exposure
              badge above -- an outlet can be "Lancar" overall and still have
              this delivery unpaid, or be on approved credit terms for it. */}
          {row.statusBayar !== "Lunas" && (
            <span
              className={cn(
                "mt-1 block text-2xs",
                row.statusBayar === "Kredit" ? "text-ink-muted" : "text-warning",
              )}
            >
              {row.statusBayar === "Kredit" ? "Kredit disetujui" : "Belum dialokasikan"}
            </span>
          )}
        </td>

        {editable && (
          <td className="px-3 py-2.5">
            {editableDemand ? <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Hapus ${row.outlet} dari rencana`}
              onClick={() => removeRow(row.id)}
              className="hover:bg-rust-soft hover:text-rust-ink"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button> : null}
          </td>
        )}
      </tr>
  );
}

/**
 * The strip above one trip's stops: who drives it, and how full the truck is.
 *
 * The load bar lives here rather than on each row because a truckload is a
 * property of the trip. Repeating it per row invited the reading that each stop
 * had its own capacity, and made an overload look like several problems.
 */
function TripHeader({
  trip,
  colSpan,
  editable,
  vehicleOptions,
  vehicleUsage,
  onVehicleChange,
  onDispatchTrip,
  isDispatching,
}: {
  trip: TripGroup;
  colSpan: number;
  editable: boolean;
  vehicleOptions: VehicleOption[];
  /** Which trip already has each truck out — see the doc comment where this is built. */
  vehicleUsage: Map<string, TripGroup>;
  onVehicleChange: (tripKey: string, vehicleId: string) => void;
  onDispatchTrip?: (tripId: string, rows: PlanRow[]) => void;
  isDispatching?: boolean;
}) {
  const over = trip.muatan > trip.kapasitas;
  // Only a confirmed plan has a real trip to dispatch, and only once, not
  // twice — "dispatched" is the one status this button hides itself for; any
  // other value (or none, on a build that cannot yet say) still offers it,
  // since the service's own guard is what actually refuses a second attempt.
  const canDispatch =
    !editable && !!trip.tripId && trip.tripStatus !== "dispatched" && onDispatchTrip;

  return (
    <tr className="border-b border-line bg-panel-sunk">
      <td colSpan={colSpan} className="px-5 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="label text-2xs text-ink-muted">Trip {trip.tripNo}</span>
          <span className="text-sm font-medium text-ink">
            {trip.driver?.label ?? "Driver tidak dikenal"}
          </span>
          {trip.driver?.sublabel && (
            <span className="data text-2xs text-ink-muted">{trip.driver.sublabel}</span>
          )}
          {/* An estimate, not something set here -- see PlanRow.berangkat's
              own doc comment on where it comes from. */}
          {trip.berangkat && (
            <span className="data text-2xs text-ink-muted">
              Berangkat ± {trip.berangkat}
            </span>
          )}

          {/*
            The truck, chosen once for the whole run.
            It sits here rather than on each stop because a run has one vehicle:
            offering it per row would let two stops on the same trip disagree
            about what is carrying them, and the service would refuse the board
            with no way to say which row was wrong. Choosing here patches every
            stop on the trip.

            It is required, not decorative. `dispatch_trips.vehicle_id` is NOT
            NULL, so a run without a truck cannot be committed at all — which is
            why an unchosen one is called out rather than left blank.
          */}
          {editable ? (
            <SelectInput
              aria-label={`Armada trip ${trip.tripNo}`}
              className={cn(
                "data h-8 w-64 text-xs font-semibold",
                !trip.vehicleId && "border-rust",
              )}
              value={trip.vehicleId ?? ""}
              onChange={(e) => onVehicleChange(trip.key, e.target.value)}
            >
              <option value="">Pilih armada</option>
              {vehicleOptions.map((v) => {
                const usedByTrip = vehicleUsage.get(v.id);
                const usedByOther = !!usedByTrip && usedByTrip.driverId !== trip.driverId;
                // Capacity is not repeated here — the load meter beside this
                // picker already states it against this trip's own muatan.
                return (
                  <option key={v.id} value={v.id} disabled={usedByOther}>
                    {v.label} — {v.sublabel}
                    {usedByOther
                      ? ` (dipakai ${usedByTrip.driver?.label ?? "trip lain"})`
                      : ""}
                  </option>
                );
              })}
            </SelectInput>
          ) : (
            <span className="data text-xs font-medium text-ink-muted">
              {trip.vehicle?.label ?? "Armada tidak ditetapkan"}
            </span>
          )}

          {canDispatch && (
            <CanAccess permission={PERMISSIONS.DELIVERIES_CREATE}>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-2xs"
                disabled={isDispatching}
                onClick={() => onDispatchTrip(trip.tripId!, trip.rows)}
              >
                <Truck className="h-3.5 w-3.5" />
                Berangkatkan
              </Button>
            </CanAccess>
          )}

          <span className="ml-auto flex items-center gap-2">
            {trip.berisiko > 0 && (
              <span className="label text-2xs text-signal-ink">
                {formatNumber(trip.berisiko)} {unitLabel()} belum dibayar
              </span>
            )}
            <span
              className={cn(
                "data text-2xs font-semibold",
                over ? "text-rust-ink" : "text-ink-muted",
              )}
            >
              {formatNumber(trip.muatan)} / {formatNumber(trip.kapasitas)}
            </span>
          </span>

          <Meter
            className="w-full"
            value={trip.muatan}
            max={Math.max(trip.kapasitas, trip.muatan)}
            tone={over ? "rust" : "pine"}
            label={`Muatan trip ${trip.tripNo}`}
          />
        </div>
      </td>
    </tr>
  );
}
