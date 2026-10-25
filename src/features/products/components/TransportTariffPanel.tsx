/**
 * A product's transport-fee rates: what Pertamina pays per kg of LPG the
 * agent loads (the BA LO, Rp 354,64/kg in March 2026), or per tabung where a
 * rate is set that way, from a date. A new rate closes the open one the day
 * before it starts; a rate is a fact about a period, so rows are never edited.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { createTariff, getTariffs } from "@/features/products/api/productApi";
import { formatTariff, type RateBasis } from "@/features/transportation/lib/rate";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { Field, SegmentedControl, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { formatDateId } from "@/lib/format";
import { unitLabel } from "@/lib/lexicon";
import { scopeKey } from "@/lib/scope";
import { todayIso } from "@/features/financereports/lib/period";

export function TransportTariffPanel({
  productId,
  fixedBasis,
  className = "mt-4",
}: {
  productId: string;
  /** Pengaturan sets the BA LO's rate, which is always per kg. */
  fixedBasis?: RateBasis;
  className?: string;
}) {
  const tariffs = useQuery({
    queryKey: [...scopeKey(), "products", productId, "tariffs"],
    queryFn: () => getTariffs(productId),
  });
  const [chosenBasis, setBasis] = useState<RateBasis>("per_kg");
  const basis = fixedBasis ?? chosenBasis;
  const [rate, setRate] = useState("");
  const [from, setFrom] = useState(todayIso);
  const [reference, setReference] = useState("");

  const save = useDeskMutation({
    mutationFn: () => createTariff(productId, { rateBasis: basis, rate: Number(rate), effectiveFrom: from, principalReference: reference }),
    errorTitle: "Tarif tidak tersimpan",
    success: (t) => ({ title: `Tarif ${formatTariff(t.rate, t.rateBasis)} berlaku ${formatDateId(t.effectiveFrom)}` }),
    onDone: () => {
      setRate("");
      setReference("");
    },
  });

  return (
    <Panel className={className}>
      {!fixedBasis && (
        <PanelHeader
          title="Tarif transport fee"
          hint={`Dipakai klaim transport fee (BA LO): kg × tarif per kg, berlaku per tanggal LO. Tarif per ${unitLabel()} hanya untuk klaim dari surat jalan.`}
        />
      )}
      {tariffs.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (tariffs.data ?? []).length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-muted">Belum ada tarif. Klaim transport fee untuk produk ini belum bisa dihitung.</p>
      ) : (
        <ul className="divide-y divide-line">
          {(tariffs.data ?? []).map((t) => (
            <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
              <span className="data font-semibold text-ink">{formatTariff(t.rate, t.rateBasis)}</span>
              <span className="text-xs text-ink-muted">
                {formatDateId(t.effectiveFrom)} – {t.effectiveUntil ? formatDateId(t.effectiveUntil) : "seterusnya"}
                {t.principalReference ? ` · ${t.principalReference}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      <CanAccess permission={PERMISSIONS.TRANSPORT_TARIFFS_CREATE}>
        <div className="flex flex-wrap items-end gap-3 border-t border-line p-4">
          {!fixedBasis && (
            <Field label="Dasar tarif" htmlFor="tt-basis">
              <SegmentedControl<RateBasis>
                value={basis}
                onChange={setBasis}
                options={[{ value: "per_kg", label: "Per kg" }, { value: "per_unit", label: `Per ${unitLabel()}` }]}
              />
            </Field>
          )}
          <Field label={`Tarif (Rp/${basis === "per_kg" ? "kg" : unitLabel()})`} htmlFor="tt-rate">
            <TextInput id="tt-rate" type="number" min={0} step="any" mono className="w-36" value={rate} onChange={(e) => setRate(e.target.value)} />
          </Field>
          <Field label="Berlaku mulai" htmlFor="tt-from">
            <TextInput id="tt-from" type="date" className="w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Dasar (surat/SK)" htmlFor="tt-ref">
            <TextInput id="tt-ref" className="w-48" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Opsional" />
          </Field>
          <Button type="button" disabled={!(Number(rate) > 0) || !from || save.isPending} onClick={() => save.mutate(undefined as never)}>
            <Plus className="h-4 w-4" /> Simpan tarif
          </Button>
        </div>
      </CanAccess>
    </Panel>
  );
}
