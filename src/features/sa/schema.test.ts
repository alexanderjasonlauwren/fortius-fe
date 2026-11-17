import { expect, it } from "vitest";

import { setLexicon } from "@/lib/lexicon";
import { uploadSASchema } from "./schema";

const valid = {
  nomorSA: "SA-1",
  supplier: "Pertamina",
  periodeMulai: "2026-11-01",
  periodeBerakhir: "2026-11-30",
  totalKuota: 100,
};

const messageFor = (values: Record<string, unknown>, field: string) =>
  uploadSASchema.safeParse(values).error?.issues.find((i) => i.path[0] === field)?.message;

// Round 1 G27: an empty quota said "Kuota harus berupa angka".
it("says an empty quota is missing, not malformed", () => {
  expect(messageFor({ ...valid, totalKuota: undefined }, "totalKuota")).toBe("Kuota wajib diisi");
  expect(messageFor({ ...valid, totalKuota: Number.NaN }, "totalKuota")).toBe("Kuota wajib diisi");
  expect(messageFor({ ...valid, totalKuota: "sepuluh" }, "totalKuota")).toBe("Kuota harus berupa angka");
});

it("names the unit in the tenant's own word, read when the field fails", () => {
  setLexicon({ satuan: "tabung" }, "tenant-sa-schema-test");
  expect(messageFor({ ...valid, totalKuota: 0 }, "totalKuota")).toBe("Kuota minimal 1 tabung");
});
