import { useQuery } from "@tanstack/react-query";
import { scopeKey } from "@/lib/scope";
import { useResettableState } from "@/hooks/useResettableState";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { Field, SelectInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  getSettlementTarget,
  saveSettlementTarget,
  type SettlementTarget,
} from "@/features/settings/api/settingsApi";

const OPTIONS: { value: SettlementTarget; label: string; hint: string }[] = [
  {
    value: "bank",
    label: "Langsung ke rekening bank",
    hint: "Saat surat jalan berangkat, pembayaran pangkalan yang dikonfirmasi SIM3LON dicatat masuk ke bank.",
  },
  {
    value: "customer_deposit",
    label: "Dari Hutang Titipan",
    hint: "Setoran pangkalan sudah dicatat sebagai titipan saat rekening koran diimpor; saat berangkat hanya dipindah ke piutang, tanpa menyentuh bank lagi.",
  },
];

/**
 * Where dispatch settles a stop nobody funded through Alokasi Dana. It used
 * to be a setting no screen showed (regression 2026-10-24 F3). A funded stop
 * is always settled from its own receipt, whichever is chosen here.
 */
export function SettlementSection() {
  const target = useQuery({ queryKey: [...scopeKey(), "settings", "settlement-target"], queryFn: getSettlementTarget });
  const [choice, setChoice] = useResettableState<SettlementTarget | null>([target.data], () => target.data?.effective ?? null);

  const saveMutation = useDeskMutation({
    mutationFn: (value: SettlementTarget) => saveSettlementTarget(value),
    errorTitle: "Cara pelunasan tidak tersimpan",
    success: "Cara pelunasan SIM3LON disimpan",
  });

  if (!target.data || !choice) return <Skeleton className="h-40 w-full" />;
  const dirty = choice !== target.data.effective;

  return (
    <Panel>
      <PanelHeader
        title="Pelunasan otomatis SIM3LON"
        hint="Untuk titik yang berangkat tanpa alokasi dana"
        actions={
          dirty && (
            <>
              <Button variant="ghost" size="xs" onClick={() => setChoice(target.data.effective)}>
                Urungkan
              </Button>
              <Button size="xs" onClick={() => saveMutation.mutate(choice)} disabled={saveMutation.isPending}>
                Simpan
              </Button>
            </>
          )
        }
      />
      <PanelBody className="space-y-3">
        <Field
          label="Uang pangkalan diambil dari"
          htmlFor="settlement-target"
          hint={OPTIONS.find((o) => o.value === choice)?.hint}
        >
          <SelectInput
            id="settlement-target"
            value={choice}
            onChange={(e) => setChoice(e.target.value as SettlementTarget)}
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <p className="text-2xs text-ink-muted">
          Titik yang sudah dialokasikan dananya selalu dilunasi dari penerimaannya sendiri.
          {target.data.own === null && " Saat ini mengikuti pengaturan bawaan."}
        </p>
      </PanelBody>
    </Panel>
  );
}
