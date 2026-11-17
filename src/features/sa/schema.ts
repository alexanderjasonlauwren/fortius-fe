import { z } from "zod";
import { supplierLabel, unitLabel } from "@/lib/lexicon";

// Messages that name the tenant's own words are functions, read when a field
// fails: at module load the tenant's settings have not arrived, and the form
// said "unit" to an agency that counts "tabung" (Round 1 G27).
export const uploadSASchema = z.object({
  nomorSA: z.string().min(1, "Nomor SA wajib diisi"),
  supplier: z.string().min(1, { error: () => `${supplierLabel()} wajib dipilih` }),
  periodeMulai: z.string().min(1, "Periode mulai wajib diisi"),
  periodeBerakhir: z.string().min(1, "Periode berakhir wajib diisi"),
  // The product the quota is for (Round 1 G18: a manual SA carried no
  // product, so its quota was never recorded).
  produkId: z.string().min(1, "Produk wajib dipilih"),
  totalKuota: z
    .number({
      // An empty number field reaches here as undefined or NaN: that is a
      // missing quota, not a malformed one.
      error: (issue) =>
        issue.input === undefined || issue.input === "" || Number.isNaN(issue.input)
          ? "Kuota wajib diisi"
          : "Kuota harus berupa angka",
    })
    .min(1, { error: () => `Kuota minimal 1 ${unitLabel()}` }),
  notes: z.string().optional(),
});

export type UploadSAFormValues = z.infer<typeof uploadSASchema>;
