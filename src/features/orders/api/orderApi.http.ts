/**
 * Orders -- what a outlet asks for -- against the real API.
 *
 * `internal/controller/order` over `core.orders` / `core.order_items`. The
 * lifecycle is requested -> approved|rejected -> scheduled, matching the
 * mock's Baru -> Disetujui|Ditolak -> Dijadwalkan exactly; `fulfilled` and
 * `cancelled` exist on the schema's own CHECK but nothing in this build sets
 * them yet, so they fall back to "Baru" below rather than a made-up status.
 *
 * # What the real endpoint does not do that the mock does
 *
 * `ScheduleOrder` links one order to a plan (`order_status='scheduled'` +
 * `distribution_order_id`) -- it deliberately does not add a line to
 * `core.distribution_order_items`. Drawing quota correctly needs a mandatory
 * `quota_allocation_id` resolved by `distributionorder`'s own careful
 * allocation logic, and duplicating that here would be a second copy of
 * rules that have to stay identical to the first. So after scheduling, a
 * planner still adds the outlet's line to the plan through Perencanaan
 * Distribusi's own editor -- the toast in `OrderListPage` already says this
 * ("Tetapkan driver di Perencanaan Distribusi sebelum konfirmasi"), and the
 * same is now true of the line itself, not only the driver.
 *
 * Scheduling several orders is one request (`POST /orders/schedule`): every
 * order lands on the plan or none does, and a refusal names the order that
 * stopped it.
 *
 * There is no batch-approve endpoint: `approveOrderBatch` approves one order
 * at a time and reports the failures.
 */
import { getAllPages, getList, getOne, getPage, send, type Paged } from "@/lib/api";
import { exportCsv, timestampSuffix } from "@/lib/export";
import { outletLabelTitle, unitLabel, unitLabelTitle } from "@/lib/lexicon";
import { isoDate, startOfToday } from "@/lib/date";
import type { OrderStatus } from "@/types/domain";
import type { OrderApi, OrderView } from "./contract";

/** Mirrors the backend's order.Line. */
interface OrderLineResponse {
  product_id: string;
  product_code: string;
  product_name: string;
  requested_qty: number;
  approved_qty?: number;
}

/** Mirrors the backend's order.OrderResponse. */
interface OrderResponse {
  id: string;
  order_number: string;
  outlet_id: string;
  outlet_code: string;
  outlet_name: string;
  order_date: string;
  requested_delivery_date?: string;
  order_status: string;
  source_channel: string;
  distribution_order_id?: string;
  distribution_order_number?: string;
  rejection_reason?: string;
  notes?: string;
  approval_note?: string;
  approved_at?: string;
  approved_by_name?: string;
  outlet_district?: string;
  /** The outlet's monthly target for these products less what live plans
   *  carry that month; absent when no target is set. */
  outlet_month_remaining?: number;
  lines: OrderLineResponse[];
  version: number;
  created_at: string;
  updated_at: string;
}

const STATUS_TO_DOMAIN: Record<string, OrderStatus> = {
  requested: "Baru",
  approved: "Disetujui",
  scheduled: "Dijadwalkan",
  fulfilled: "Selesai",
  rejected: "Ditolak",
};

const STATUS_TO_WIRE: Partial<Record<OrderStatus, string>> = {
  Baru: "requested",
  Disetujui: "approved",
  Dijadwalkan: "scheduled",
  Selesai: "fulfilled",
  Ditolak: "rejected",
};

