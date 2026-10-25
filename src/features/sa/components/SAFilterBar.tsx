import { Field, SearchInput, SelectInput } from "@/components/common/Field";
import { MONTH_NAMES_ID } from "@/utils/constants";
import type { SAFilterParams, SAStatus } from "../types";
import { supplierLabel } from "@/lib/lexicon";

const STATUSES: (SAStatus | "Semua")[] = ["Semua", "Draf", "Aktif", "Limit", "Selesai"];

export function SAFilterBar({
  filters,
  onFilterChange,
}: {
  filters: SAFilterParams;
  onFilterChange: (next: SAFilterParams) => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2];

  const patch = (next: Partial<SAFilterParams>) =>
    onFilterChange({ ...filters, ...next });

  return (
    <div className="grid grid-cols-1 gap-3 rounded-md border border-line bg-panel p-4 sm:grid-cols-2 lg:grid-cols-4">
      <Field label="Cari" className="sm:col-span-2 lg:col-span-1">
        <SearchInput
          value={filters.search ?? ""}
          onChange={(search) => patch({ search: search || undefined })}
          placeholder={`Nomor SA atau ${supplierLabel()}`}
        />
      </Field>

      <Field label="Status">
        <SelectInput
          value={filters.status ?? "Semua"}
          onChange={(e) => patch({ status: e.target.value as SAFilterParams["status"] })}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectInput>
      </Field>

      <Field label="Bulan mulai">
        <SelectInput
          value={filters.bulan ?? ""}
          onChange={(e) =>
            patch({ bulan: e.target.value ? Number(e.target.value) : undefined })
          }
        >
          <option value="">Semua bulan</option>
          {MONTH_NAMES_ID.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </SelectInput>
      </Field>

      <Field label="Tahun">
        <SelectInput
          value={filters.tahun ?? ""}
          onChange={(e) =>
            patch({ tahun: e.target.value ? Number(e.target.value) : undefined })
          }
        >
          <option value="">Semua tahun</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </SelectInput>
      </Field>
    </div>
  );
}
