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
 * `addOrdersToPlan` is also no longer atomic the way the mock's
 * `scheduleOrders` is: the mock validates every order before touching any of
 * them, so a batch either fully applies or fully refuses. The real endpoint
 * decides one order at a time, so a failure partway through a batch leaves
 * the earlier ones already scheduled -- the thrown error says how many.
 *
 * There is also no batch-approve endpoint, and `ApproveRequest` carries no
 * note field -- `approveOrder`'s own `catatan` parameter is accepted for
 * interface parity with the mock and silently has nowhere to go, matching
 * `OrderListPage`'s own call site, which never actually passes one.
 */
import { getList, getOne, send } from "@/lib/api";
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
  approved_at?: string;
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
    // A rejection's reason takes priority over a free-text note: once an
    // order is rejected, why is the more useful thing to show beside it.
    catatan: order.rejection_reason ?? order.notes,
    // No approver name -- OrderResponse's own header explains why: the
    // acting user's internal id never leaves the process, and this adapter
    // is not going to add a second join the response does not carry.
    diprosesOleh: undefined,
    diprosesPada: order.order_status !== "requested" ? order.updated_at : undefined,
    outlet: order.outlet_name,
    // Not on OrderResponse -- the outlet's district belongs to the outlet
    // module, and resolving it here would be a lookup per row on a list
    // screen. Same "arrives as unknown rather than a fabricated value"
    // choice distributionApi.http.ts makes for a stop's own decoration.
    kecamatan: "—",
    // Likewise not on OrderResponse: the outlet's remaining monthly quota
    // lives in outlet targets, and a real number here costs one lookup per
    // row. Infinity rather than 0 -- 0 would flag every order as over
    // quota, which is the wrong direction to be wrong in.
    sisaKuotaOutlet: Number.POSITIVE_INFINITY,
    kodeRencana: order.distribution_order_number,
  };
}

async function getOrders(filters?: {
  status?: OrderStatus | "Semua";
  search?: string;
}): Promise<OrderView[]> {
  const wireStatus =
    filters?.status && filters.status !== "Semua" ? STATUS_TO_WIRE[filters.status] : undefined;
  const page = await getList<OrderResponse>("/orders", {
    pageSize: 100,
    search: filters?.search || undefined,
    filters: wireStatus ? [{ field: "order_status", operator: "eq", value: wireStatus }] : undefined,
    sort: [{ field: "order_date", direction: "desc" }],
  });
  return page.items.map(toView);
}

/** No aggregate endpoint exists; counted from the same list the screen shows. */
async function getOrderTotals() {
  const all = await getOrders();
  const count = (s: OrderStatus) => all.filter((o) => o.status === s).length;
  return {
    baru: count("Baru"),
    baruUnit: all.filter((o) => o.status === "Baru").reduce((s, o) => s + o.jumlahUnit, 0),
    disetujui: count("Disetujui"),
    disetujuiUnit: all
      .filter((o) => o.status === "Disetujui")
      .reduce((s, o) => s + o.jumlahUnit, 0),
    dijadwalkan: count("Dijadwalkan"),
    selesai: count("Selesai"),
    ditolak: count("Ditolak"),
  };
}

async function approveOrder(id: string): Promise<OrderView> {
  const current = await getOne<OrderResponse>(`/orders/${id}`);
  return toView(await send<OrderResponse>("post", `/orders/${id}/approve`, {
    version: current.version,
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
 * Schedules one order onto a plan. Exported (not only used internally) so
 * `distributionApi.http.ts`'s own `addApprovedOrders` can call the same real
 * request rather than carrying a second copy of it.
 */
export async function scheduleOneOrder(orderId: string, planId: string): Promise<void> {
  const current = await getOne<OrderResponse>(`/orders/${orderId}`);
  await send("post", `/orders/${orderId}/schedule`, {
    version: current.version,
    distribution_order_id: planId,
  });
}

async function addOrdersToPlan(planId: string, orderIds: string[]): Promise<number> {
  let scheduled = 0;
  for (const id of orderIds) {
    try {
      await scheduleOneOrder(id, planId);
      scheduled += 1;
    } catch (error) {
      throw new Error(
        `${scheduled} dari ${orderIds.length} pesanan terjadwalkan sebelum gagal: ` +
          `${(error as Error).message}`,
      );
    }
  }
  return scheduled;
}

/**
 * The catalogue's first active product, for the quick-entry form's single
 * implied line -- the same fallback `distributionApi.http.ts`'s own
 * `getDefaultProductId` uses, kept as a separate call rather than an import
 * from that feature so this file has no dependency back onto distribution
 * (which itself depends on this one, for `scheduleOneOrder` below -- a
 * two-way feature import would be a real cycle, not just an inconvenient one).
 */
async function defaultProductId(): Promise<string> {
  const page = await getList<{ id: string }>("/products", {
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
  const page = await getList<{ id: string; order_number: string; planned_delivery_date: string; order_status: string }>(
    "/distribution/orders",
    { pageSize: 100, sort: [{ field: "planned_delivery_date" }] },
  );
  const today = isoDate(startOfToday());
  return page.items
    .filter((p) => p.order_status === "draft" && p.planned_delivery_date >= today)
    .map((p) => ({ id: p.id, kode: p.order_number, tanggal: p.planned_delivery_date }));
}

async function exportOrders(status?: OrderStatus | "Semua"): Promise<number> {
  const rows = await getOrders({ status });
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
