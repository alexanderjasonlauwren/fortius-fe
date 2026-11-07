/**
 * What every product adapter must provide.
 *
 * Same reason as every other feature's contract: without one the mock and the
 * HTTP adapter drift, and the drift shows up only in whichever screen reads
 * the field one of them forgot.
 *
 * # Why `stokTersedia` exists
 *
 * Stock is the inventory module's (`GET /inventory/stock`: quantity, value and
 * the moving average, per product, tenant-wide), and reading it needs
 * `finance.read.inventory`, which not every role on the catalogue holds. For a
 * role without it the flag is false and the screen hides the stock panels,
 * rather than showing a confident zero standing in for "not yours to see".
 * Stock never moves from the catalogue: a stock count (stok opname) on
 * Persediaan posts the difference at the moving average.
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
   * were read. False when the role may not read inventory — see this file's
   * own header.
   */
  stokTersedia: boolean;
}

/** One of the tenant's product categories. */
export interface CategoryOption {
  code: string;
  name: string;
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
  /** See `ProductView.stokTersedia`. */
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
  getStockSummary(): Promise<StockSummary>;
  /** The global measurement units a product's unit names. */
  getUnits(): Promise<UnitOption[]>;
  getCategories(): Promise<CategoryOption[]>;
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
