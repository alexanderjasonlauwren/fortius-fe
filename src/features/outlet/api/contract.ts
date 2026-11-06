/**
 * What every outlet adapter must provide.
 *
 * The domain shape screens read; the HTTP adapter maps the wire onto it.
 *
 * **Adapters return domain types.** The wire shape never escapes the HTTP
 * adapter — mapping there keeps every component unaware of the wire.
 */
import type { OutletEntity, OutletStatus } from "@/types/domain";

/**
 * An outlet with the figures the screens put beside it.
 *
 * # Why `statistikTersedia` exists
 *
 * Five of these are counted from deliveries and invoices, which no endpoint
 * aggregates per outlet yet. The alternative to a flag was reporting them as zero,
 * which is not a smaller lie: "0 tagihan tertunda" says this outlet owes
 * nothing, and "sisa kuota 0" says it may take no more cylinders. Both are
 * claims the console cannot make, and both are exactly the sort a planner
 * acts on.
 *
 * A flag rather than five nullable numbers because the answer is the same for
 * all five and the screens show them together: the panel that cannot be filled
 * is hidden whole, which reads as "not available here" rather than as a row of
 * dashes that look like missing data.
 *
 * `nilaiTertunda` is the exception and is always populated: `credit_balance`
 * is a column on the outlet, so what the outlet owes is known without
 * counting its invoices.
 */
export interface OutletView extends OutletEntity {
  /** Cylinders delivered to this outlet in the current month. */
  terpakaiBulanIni: number;
  sisaKuota: number;
  /** Invoices still awaiting verification. */
  tagihanTertunda: number;
  nilaiTertunda: number;
  pengirimanTerakhir?: string;
  /**
   * Whether the four delivery-derived figures above mean anything. False
   * until an endpoint aggregates them per outlet.
   */
  statistikTersedia: boolean;
}

export interface OutletFilters {
  search?: string;
  status?: OutletStatus | "Semua";
  kecamatan?: string;
}

export interface OutletApi {
  getOutletList(filters?: OutletFilters): Promise<OutletView[]>;
  getOutletDetail(id: string): Promise<OutletView>;
  createOrUpdateOutlet(input: Partial<OutletEntity> & { id?: string }): Promise<OutletView>;
  removeOutlet(id: string): Promise<void>;
  /**
   * The districts this tenant actually delivers to, for the list's filter.
   *
   * Derived from the outlets rather than from a master list, for the same
   * reason `getSupplierOptions` is: the backend has no district table, and
   * inventing one to populate a dropdown would be a table nobody maintains.
   */
  getKecamatanOptions(): Promise<string[]>;
  exportOutlet(): Promise<number>;
}
