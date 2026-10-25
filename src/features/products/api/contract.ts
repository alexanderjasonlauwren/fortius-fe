/**
 * What every product adapter must provide.
 *
 * Same reason as every other feature's contract: without one the mock and the
 * HTTP adapter drift, and the drift shows up only in whichever screen reads
 * the field one of them forgot.
 *
 * # Why `stokTersedia` exists
 *
 * `internal/controller/product` is real and mounted, but it is a catalogue
 * module, not a stock module: `core.products` has no quantity column, and
 * stock lives in `core.stock_levels`, which nothing serves yet. Cost/sell
 * pricing is a separate tiered resource but does have a write route now
 * (`POST /products/:id/pricing`) — only the stock half of the mock model is
 * still unbacked. Reporting a live count, a cost-based stock value, or a
 * low-stock flag against an API this build cannot ask would be a confident
 * zero standing in for "unknown" — the same lie `OutletView.statistikTersedia`
 * exists to avoid, and the same fix: a flag the screen checks to hide the
 * panel that cannot be filled, rather than a row of numbers that look like
 * data.
 */
import type { ProductEntity } from "@/types/domain";

export interface ProductView extends ProductEntity {
  /** Selling price minus cost, per unit. */
  margin: number;
  marginPersen: number;
  stokRendah: boolean;
  nilaiStok: number;
  /**
   * Whether `stok`, `stokMinimum`'s comparison, `nilaiStok` and `stokRendah`
   * mean anything in this build. False on the API build — see this file's
   * own header.
   */
  stokTersedia: boolean;
}

export interface UnitOption {
  id: string;
  name: string;
  abbreviation: string;
}

export interface ProductFilters {
  search?: string;
  onlyLowStock?: boolean;
  onlyActive?: boolean;
}

export interface StockSummary {
  total: number;
  aktif: number;
  stokRendah: number;
  nilaiStok: number;
  /** See `ProductView.stokTersedia` — false on the API build. */
  stokTersedia: boolean;
}

export interface ProductApi {
  getProducts(filters?: ProductFilters): Promise<ProductView[]>;
  getProductDetail(id: string): Promise<ProductView>;
  createOrUpdateProduct(
    input: Partial<ProductEntity> & { id?: string },
  ): Promise<ProductView>;
  removeProduct(id: string): Promise<void>;
  /** Mock-only in this build — see `productApi.http.ts`'s own note. */
  changeStock(id: string, delta: number, alasan: string): Promise<ProductView>;
  getStockSummary(): Promise<StockSummary>;
  /** The global measurement units a product's unit names. */
  getUnits(): Promise<UnitOption[]>;
  /** A product's transport-fee rates, newest period first. */
  getTariffs(productId: string): Promise<TransportTariff[]>;
  /** Sets a new rate from a date; the open one is closed the day before. */
  createTariff(productId: string, input: NewTransportTariff): Promise<TransportTariff>;
  exportProducts(): Promise<number>;
}

/**
 * A transport-fee rate for a product and period. Priced per tabung
 * (`per_unit`, the default since client decision G5) or per kg.
 */
export interface TransportTariff {
  id: string;
  rateBasis: "per_unit" | "per_kg";
  rate: number;
  principalReference?: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}

export interface NewTransportTariff {
  rateBasis: "per_unit" | "per_kg";
  rate: number;
  effectiveFrom: string;
  principalReference?: string;
}
