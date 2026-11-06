/**
 * The catalogue, against the real API.
 *
 * `internal/controller/product` is the catalogue and its pricing. Stock comes
 * from the inventory module (`GET /inventory/stock`) when the role may read
 * it -- see contract.ts on `stokTersedia`.
 *
 * # Category
 *
 * The form picks it from GET /products/categories (2026-11-02). Until then
 * every product the console created landed in the tenant's first category;
 * that first category is still the fallback for a caller that names none.
 */
import { getAllPages, getOne, send } from "@/lib/api";
import { exportCsv, timestampSuffix } from "@/lib/export";
import { financeApiHttp } from "@/features/finance/api/financeApi.http";
import { getStock, type StockRow } from "@/features/inventory/api/inventoryApi";
import { holds } from "@/features/rbac/holds";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { leafAccounts } from "@/features/finance/lib/accounts";
import type { ProductEntity } from "@/types/domain";
import type { CategoryOption, NewTransportTariff, ProductApi, ProductFilters, ProductView, StockSummary, TransportTariff, UnitOption } from "./contract";

const PAGE_SIZE = 100;

/** Mirrors the backend's ProductResponse. */
interface ProductResponse {
  id: string;
  code: string;
  name: string;
  category: string;
  category_name: string;
  description?: string;
  brand?: string;
  weight_kg: number;
  unit_id?: string;
  unit_name?: string;
  unit_abbreviation?: string;
  barcode?: string;
  min_stock: number;
  current_sell_price?: number;
  current_cost_price?: number;
  margin?: number;
  margin_percent?: number;
  status: string;
  product_kind: string;
  inventory_account_code?: string;
  revenue_account_code?: string;
  cogs_account_code?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

interface CategoryResponse {
  code: string;
  name: string;
  sort_order: number;
}

/** The tenant's product categories, in their sort order. */
async function getCategories(): Promise<CategoryOption[]> {
  const rows = await getOne<CategoryResponse[]>("/products/categories");
  return (rows ?? []).map((c) => ({ code: c.code, name: c.name }));
}

async function resolveDefaultCategory(): Promise<string> {
  const categories = await getOne<CategoryResponse[]>("/products/categories");
  const first = categories[0];
  if (!first) {
    throw new Error(
      "Perusahaan ini belum punya kategori produk, jadi produk baru belum bisa dibuat.",
    );
  }
  return first.code;
}

/**
 * `ukuran` is a free-text display label ("3kg", "5.5kg") with no equivalent
 * column server-side — the closest real field is `weight_kg`, the
 * weight of one unit, which is what "ukuran" means for a cylinder catalogue
 * in practice. Read back formatted as "<n> kg"; written back by taking the
 * leading number out of whatever the form holds, so a size typed as "12" or
 * "12kg" both round-trip, but a non-numeric label (a future non-cylinder
 * product) is refused rather than silently turned into 0kg.
 */
function toUkuran(weightKg: number): string {
  return `${weightKg} kg`;
}

function parseWeightKg(ukuran: string): number {
  const match = ukuran.match(/[\d.]+/);
  const value = match ? Number(match[0]) : NaN;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `"${ukuran}" tidak mengandung angka berat yang valid (contoh: "12 kg"). ` +
        "Ukuran disimpan sebagai berat produk dalam kg.",
    );
  }
  return value;
}

function toView(row: ProductResponse): ProductView {
  return {
    id: row.id,
    kode: row.code,
    nama: row.name,
    kategori: row.category,
    ukuran: toUkuran(row.weight_kg),
    satuan: row.unit_abbreviation ?? row.unit_name ?? "—",
    // Not modeled server-side; nothing reads this in the console today.
    returnable: false,
    hargaJual: row.current_sell_price ?? 0,
    hargaBeli: row.current_cost_price ?? 0,
    stok: 0,
    stokMinimum: row.min_stock,
    aktif: row.status === "atv",
    productKind: row.product_kind === "accessory" || row.product_kind === "container" ? row.product_kind : "commodity",
    unitId: row.unit_id,
    deskripsi: row.description,
    merek: row.brand,
    barcode: row.barcode,
    inventoryAccountCode: row.inventory_account_code,
    revenueAccountCode: row.revenue_account_code,
    cogsAccountCode: row.cogs_account_code,
    // Absent (either price not yet set) reads the same as 0 here — ProductView
    // has no separate "unknown" state, unlike the response DTO it comes from.
    margin: row.margin ?? 0,
    marginPersen: row.margin_percent ?? 0,
    stokRendah: false,
    nilaiStok: 0,
    stokTersedia: false,
  };
}

