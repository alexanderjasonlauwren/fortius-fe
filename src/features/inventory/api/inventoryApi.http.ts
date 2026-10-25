/**
 * Inventory against the real API: GET /inventory/stock, POST /inventory/opening,
 * GET|POST /inventory/stock-counts (fortius-backend accounting parity P7).
 */
import { getOne, send } from "@/lib/api";
import type { CountLine, InventoryApi, OpeningLine, StockCount, StockRow } from "./contract";

interface StockRowResponse {
  product_id: string;
  code: string;
  name: string;
  kind: string;
  quantity: number;
  amount: number;
  average: number;
  last_unit_cost?: number;
  last_movement?: string;
  opened: boolean;
}

interface StockCountResponse {
  id: string;
  number: string;
  date: string;
  notes?: string;
  counted_by?: string;
  total_amount: number;
  lines: {
    product_id: string;
    code: string;
    name: string;
    system_quantity: number;
    counted_quantity: number;
    difference: number;
    unit_cost: number;
    amount: number;
  }[] | null;
}

function toStock(r: StockRowResponse): StockRow {
  return {
    productId: r.product_id,
    code: r.code,
    name: r.name,
    kind: r.kind,
    quantity: r.quantity,
    amount: r.amount,
    average: r.average,
    lastUnitCost: r.last_unit_cost,
    lastMovement: r.last_movement?.slice(0, 10),
    opened: r.opened,
  };
}

function toCount(r: StockCountResponse): StockCount {
  return {
    id: r.id,
    number: r.number,
    date: r.date,
    notes: r.notes,
    countedBy: r.counted_by,
    totalAmount: r.total_amount,
    lines: (r.lines ?? []).map((l) => ({
      productId: l.product_id,
      code: l.code,
      name: l.name,
      systemQuantity: l.system_quantity,
      countedQuantity: l.counted_quantity,
      difference: l.difference,
      unitCost: l.unit_cost,
      amount: l.amount,
    })),
  };
}

async function getStock(): Promise<StockRow[]> {
  return ((await getOne<StockRowResponse[]>("/inventory/stock")) ?? []).map(toStock);
}

async function recordOpening(input: { date: string; lines: OpeningLine[] }): Promise<StockRow[]> {
  const rows = await send<StockRowResponse[]>("post", "/inventory/opening", {
    date: input.date,
    lines: input.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, unit_cost: l.unitCost })),
  });
  return (rows ?? []).map(toStock);
}

async function createStockCount(input: { date: string; notes?: string; lines: CountLine[] }): Promise<StockCount> {
  return toCount(await send<StockCountResponse>("post", "/inventory/stock-counts", {
    date: input.date,
    notes: input.notes || undefined,
    lines: input.lines.map((l) => ({ product_id: l.productId, counted_quantity: l.countedQuantity })),
  }));
}

async function listStockCounts(): Promise<StockCount[]> {
  return ((await getOne<StockCountResponse[]>("/inventory/stock-counts")) ?? []).map(toCount);
}

export const inventoryApiHttp: InventoryApi = { getStock, recordOpening, createStockCount, listStockCounts };
