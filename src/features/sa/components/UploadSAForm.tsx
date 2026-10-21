import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload } from "lucide-react";
import {
  Field,
  FileDrop,
  TextInput,
  TextareaInput,
} from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { uploadSASchema, type UploadSAFormValues } from "../schema";
import { supplierLabel, unitLabel } from "@/lib/lexicon";

interface UploadSAFormProps {
  onSubmit: (values: UploadSAFormValues & { namaDokumen?: string }) => void;
  isPending: boolean;
  supplierOptions?: string[];
}

export function UploadSAForm({ onSubmit, isPending, supplierOptions }: UploadSAFormProps) {
  const [file, setFile] = useState<File | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UploadSAFormValues>({
    resolver: zodResolver(uploadSASchema),
    defaultValues: { nomorSA: "", supplier: "", periodeMulai: "", periodeBerakhir: "" },
  });

  const options = supplierOptions ?? [];

  const submit = handleSubmit((values) => {
    onSubmit({ ...values, namaDokumen: file?.name });
    reset();
    setFile(null);
  });

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Nomor SA" htmlFor="nomorSA" error={errors.nomorSA?.message} required>
        <TextInput
          id="nomorSA"
          mono
          placeholder="SA-2026-08-014"
          invalid={!!errors.nomorSA}
          {...register("nomorSA")}
        />
      </Field>

      <Field label={`${supplierLabel()} penerbit`} htmlFor="supplier" error={errors.supplier?.message} required>
        <TextInput
          id="supplier"
          list="supplier-options"
          placeholder={`Pilih atau ketik nama ${supplierLabel()} (contoh: PT Pertamina Patra Niaga)`}
          invalid={!!errors.supplier}
          {...register("supplier")}
        />
        <datalist id="supplier-options">
          {options.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="Periode mulai"
          htmlFor="periodeMulai"
          error={errors.periodeMulai?.message}
          required
        >
          {/* Controller, not register(): reset() writes the DOM directly, which
              the themed date picker cannot observe. */}
          <Controller
            control={control}
            name="periodeMulai"
            render={({ field }) => (
              <TextInput id="periodeMulai" type="date" invalid={!!errors.periodeMulai} {...field} />
            )}
          />
        </Field>
        <Field
          label="Periode berakhir"
          htmlFor="periodeBerakhir"
          error={errors.periodeBerakhir?.message}
          required
        >
          {/* Controller, not register(): reset() writes the DOM directly, which
              the themed date picker cannot observe. */}
          <Controller
            control={control}
            name="periodeBerakhir"
            render={({ field }) => (
              <TextInput id="periodeBerakhir" type="date" invalid={!!errors.periodeBerakhir} {...field} />
            )}
          />
        </Field>
      </div>

      <Field
        label="Total kuota"
        htmlFor="totalKuota"
        error={errors.totalKuota?.message}
        hint={`Jumlah ${unitLabel()} yang dialokasikan ${supplierLabel()} untuk periode ini.`}
        required
      >
        <TextInput
          id="totalKuota"
          type="number"
          min={1}
          mono
          placeholder="450000"
          invalid={!!errors.totalKuota}
          {...register("totalKuota", { valueAsNumber: true })}
        />
      </Field>

      <Field label="Dokumen SA" hint="Disimpan sebagai lampiran di arsip SA.">
        <FileDrop
          file={file}
          onFile={setFile}
          accept="application/pdf"
          hint="PDF, maksimal 10 MB"
          disabled={isPending}
        />
      </Field>

      <Field label="Catatan" htmlFor="notes" error={errors.notes?.message}>
        <TextareaInput
          id="notes"
          placeholder={`Misalnya: menunggu tanda tangan basah dari ${supplierLabel()}.`}
          {...register("notes")}
        />
      </Field>

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {isPending ? "Mengunggah…" : "Unggah SA"}
      </Button>
      <p className="text-xs leading-relaxed text-ink-muted">
        SA masuk sebagai draf. Kuota baru dapat ditarik rencana distribusi
        setelah diaktifkan.
      </p>
    </form>
  );
}