/** Lays the inventory module's quantity and value over a catalogue row. */
function withStock(view: ProductView, stock: StockRow | undefined): ProductView {
  const quantity = stock?.quantity ?? 0;
  return {
    ...view,
    stok: quantity,
    nilaiStok: stock?.amount ?? 0,
    // A minimum of 0 means "no minimum set", not "never low".
    stokRendah: view.stokMinimum > 0 && quantity <= view.stokMinimum,
    stokTersedia: true,
  };
}

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Adds a new price row for one tier, if the form's value actually changed.
 *
 * A price is a fact about a period, not a column to overwrite — see
 * CreatePricingRequest's own doc on the backend. Skipped entirely when the
 * value is unchanged (including on create, when `previous` is 0 and a blank
 * field means "no price yet"), so saving a product nobody touched the price
 * on does not churn out an identical new pricing row every time.
 */
async function syncPricing(
  productId: string,
  tier: "cost" | "sell",
  next: number,
  previous: number,
): Promise<void> {
  if (next <= 0 || next === previous) return;
  await send("post", `/products/${productId}/pricing`, {
    pricing_tier: tier,
    price: next,
    effective_from: todayIso(),
  });
}

async function getProducts(filters?: ProductFilters): Promise<ProductView[]> {
  const page = await getAllPages<ProductResponse>("/products", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "name" }],
    search: filters?.search,
    filters:
      filters?.onlyActive === false
        ? []
        : filters?.onlyActive
          ? [{ field: "status", operator: "eq" as const, value: "atv" }]
          : [],
  });
  const views = page.items.map(toView);
  // Stock is the inventory module's; a role that may not read it gets the
  // catalogue alone, flagged stokTersedia: false.
  if (!holds(PERMISSIONS.INVENTORY_VIEW)) return views;
  const stockById = new Map((await getStock()).map((row) => [row.productId, row]));
  const rows = views.map((view) => withStock(view, stockById.get(view.id)));
  return filters?.onlyLowStock ? rows.filter((row) => row.stokRendah) : rows;
}

async function getProductDetail(id: string): Promise<ProductView> {
  return toView(await getOne<ProductResponse>(`/products/${id}`));
}

/**
 * `code` is required server-side; the form's own hint says it is "dibuat
 * otomatis jika dikosongkan" (generated automatically if left blank). Kept
 * true here rather than sending an
 * empty string and letting the server's 422 contradict the form's own promise.
 */