function toView(order: OrderResponse): OrderView {
  return {
    // See the outlet adapter: row-level security decides what this session
    // can see, so a client-side tenant is a second opinion that can only be
    // wrong. Not on OrderResponse either way.
    tenantId: "",
    branchId: "",
    id: order.id,
    kode: order.order_number,
    outletId: order.outlet_id,
    lines: order.lines.map((l) => ({ productId: l.product_id, jumlah: l.requested_qty })),
    jumlahUnit: order.lines.reduce((s, l) => s + l.requested_qty, 0),
    tanggalMasuk: order.created_at,
    tanggalDiminta: order.requested_delivery_date ?? order.order_date,
    status: STATUS_TO_DOMAIN[order.order_status] ?? "Baru",
    planId: order.distribution_order_id,
    // The decision's own words first: why it was rejected, or what the
    // approver noted. The outlet's request text otherwise.
    catatan: order.rejection_reason ?? order.approval_note ?? order.notes,
    // Who approved it. A rejection records no actor on the order.
    diprosesOleh: order.approved_by_name,
    diprosesPada: order.order_status !== "requested" ? order.updated_at : undefined,
    outlet: order.outlet_name,
    kecamatan: order.outlet_district ?? "—",
    // Infinity when no target is set, rather than 0: 0 would flag the order
    // as over quota, which is the wrong direction to be wrong in.
    sisaKuotaOutlet: order.outlet_month_remaining ?? Number.POSITIVE_INFINITY,
    kodeRencana: order.distribution_order_number,
  };
}

type OrderFilters = { status?: OrderStatus | "Semua"; search?: string };

function orderListParams(filters?: OrderFilters) {
  const wireStatus =
    filters?.status && filters.status !== "Semua" ? STATUS_TO_WIRE[filters.status] : undefined;
  return {
    search: filters?.search || undefined,
    filters: wireStatus ? [{ field: "order_status", operator: "eq" as const, value: wireStatus }] : undefined,
    sort: [{ field: "order_date", direction: "desc" as const }],
  };
}

/** One server page of orders. */
async function getOrders(filters?: OrderFilters, page = 1): Promise<Paged<OrderView>> {
  return getPage<OrderResponse, OrderView>("/orders", { ...orderListParams(filters), page, pageSize: 50 }, toView);
}

/** Every order matching the filters, for the export. */
async function getAllOrders(filters?: OrderFilters): Promise<OrderView[]> {
  const { items } = await getAllPages<OrderResponse>("/orders", orderListParams(filters));
  return items.map(toView);
}

/**
 * The status strip. No aggregate endpoint exists, so: the two open statuses
 * are read whole (they carry a unit total, and stay few), the closed ones are
 * counted by the server. This used to count the newest 100 orders, so every
 * figure stopped growing at 100 (fixed 2026-11-02).
 */
async function getOrderTotals() {
  const count = async (status: OrderStatus) => {
    const page = await getList<OrderResponse>("/orders", { ...orderListParams({ status }), page: 1, pageSize: 1 });
    return page.pagination.total_items ?? page.items.length;
  };
  const [baru, disetujui, dijadwalkan, selesai, ditolak] = await Promise.all([
    getAllOrders({ status: "Baru" }),
    getAllOrders({ status: "Disetujui" }),
    count("Dijadwalkan"),
    count("Selesai"),
    count("Ditolak"),
  ]);
  const units = (rows: OrderView[]) => rows.reduce((s, o) => s + o.jumlahUnit, 0);
  return {
    baru: baru.length,
    baruUnit: units(baru),
    disetujui: disetujui.length,
    disetujuiUnit: units(disetujui),
    dijadwalkan,
    selesai,
    ditolak,
  };
}

async function approveOrder(id: string, catatan?: string): Promise<OrderView> {
  const current = await getOne<OrderResponse>(`/orders/${id}`);
  return toView(await send<OrderResponse>("post", `/orders/${id}/approve`, {
    version: current.version,
    note: catatan?.trim() || undefined,
  }));
}

async function declineOrder(id: string, alasan: string): Promise<OrderView> {
  const current = await getOne<OrderResponse>(`/orders/${id}`);
  return toView(
    await send<OrderResponse>("post", `/orders/${id}/reject`, {
      version: current.version,
      reason: alasan,
    }),
  );
}

async function approveOrderBatch(ids: string[]) {
  const failures: string[] = [];
  let approved = 0;
  for (const id of ids) {
    try {
      await approveOrder(id);
      approved += 1;
    } catch (error) {
      failures.push((error as Error).message);
    }
  }
  return { approved, failures };
}

/**
 * Schedules approved orders onto a plan in one request: all of them, or none.
 * Exported so `distributionApi.http.ts`'s own `addApprovedOrders` makes the
 * same request rather than carrying a second copy of it.
 */
