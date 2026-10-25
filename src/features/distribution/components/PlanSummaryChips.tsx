import { outletLabelTitle, unitLabelTitle } from "@/lib/lexicon";
interface PlanSummaryChipsProps {
  totalUnit: number;
  jumlahOutlet: number;
  jumlahDriver: number;
}

export function PlanSummaryChips({
  totalUnit,
  jumlahOutlet,
  jumlahDriver,
}: PlanSummaryChipsProps) {
  const chips = [
    {
      label: "Estimasi Muatan",
      value: `${totalUnit.toLocaleString("id-ID")} / 600 ${unitLabelTitle()}`,
    },
    { label: `Jumlah ${outletLabelTitle()}`, value: `${jumlahOutlet} Lokasi` },
    { label: "Total Sopir", value: `${jumlahDriver} Personel` },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className="bg-surface-container-low rounded-xl p-4"
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1">
            {chip.label}
          </p>
          <p className="text-lg font-black text-on-surface">{chip.value}</p>
        </div>
      ))}
    </div>
  );
}
