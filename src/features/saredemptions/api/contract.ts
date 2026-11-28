/**
 * Penebusan SA: paying Pertamina for one Schedule Agreement through BNI Pops
 * (partner doc C6). The payment goes to Uang Muka on its date; each delivery
 * moves its share into Persediaan on its own date. Mirrors fortius-backend's
 * entities/saredemption.
 */

export type RedemptionStatus = "posted" | "void";
export type DeliveryStatus = "scheduled" | "received" | "void";

export interface DeliveryInput {
  productId: string;
  deliveryDate: string;
  quantity: number;
  /** The line's share; give it on every line or on none (none = split by quantity). */
  amount?: number;
  deliveryNumber?: string;
  /** Keterangan; the backend writes "Terima {qty} {produk} SA {sa} DN {dn}" when empty. */
  description?: string;
}

export interface RecordRedemptionInput {
  branchId: string;
  saNumber: string;
  transactionReference: string;
  paidOn: string;
  bankAccountId?: string;
  netPrice?: number;
  ppn?: number;
  pbbkb?: number;
  pph?: number;
  dnCnValue?: number;
  totalDebit: number;
  depot?: string;
  shipTo?: string;
  notes?: string;
  deliveries: DeliveryInput[];
}

export interface DeliveryView {
  id: string;
  lineNo: number;
  productId: string;
  productCode: string;
  productName: string;
  deliveryDate: string;
  quantity: number;
  amount: number;
  unitCost: number;
  deliveryNumber?: string;
  description?: string;
  status: DeliveryStatus;
  receivedAt?: string;
}

export interface RedemptionView {
  id: string;
  redemptionNumber: string;
  saNumber: string;
  scheduleAgreementId?: string;
  transactionReference: string;
  paidOn: string;
  bankAccountName?: string;
  netPrice?: number;
  ppn?: number;
  pbbkb?: number;
  pph?: number;
  dnCnValue?: number;
  totalDebit: number;
  totalQuantity: number;
  receivedQuantity: number;
  depot?: string;
  shipTo?: string;
  notes?: string;
  status: RedemptionStatus;
  voidReason?: string;
  deliveries: DeliveryView[];
  warnings: string[];
  version: number;
}

export interface RedemptionApi {
  getRedemptions(search: string, page: number): Promise<import("@/lib/api").Paged<RedemptionView>>;
  getRedemption(id: string): Promise<RedemptionView>;
  recordRedemption(input: RecordRedemptionInput): Promise<RedemptionView>;
  /** Receives the deliveries whose date has come; none named = every one due. */
  receiveDeliveries(id: string, deliveryIds?: string[]): Promise<RedemptionView>;
}