export async function scheduleOrders(planId: string, orderIds: string[]): Promise<number> {
  if (orderIds.length === 0) return 0;
  const current = await Promise.all(orderIds.map((id) => getOne<OrderResponse>(`/orders/${id}`)));
  const scheduled = await send<OrderResponse[]>("post", "/orders/schedule", {
    distribution_order_id: planId,
    orders: current.map((o) => ({ id: o.id, version: o.version })),
  });
  return scheduled.length;
}

async function addOrdersToPlan(planId: string, orderIds: string[]): Promise<number> {
  return scheduleOrders(planId, orderIds);
}

/**
 * The catalogue's first active product, for the quick-entry form's single
 * implied line -- the same fallback `distributionApi.http.ts`'s own
 * `getDefaultProductId` uses, kept as a separate call rather than an import
 * from that feature so this file has no dependency back onto distribution
 * (which itself depends on this one, for `scheduleOrders` above -- a
 * two-way feature import would be a real cycle, not just an inconvenient one).
 */
async function defaultProductId(): Promise<string> {
  const page = await getAllPages<{ id: string }>("/products", {
    pageSize: 1,
    filters: [{ field: "status", operator: "eq", value: "atv" }],
  });
  return page.items[0]?.id ?? "";
}

async function createOrder(input: {
  outletId: string;
  jumlahUnit: number;
  tanggalDiminta: string;
  catatan?: string;
  lines?: { productId: string; jumlah: number }[];
}): Promise<OrderView> {
  if (input.jumlahUnit <= 0) throw new Error(`Jumlah ${unitLabel()} harus lebih dari nol.`);

  const items = input.lines?.length
    ? input.lines.map((l) => ({ product_id: l.productId, requested_qty: l.jumlah }))
    : [{ product_id: await defaultProductId(), requested_qty: input.jumlahUnit }];

  const created = await send<OrderResponse>("post", "/orders", {
    outlet_id: input.outletId,
    requested_delivery_date: input.tanggalDiminta,
    notes: input.catatan || undefined,
    items,
  });
  return toView(created);
}

/**
 * Draft plans a request date away from expiring, read directly from
 * `/distribution/orders` rather than through `distributionApi`'s own picker
 * -- see `defaultProductId`'s own comment for why this file avoids importing
 * back from distribution.
 */
async function getSchedulablePlans() {
  // Drafts only, from the server, through every page. This read the 100
  // oldest plans of any status and kept the future drafts among them, so
  // once a tenant had 100 past plans no plan could be picked at all
  // (fixed 2026-11-02).
  const page = await getAllPages<{ id: string; order_number: string; planned_delivery_date: string; order_status: string }>(
    "/distribution/orders",
    {
      sort: [{ field: "planned_delivery_date" }],
      filters: [{ field: "order_status", operator: "eq" as const, value: "draft" }],
    },
  );
  const today = isoDate(startOfToday());
  return page.items
    .filter((p) => p.order_status === "draft" && p.planned_delivery_date >= today)
    .map((p) => ({ id: p.id, kode: p.order_number, tanggal: p.planned_delivery_date }));
}

async function exportOrders(status?: OrderStatus | "Semua"): Promise<number> {
  const rows = await getAllOrders({ status });
  exportCsv(
    `pesanan-${timestampSuffix()}`,
    [
      "Kode",
      outletLabelTitle(),
      "Kecamatan",
      `${unitLabelTitle()}`,
      "Masuk",
      "Diminta",
      "Status",
      "Rencana",
      "Catatan",
    ],
    rows.map((o) => [
      o.kode,
      o.outlet,
      o.kecamatan,
      o.jumlahUnit,
      new Date(o.tanggalMasuk).toLocaleString("id-ID"),
      new Date(o.tanggalDiminta).toLocaleDateString("id-ID"),
      o.status,
      o.kodeRencana ?? "",
      o.catatan ?? "",
    ]),
  );
  return rows.length;
}

export const orderApiHttp: OrderApi = {
  getOrders,
  getOrderTotals,
  approveOrder,
  declineOrder,
  approveOrderBatch,
  addOrdersToPlan,
  createOrder,
  getSchedulablePlans,
  exportOrders,
};
