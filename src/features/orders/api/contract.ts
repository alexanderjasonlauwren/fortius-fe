import type { Paged } from "@/lib/api";
/**
 * What every order adapter must provide.
 *
 * Split out of a single `orderApi.ts` because the backend models an order as
 * its own resource (`internal/controller/order`, over `core.orders` /
 * `core.order_items`) with a real lifecycle -- same reasoning as every other
 * feature's contract.
 */
import type { OrderEntity, OrderStatus } from "@/types/domain";

export interface OrderView extends OrderEntity {
  outlet: string;
  kecamatan: string;
  /** Cylinders this outlet may still take this month. */
  sisaKuotaOutlet: number;
  /** Set once the order has been pulled onto a plan. */
  kodeRencana?: string;
}

export interface OrderApi {
  /** One server page; `page` is 1-based. */
  getOrders(filters?: { status?: OrderStatus | "Semua"; search?: string }, page?: number): Promise<Paged<OrderView>>;
  getOrderTotals(): Promise<{
    baru: number;
    baruUnit: number;
    disetujui: number;
    disetujuiUnit: number;
    dijadwalkan: number;
    selesai: number;
    ditolak: number;
  }>;
  approveOrder(id: string, catatan?: string): Promise<OrderView>;
  declineOrder(id: string, alasan: string): Promise<OrderView>;
  approveOrderBatch(ids: string[]): Promise<{ approved: number; failures: string[] }>;
  /**
   * Pulls approved orders onto a draft plan.
   *
   * The mock validates every id before touching any of them, so a batch
   * either fully applies or fully refuses. The real endpoint decides one
   * order at a time -- see `orderApi.http.ts`'s own header for what that
   * means for a batch that fails partway through.
   */
  addOrdersToPlan(planId: string, orderIds: string[]): Promise<number>;
  createOrder(input: {
    outletId: string;
    jumlahUnit: number;
    tanggalDiminta: string;
    catatan?: string;
    lines?: { productId: string; jumlah: number }[];
  }): Promise<OrderView>;
  /** Draft plans an approved order can be added to. */
  getSchedulablePlans(): Promise<{ id: string; kode: string; tanggal: string }[]>;
  exportOrders(status?: OrderStatus | "Semua"): Promise<number>;
}
