/**
 * Cash vouchers (kas masuk/keluar/transfer), against the real API.
 *
 * Every field is a straight snake_case-to-camelCase rename of
 * fortius-backend's internal/entities/cashvoucher response shapes.
 */
import { getList, getOne, send } from "@/lib/api";
import type {
  CashVoucher,
  CashVoucherApi,
  CashVoucherFilters,
  CashVoucherLine,
  CashVoucherLineInput,
  CreateCashVoucherInput,
  UpdateCashVoucherInput,
} from "./contract";

interface LineResponse {
  account_id: string;
  account_code: string;
  account_name: string;
  amount: number;
  memo?: string;
}

interface CashVoucherResponse {
  id: string;
  voucher_number: string;
  voucher_type: string;
  voucher_date: string;
  counterparty?: string;
  description?: string;
  bank_account_id: string;
  bank_account_label: string;
  counter_bank_account_id?: string;
  counter_bank_account_label?: string;
  total_amount: number;
  status: string;
  void_reason?: string;
  reference_number?: string;
  supplier_id?: string;
  supplier_name?: string;
  outlet_id?: string;
  outlet_name?: string;
  branch_id: string;
  branch_name: string;
  lines: LineResponse[];
  version: number;
  created_at: string;
  updated_at: string;
}

function toLine(row: LineResponse): CashVoucherLine {
  return {
    accountId: row.account_id,
    accountCode: row.account_code,
    accountName: row.account_name,
    amount: row.amount,
    memo: row.memo,
  };
}

function toVoucher(row: CashVoucherResponse): CashVoucher {
  return {
    id: row.id,
    voucherNumber: row.voucher_number,
    voucherType: row.voucher_type as CashVoucher["voucherType"],
    voucherDate: row.voucher_date,
    counterparty: row.counterparty,
    description: row.description,
    bankAccountId: row.bank_account_id,
    bankAccountLabel: row.bank_account_label,
    counterBankAccountId: row.counter_bank_account_id,
    counterBankAccountLabel: row.counter_bank_account_label,
    totalAmount: row.total_amount,
    status: row.status as CashVoucher["status"],
    voidReason: row.void_reason,
    referenceNumber: row.reference_number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    outletId: row.outlet_id,
    outletName: row.outlet_name,
    branchId: row.branch_id,
    branchName: row.branch_name,
    lines: (row.lines ?? []).map(toLine),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLineRequest(line: CashVoucherLineInput) {
  return { account_id: line.accountId, amount: line.amount, memo: line.memo?.trim() || undefined };
}

/** The fields create and update share. A blank reference is no reference;
 *  a contact is a vendor or a pangkalan, never both. */
function sharedFields(input: CreateCashVoucherInput | UpdateCashVoucherInput) {
  return {
    voucher_date: input.voucherDate,
    bank_account_id: input.bankAccountId,
    counter_bank_account_id: input.counterBankAccountId,
    counterparty: input.counterparty?.trim() || undefined,
    reference_number: input.referenceNumber?.trim() || undefined,
    supplier_id: input.supplierId || undefined,
    outlet_id: input.supplierId ? undefined : input.outletId || undefined,
    description: input.description,
    amount: input.amount,
    lines: input.lines?.map(toLineRequest),
  };
}

async function listCashVouchers(filters?: CashVoucherFilters): Promise<CashVoucher[]> {
  const apiFilters: { field: string; operator: "eq" | "gte" | "lte"; value: string }[] = [];
  if (filters?.voucherType) apiFilters.push({ field: "voucher_type", operator: "eq", value: filters.voucherType });
  if (filters?.status) apiFilters.push({ field: "status", operator: "eq", value: filters.status });
  if (filters?.branchId) apiFilters.push({ field: "branch_id", operator: "eq", value: filters.branchId });
  if (filters?.supplierId) apiFilters.push({ field: "supplier_id", operator: "eq", value: filters.supplierId });
  if (filters?.outletId) apiFilters.push({ field: "outlet_id", operator: "eq", value: filters.outletId });
  if (filters?.bankAccountId) apiFilters.push({ field: "bank_account_id", operator: "eq", value: filters.bankAccountId });
  if (filters?.from) apiFilters.push({ field: "date", operator: "gte", value: filters.from });
  if (filters?.to) apiFilters.push({ field: "date", operator: "lte", value: filters.to });
  const page = await getList<CashVoucherResponse>("/cash-vouchers", {
    pageSize: 100,
    search: filters?.search?.trim() || undefined,
    filters: apiFilters.length ? apiFilters : undefined,
  });
  return page.items.map(toVoucher);
}

async function getCashVoucher(id: string): Promise<CashVoucher> {
  return toVoucher(await getOne<CashVoucherResponse>(`/cash-vouchers/${id}`));
}

async function createCashVoucher(input: CreateCashVoucherInput): Promise<CashVoucher> {
  const row = await send<CashVoucherResponse>("post", "/cash-vouchers", {
    branch_id: input.branchId,
    voucher_type: input.voucherType,
    ...sharedFields(input),
  });
  return toVoucher(row);
}

async function updateCashVoucher(input: UpdateCashVoucherInput): Promise<CashVoucher> {
  const row = await send<CashVoucherResponse>("put", `/cash-vouchers/${input.id}`, {
    version: input.version,
    ...sharedFields(input),
  });
  return toVoucher(row);
}

async function postCashVoucher(id: string, version: number): Promise<CashVoucher> {
  return toVoucher(await send<CashVoucherResponse>("post", `/cash-vouchers/${id}/post`, { version }));
}

async function voidCashVoucher(id: string, version: number, reason: string): Promise<CashVoucher> {
  return toVoucher(await send<CashVoucherResponse>("post", `/cash-vouchers/${id}/void`, { version, reason }));
}

async function deleteCashVoucher(id: string): Promise<void> {
  await send("delete", `/cash-vouchers/${id}`);
}

export const cashVoucherApiHttp: CashVoucherApi = {
  deleteCashVoucher,
  listCashVouchers,
  getCashVoucher,
  createCashVoucher,
  updateCashVoucher,
  postCashVoucher,
  voidCashVoucher,
};
