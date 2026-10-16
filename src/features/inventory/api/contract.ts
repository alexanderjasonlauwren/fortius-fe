/**
 * Stock on hand at its moving average, opening stock and stock counts
 * (accounting parity P7, client requirement §8.1).
 */
export interface StockRow {
  productId: string;
  code: string;
  name: string;
  kind: string;
  quantity: number;
  amount: number;
  /** What a sale is costed at now: amount / quantity. */
  average: number;
  lastUnitCost?: number;
  lastMovement?: string;
  /** Has an opening balance or any movement: Saldo awal can no longer be entered. */
  opened: boolean;
}

export interface OpeningLine {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface CountLine {
  productId: string;
  countedQuantity: number;
}

export interface StockCountLine {
  productId: string;
  code: string;
  name: string;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  unitCost: number;
  amount: number;
}

export interface StockCount {
  id: string;
  number: string;
  date: string;
  notes?: string;
  countedBy?: string;
  totalAmount: number;
  lines: StockCountLine[];
}

export interface InventoryApi {
  getStock(): Promise<StockRow[]>;
  recordOpening(input: { date: string; lines: OpeningLine[] }): Promise<StockRow[]>;
  createStockCount(input: { date: string; notes?: string; lines: CountLine[] }): Promise<StockCount>;
  listStockCounts(): Promise<StockCount[]>;
}