function generateCode(name: string): string {
  const slug =
    name
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || "PRODUK";
  return `${slug}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

/**
 * Resolves an override's own account code to the id `*_account_id` wants --
 * ProductEntity carries the code (what ProductResponse hands back), never
 * the id. Refuses a parent/grouping account the same way every other
 * account picker in this console does since the live-caught gap-closing
 * plan Phase E bug (ledger.Post's own leaf-only posting guard).
 */
async function resolveAccountId(code: string | undefined): Promise<string | undefined> {
  if (!code) return undefined;
  const accounts = leafAccounts(await financeApiHttp.getChartOfAccounts());
  const match = accounts.find((a) => a.akun.kode === code);
  if (!match) {
    throw new Error(`Akun "${code}" tidak ditemukan, atau merupakan akun induk. Pilih akun turunannya.`);
  }
  return match.akun.id;
}

/**
 * Unit, description, brand and barcode, trimmed. A blank field is left out
 * when creating, and sent as "" when editing: the backend reads an absent
 * field as "unchanged", so leaving it out would keep the old value.
 */
function descriptiveFields(input: Partial<ProductEntity>, editing: boolean) {
  const text = (v: string | undefined) => {
    if (v === undefined) return undefined;
    const t = v.trim();
    return t || (editing ? "" : undefined);
  };
  return {
    unit_id: input.unitId || undefined,
    description: text(input.deskripsi),
    brand: text(input.merek),
    barcode: text(input.barcode),
  };
}

async function getUnits(): Promise<UnitOption[]> {
  const rows = await getOne<{ id: string; name: string; abbreviation: string }[]>("/products/units");
  return (rows ?? []).map((u) => ({ id: u.id, name: u.name, abbreviation: u.abbreviation }));
}

async function createOrUpdateProduct(
  input: Partial<ProductEntity> & { id?: string },
): Promise<ProductView> {
  // An accessory has no weight of its own (CreateProductRequest.WeightKg's
  // own doc) -- never parsed, not even when ukuran round-trips back as
  // toUkuran(0) === "0 kg" (a truthy string) on every subsequent edit.
  // Caught live, in two stages: creating an accessory with Ukuran left
  // blank threw "tidak mengandung angka berat yang valid" (fixed by
  // skipping an empty ukuran); re-saving that SAME accessory afterward
  // threw again, since its own detail reads back "0 kg", not "" -- skipping
  // by product kind, not by string emptiness, is what actually closes this.
  const weightKg =
    input.productKind === "accessory" || input.productKind === "container"
      ? undefined
      : input.ukuran ? parseWeightKg(input.ukuran) : undefined;

  if (!input.id) {
    const category = input.kategori || (await resolveDefaultCategory());
    const [inventoryAccountId, revenueAccountId, cogsAccountId] = await Promise.all([
      resolveAccountId(input.inventoryAccountCode),
      resolveAccountId(input.revenueAccountCode),
      resolveAccountId(input.cogsAccountCode),
    ]);
    const created = await send<ProductResponse>("post", "/products", {
      code: input.kode?.trim() || generateCode(input.nama ?? ""),
      name: input.nama,
      category,
      weight_kg: weightKg,
      min_stock: input.stokMinimum,
      product_kind: input.productKind,
      ...descriptiveFields(input, false),
      inventory_account_id: inventoryAccountId,
      revenue_account_id: revenueAccountId,
      cogs_account_id: cogsAccountId,
    });
    const pricedCost = !!input.hargaBeli;
    const pricedSell = !!input.hargaJual;
    if (pricedCost) await syncPricing(created.id, "cost", input.hargaBeli!, 0);
    if (pricedSell) await syncPricing(created.id, "sell", input.hargaJual!, 0);
    return toView(
      pricedCost || pricedSell
        ? await getOne<ProductResponse>(`/products/${created.id}`)
        : created,
    );
  }

  const current = await getOne<ProductResponse>(`/products/${input.id}`);
  const [inventoryAccountId, revenueAccountId, cogsAccountId] = await Promise.all([
    resolveAccountId(input.inventoryAccountCode),
    resolveAccountId(input.revenueAccountCode),
    resolveAccountId(input.cogsAccountCode),
  ]);
  const updated = await send<ProductResponse>("put", `/products/${input.id}`, {
    version: current.version,
    code: input.kode,
    name: input.nama,
    category: input.kategori || undefined,
    weight_kg: weightKg,
    min_stock: input.stokMinimum,
    ...descriptiveFields(input, true),
    status: input.aktif !== undefined ? (input.aktif ? "atv" : "ina") : undefined,
    inventory_account_id: inventoryAccountId,
    revenue_account_id: revenueAccountId,
    cogs_account_id: cogsAccountId,
  });
  if (input.hargaBeli !== undefined) {
    await syncPricing(input.id, "cost", input.hargaBeli, current.current_cost_price ?? 0);
  }
  if (input.hargaJual !== undefined) {
    await syncPricing(input.id, "sell", input.hargaJual, current.current_sell_price ?? 0);
  }
  return toView(
    input.hargaBeli !== undefined || input.hargaJual !== undefined
      ? await getOne<ProductResponse>(`/products/${input.id}`)
      : updated,
  );
}

async function removeProduct(id: string): Promise<void> {
  await send("delete", `/products/${id}`);
}

async function getStockSummary(): Promise<StockSummary> {
  const rows = await getProducts();
  const stokTersedia = rows.some((row) => row.stokTersedia);
  return {
    total: rows.length,
    aktif: rows.filter((p) => p.aktif).length,
    stokRendah: rows.filter((p) => p.aktif && p.stokRendah).length,
    nilaiStok: rows.reduce((sum, p) => sum + p.nilaiStok, 0),
    stokTersedia,
  };
}

async function exportProducts(): Promise<number> {
  const rows = await getProducts();
  exportCsv(
    `produk-${timestampSuffix()}`,
    ["Kode", "Nama", "Ukuran", "Harga Jual", "Aktif"],
    rows.map((p) => [p.kode, p.nama, p.ukuran, p.hargaJual, p.aktif ? "Ya" : "Tidak"]),
  );
  return rows.length;
}

interface TariffResponse {
  id: string;
  rate_basis: "per_unit" | "per_kg";
  rate: number;
  principal_reference?: string;
  effective_from: string;
  effective_until?: string;
}

function toTariff(r: TariffResponse): TransportTariff {
  return {
    id: r.id,
    rateBasis: r.rate_basis,
    rate: r.rate,
    principalReference: r.principal_reference,
    effectiveFrom: r.effective_from,
    effectiveUntil: r.effective_until,
  };
}

async function getTariffs(productId: string): Promise<TransportTariff[]> {
  return ((await getOne<TariffResponse[]>(`/products/${productId}/transport-fee-tariffs`)) ?? []).map(toTariff);
}

async function createTariff(productId: string, input: NewTransportTariff): Promise<TransportTariff> {
  return toTariff(await send<TariffResponse>("post", `/products/${productId}/transport-fee-tariffs`, {
    rate_basis: input.rateBasis,
    rate: input.rate,
    effective_from: input.effectiveFrom,
    principal_reference: input.principalReference || undefined,
  }));
}

export const productApiHttp: ProductApi = {
  getProducts,
  getProductDetail,
  createOrUpdateProduct,
  removeProduct,
  getStockSummary,
  exportProducts,
  getUnits,
  getCategories,
  getTariffs,
  createTariff,
};
