import { scopeKey } from "@/lib/scope";
import { useResettableState } from "@/hooks/useResettableState";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock } from "lucide-react";
import { getSystemConfig, saveOperations } from "@/features/system/api/systemApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { Field, TextInput, Toggle } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OperationsEntity } from "@/types/domain";
import { outletLabel } from "@/lib/lexicon";

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/* ── operations ────────────────────────────────────────────────────────── */

export function OperationsSection() {
  const config = useQuery({ queryKey: [...scopeKey(), "system-config"], queryFn: getSystemConfig });
  const [form, setForm] = useResettableState<OperationsEntity | null>([config.data], () =>
    config.data ? { ...config.data.operasi } : null,
  );

  const saveMutation = useDeskMutation({
    mutationFn: (values: OperationsEntity) => saveOperations(values),
    errorTitle: "Jadwal operasi tidak tersimpan",
    success: "Jadwal operasi disimpan",
  });

  const dirty =
    !!form && !!config.data && JSON.stringify(form) !== JSON.stringify(config.data.operasi);

  if (!form) return <Skeleton className="h-64 w-full" />;

  const toggleDay = (day: number) =>
    setForm({
      ...form,
      hariKerja: form.hariKerja.includes(day)
        ? form.hariKerja.filter((d) => d !== day)
        : [...form.hariKerja, day].sort(),
    });

  return (
    <Panel>
      <PanelHeader
        title="Jadwal operasi"
        hint="Dipakai perencanaan distribusi dan papan berangkat"
        actions={
          dirty && (
            <>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => config.data && setForm({ ...config.data.operasi })}
              >
                Urungkan
              </Button>
              <Button
                size="xs"
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending}
              >
                Simpan
              </Button>
            </>
          )
        }
      />
      <PanelBody className="space-y-5">
        <div>
          <p className="label mb-2 text-2xs text-ink-muted">Hari kerja</p>
          <div className="flex flex-wrap gap-1.5">
            {HARI.map((nama, day) => {
              const on = form.hariKerja.includes(day);
              return (
                <button
                  key={nama}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    "rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors",
                    on
                      ? "border-ink bg-ink text-ink-on"
                      : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  {nama}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            Rencana distribusi tidak dibuat untuk hari yang tidak dipilih.
          </p>
        </div>

        <div className="border-t border-line">
          <Toggle
            label="Rekam lokasi saat sopir mencatat pengiriman"
            description="Titik koordinat diambil hanya pada saat tombol ditekan, bukan sepanjang hari. Pengiriman tetap dapat dicatat bila GPS tidak aktif."
            checked={form.rekamLokasi}
            onChange={(rekamLokasi) => setForm({ ...form, rekamLokasi })}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {form.rekamLokasi && (
            <Field
              label={`Radius wajar dari ${outletLabel()}`}
              htmlFor="ops-radius"
              hint="Penutupan surat jalan di luar radius ini ditandai di Monitoring. Meter."
            >
              <TextInput
                id="ops-radius"
                type="number"
                mono
                min={50}
                max={5000}
                step="any"
                value={form.radiusGeofenceMeter}
                onChange={(e) =>
                  setForm({ ...form, radiusGeofenceMeter: Number(e.target.value) })
                }
              />
            </Field>
          )}
          <Field
            label="Durasi singgah"
            htmlFor="ops-durasi"
            hint={`Perjalanan dan bongkar per ${outletLabel()}. Menentukan lebar balok pada papan berangkat.`}
          >
            <TextInput
              id="ops-durasi"
              type="number"
              mono
              min={15}
              max={240}
              step="any"
              value={form.durasiSinggahMenit}
              onChange={(e) =>
                setForm({ ...form, durasiSinggahMenit: Number(e.target.value) })
              }
            />
          </Field>
          <Field
            label="Jangkauan perencanaan"
            htmlFor="ops-lead"
            hint="Sejauh berapa hari ke depan rencana boleh dibuat."
          >
            <TextInput
              id="ops-lead"
              type="number"
              mono
              min={1}
              max={90}
              value={form.leadTimeHari}
              onChange={(e) => setForm({ ...form, leadTimeHari: Number(e.target.value) })}
            />
          </Field>
        </div>

        <p className="flex items-start gap-2.5 rounded-md border border-line bg-panel-sunk px-4 py-3 text-xs leading-relaxed text-ink-muted">
          <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Jam buka dan tutup diatur terpisah di Pengaturan, karena keduanya juga
          menentukan rentang waktu pada papan berangkat.
        </p>
      </PanelBody>
    </Panel>
  );
}
