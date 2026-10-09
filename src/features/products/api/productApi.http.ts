/**
 * The catalogue, against the real API.
 *
 * `internal/controller/product` is real and mounted. Stock quantity still has
 * no write route at all in this build -- stock lives in `core.stock_levels`,
 * which nothing serves yet -- but cost/sell pricing now does: `POST
 * /products/:id/pricing`. `stokTersedia: false` on every row this adapter
 * returns is how the console screens know to hide the stock panels that
 * still have nothing behind them; pricing carries no such flag because it is
 * fully live here.
 *
 * # The category this build always picks
 *
 * `CreateProductRequest.category` is required server-side, but the
 * console's `ProductEntity` has no category field at all — the form was
 * built before the backend's category-per-business-type model existed.
 * Rather than block every create until the form grows a picker, this
 * adapter fetches the tenant's own categories on every create and always uses the
 * first one returned. This is a real, temporary limitation, not a design
 * decision: every product this build creates lands in one category until
 * the form is extended to choose.
 */
import { getList, getOne, send } from "@/lib/api";
import { exportCsv, timestampSuffix } from "@/lib/export";
import { financeApiHttp } from "@/features/finance/api/financeApi.http";
import { leafAccounts } from "@/mocks/ledger";
import type { ProductEntity } from "@/types/domain";
import type { ProductApi, ProductFilters, ProductView, StockSummary } from "./contract";

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

async function resolveDefaultCategory(): Promise<string> {
  const categories = await getOne<CategoryResponse[]>("/products/categories");
  const first = categories[0];
  if (!first) {
    throw new Error(
      "Tenant ini belum memiliki kategori produk terdaftar, jadi produk baru tidak dapat dibuat.",
    );
  }
  return first.code;
}

/**
 * `ukuran` is a free-text display label in the mock ("3kg", "5.5kg") with no
 * equivalent column server-side — the closest real field is `weight_kg`, the
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
        "Bangun ini menyimpan ukuran sebagai berat produk di build API.",
    );
  }
  return value;
}

function toView(row: ProductResponse): ProductView {
  return {
    id: row.id,
    kode: row.code,
    nama: row.name,
    ukuran: toUkuran(row.weight_kg),
    satuan: row.unit_abbreviation ?? row.unit_name ?? "—",
    // Not modeled server-side; nothing reads this in the console today.
    returnable: false,
    hargaJual: row.current_sell_price ?? 0,
    hargaBeli: row.current_cost_price ?? 0,
    stok: 0,
    stokMinimum: row.min_stock,
    aktif: row.status === "atv",
    productKind: row.product_kind === "accessory" ? "accessory" : "commodity",
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
  const page = await getList<ProductResponse>("/products", {
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
  // onlyLowStock cannot be honoured -- stock has no service behind it in this
  // build (see contract.ts). Every row already carries stokTersedia: false so
  // the screen hides the tab that would offer this filter rather than
  // silently ignoring it here.
  return page.items.map(toView);
}

async function getProductDetail(id: string): Promise<ProductView> {
  return toView(await getOne<ProductResponse>(`/products/${id}`));
}

/**
 * `code` is required server-side; the form's own hint says it is "dibuat
 * otomatis jika dikosongkan" (generated automatically if left blank), which
 * the mock honours by auto-numbering. Kept true here rather than sending an
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
  // financeApiHttp directly, never the mock/http switcher -- this adapter
  // is itself the HTTP implementation and must behave as one regardless
  // of the ambient VITE_DATA_SOURCE, the same reasoning every other
  // *Api.http.ts file importing another feature's concrete module follows.
  const accounts = leafAccounts(await financeApiHttp.getChartOfAccounts());
  const match = accounts.find((a) => a.akun.kode === code);
  if (!match) {
    throw new Error(`Akun "${code}" tidak ditemukan atau bukan akun sub (leaf).`);
  }
  return match.akun.id;
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
    input.productKind === "accessory" ? undefined : input.ukuran ? parseWeightKg(input.ukuran) : undefined;

  if (!input.id) {
    const category = await resolveDefaultCategory();
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
    weight_kg: weightKg,
    min_stock: input.stokMinimum,
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

/**
 * Mock-only: `core.stock_levels` has no service in this build, so there is
 * nowhere to send a stock adjustment. Thrown rather than silently
 * succeeding — ProductListPage only offers this action when
 * `row.stokTersedia` is true, so reaching this is already a bug elsewhere,
 * not a normal path.
 */
async function changeStock(): Promise<ProductView> {
  throw new Error("Penyesuaian stok belum tersedia dari API di build ini.");
}

async function getStockSummary(): Promise<StockSummary> {
  // total/aktif are real counts off the catalogue itself; only the two
  // stock-derived figures are unavailable (see this file's header).
  const rows = await getProducts();
  return {
    total: rows.length,
    aktif: rows.filter((p) => p.aktif).length,
    stokRendah: 0,
    nilaiStok: 0,
    stokTersedia: false,
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

export const productApiHttp: ProductApi = {
  getProducts,
  getProductDetail,
  createOrUpdateProduct,
  removeProduct,
  changeStock,
  getStockSummary,
  exportProducts,
};
