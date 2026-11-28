import { getOne, getPage, send, type Paged } from "@/lib/api";
import type { DeliveryStatus, RecordRedemptionInput, RedemptionApi, RedemptionView } from "./contract";

interface DeliveryResponse {
  id: string;
  line_no: number;
  product_id: string;
  product_code: string;
  product_name: string;
  delivery_date: string;
  quantity: number;
  amount: number;
  unit_cost: number;
  delivery_number?: string;
  description?: string;
  status: DeliveryStatus;
  received_at?: string;
}

interface RedemptionResponse {
  id: string;
  redemption_number: string;
  sa_number: string;
  schedule_agreement_id?: string;
  transaction_reference: string;
  paid_on: string;
  bank_account_name?: string;
  net_price?: number;
  ppn?: number;
  pbbkb?: number;
  pph?: number;
  dn_cn_value?: number;
  total_debit: number;
  total_quantity: number;
  received_quantity: number;
  depot?: string;
  ship_to?: string;
  notes?: string;
  status: "posted" | "void";
  void_reason?: string;
  deliveries?: DeliveryResponse[];
  warnings?: string[];
  version: number;
}

export function toView(r: RedemptionResponse): RedemptionView {
  return {
    id: r.id,
    redemptionNumber: r.redemption_number,
    saNumber: r.sa_number,
    scheduleAgreementId: r.schedule_agreement_id,
    transactionReference: r.transaction_reference,
    paidOn: r.paid_on.slice(0, 10),
    bankAccountName: r.bank_account_name,
    netPrice: r.net_price,
    ppn: r.ppn,
    pbbkb: r.pbbkb,
    pph: r.pph,
    dnCnValue: r.dn_cn_value,
    totalDebit: r.total_debit,
    totalQuantity: r.total_quantity,
    receivedQuantity: r.received_quantity,
    depot: r.depot,
    shipTo: r.ship_to,
    notes: r.notes,
    status: r.status,
    voidReason: r.void_reason,
    deliveries: (r.deliveries ?? []).map((d) => ({
      id: d.id,
      lineNo: d.line_no,
      productId: d.product_id,
      productCode: d.product_code,
      productName: d.product_name,
      deliveryDate: d.delivery_date.slice(0, 10),
      quantity: d.quantity,
      amount: d.amount,
      unitCost: d.unit_cost,
      deliveryNumber: d.delivery_number,
      description: d.description,
      status: d.status,
      receivedAt: d.received_at,
    })),
    warnings: r.warnings ?? [],
    version: r.version,
  };
}

const blank = (s?: string) => (s && s.trim() ? s.trim() : undefined);

async function getRedemptions(search: string, page: number): Promise<Paged<RedemptionView>> {
  return getPage<RedemptionResponse, RedemptionView>("/sa-redemptions", {
    page,
    pageSize: 50,
    sort: [{ field: "paid_on", direction: "desc" }],
    search: search || undefined,
  }, toView);
}

async function getRedemption(id: string): Promise<RedemptionView> {
  return toView(await getOne<RedemptionResponse>(`/sa-redemptions/${id}`));
}

async function recordRedemption(input: RecordRedemptionInput): Promise<RedemptionView> {
  return toView(await send<RedemptionResponse>("post", "/sa-redemptions", {
    branch_id: input.branchId,
    sa_number: input.saNumber.trim(),
    transaction_reference: input.transactionReference.trim(),
    paid_on: input.paidOn,
    bank_account_id: input.bankAccountId || undefined,
    net_price: input.netPrice,
    ppn: input.ppn,
    pbbkb: input.pbbkb,
    pph: input.pph,
    dn_cn_value: input.dnCnValue,
    total_debit: input.totalDebit,
    depot: blank(input.depot),
    ship_to: blank(input.shipTo),
    notes: blank(input.notes),
    deliveries: input.deliveries.map((d) => ({
      product_id: d.productId,
      delivery_date: d.deliveryDate,
      quantity: d.quantity,
      amount: d.amount,
      delivery_number: blank(d.deliveryNumber),
      description: blank(d.description),
    })),
  }));
}

async function receiveDeliveries(id: string, deliveryIds?: string[]): Promise<RedemptionView> {
  return toView(await send<RedemptionResponse>("post", `/sa-redemptions/${id}/receive`,
    deliveryIds?.length ? { delivery_ids: deliveryIds } : {}));
}

export const saRedemptionApiHttp: RedemptionApi = {
  getRedemptions, getRedemption, recordRedemption, receiveDeliveries,
};
