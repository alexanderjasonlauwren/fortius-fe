import { scopeKey } from "@/lib/scope";
import { useQuery } from "@tanstack/react-query";
import { getSystemConfig } from "@/features/system/api/systemApi";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { Field, TextInput, Toggle } from "@/components/common/Field";
import type { NumberingEntity } from "@/types/domain";
import { outletLabel } from "@/lib/lexicon";

/**
 * Document number prefixes, read-only: `core.document_sequences` fixes them
 * when a branch is created, and there is no endpoint to change them.
 */
export function NumberingSection() {
  const config = useQuery({ queryKey: [...scopeKey(), "system-config"], queryFn: getSystemConfig });
  const form = config.data?.penomoran;

  if (!form) return <Skeleton className="h-64 w-full" />;

  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(
    today.getDate(),
  ).padStart(2, "0")}`;
  const preview = (prefix: string, seq: string) =>
    form.sertakanTanggal ? `${prefix}-${stamp}-${seq}` : `${prefix}-${seq}`;

  const fields: { key: keyof NumberingEntity; label: string; hint: string; seq: string }[] =
    [
      { key: "suratJalan", label: "Surat jalan", hint: "Dicetak dan dibawa armada.", seq: "01" },
      { key: "invoice", label: "Tagihan", hint: "Dipakai tim keuangan.", seq: "001" },
      { key: "rencana", label: "Rencana distribusi", hint: "Satu per hari pengiriman.", seq: "" },
      { key: "pesanan", label: `Pesanan ${outletLabel()}`, hint: "Permintaan masuk.", seq: "001" },
    ];

  return (
    <Panel>
      <PanelHeader
        title="Penomoran dokumen"
        hint="Awalan yang muncul di setiap tabel dan cetakan"
      />
      <PanelBody className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              htmlFor={`num-${f.key}`}
              hint={
                <>
                  {f.hint} Contoh:{" "}
                  <span className="data text-ink">
                    {preview(String(form[f.key] || "?"), f.seq || "001")}
                  </span>
                </>
              }
            >
              <TextInput id={`num-${f.key}`} mono disabled value={String(form[f.key])} readOnly />
            </Field>
          ))}
        </div>

        <div className="border-t border-line">
          <Toggle
            label="Sertakan tanggal pada nomor"
            description="Nomor urut dihitung ulang setiap hari, misalnya SJ-20260804-01. Tanpa ini, nomor berjalan terus."
            checked={form.sertakanTanggal}
            disabled
            onChange={() => {}}
          />
        </div>

        <p className="rounded-md border border-line bg-panel-sunk px-4 py-3 text-xs leading-relaxed text-ink-muted">
          Awalan diatur sistem saat cabang dibuat dan tidak bisa diubah di sini. Nilai di atas adalah yang dipakai.
        </p>
      </PanelBody>
    </Panel>
  );
}
