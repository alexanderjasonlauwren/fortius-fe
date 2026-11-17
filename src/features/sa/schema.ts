import { z } from "zod";
import { supplierLabel, unitLabel } from "@/lib/lexicon";

export const uploadSASchema = z.object({
  nomorSA: z.string().min(1, "Nomor SA wajib diisi"),
  supplier: z.string().min(1, `${supplierLabel()} wajib dipilih`),
  periodeMulai: z.string().min(1, "Periode mulai wajib diisi"),
  periodeBerakhir: z.string().min(1, "Periode berakhir wajib diisi"),
  // The product the quota is for (Round 1 G18: a manual SA carried no
  // product, so its quota was never recorded).
  produkId: z.string().min(1, "Produk wajib dipilih"),
  totalKuota: z
    .number({ error: "Kuota harus berupa angka" })
    .min(1, `Kuota minimal 1 ${unitLabel()}`),
  notes: z.string().optional(),
});

export type UploadSAFormValues = z.infer<typeof uploadSASchema>;
