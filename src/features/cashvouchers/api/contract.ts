/**
 * What every cash voucher adapter must provide.
 *
 * Mirrors fortius-backend's internal/entities/cashvoucher package: kas
 * masuk/keluar/transfer movements with no document of their own
 * (financial-statements plan P4.1). Financial-statements plan's
 * gap-closing phase, Phase B.
 */

export type CashVoucherType = "receipt" | "disbursement" | "transfer";
export type CashVoucherStatus = "draft" | "posted" | "void";

/** One classified leg of a receipt/disbursement voucher. */
export interface CashVoucherLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
  memo?: string;
}

export interface CashVoucher {
  id: string;
  voucherNumber: string;
  voucherType: CashVoucherType;
  voucherDate: string;
  counterparty?: string;
  description?: string;
  bankAccountId: string;
  bankAccountLabel: string;
  counterBankAccountId?: string;
  counterBankAccountLabel?: string;
  totalAmount: number;
  status: CashVoucherStatus;
  voidReason?: string;
  /** The slip, transfer or kuitansi number it is checked against. */
  referenceNumber?: string;
  /** The contact: a vendor or a pangkalan, at most one. */
  supplierId?: string;
  supplierName?: string;
  outletId?: string;
  outletName?: string;
  branchId: string;
  branchName: string;
  lines: CashVoucherLine[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** One classified leg on a create/update payload. Ignored (and must be
 *  empty) for voucher_type "transfer". */
export interface CashVoucherLineInput {
  accountId: string;
  amount: number;
  memo?: string;
}

/**
 * For "receipt"/"disbursement", lines must hold at least one row and the
 * total is derived from their sum. For "transfer", lines must be empty and
 * amount carries the amount moved from bankAccountId to
 * counterBankAccountId directly -- mirrors CreateCashVoucherRequest's own
 * doc exactly.
 */
export interface CreateCashVoucherInput {
  branchId?: string;
  voucherType: CashVoucherType;
  voucherDate: string;
  bankAccountId: string;
  counterBankAccountId?: string;
  counterparty?: string;
  referenceNumber?: string;
  supplierId?: string;
  outletId?: string;
  description?: string;
  amount?: number;
  lines?: CashVoucherLineInput[];
}

/** Replaces a draft voucher's editable fields and lines wholesale --
 *  refused once the voucher is no longer draft. */
export interface UpdateCashVoucherInput {
  id: string;
  version: number;
  voucherDate: string;
  bankAccountId: string;
  counterBankAccountId?: string;
  counterparty?: string;
  referenceNumber?: string;
  supplierId?: string;
  outletId?: string;
  description?: string;
  amount?: number;
  lines?: CashVoucherLineInput[];
}

export interface CashVoucherFilters {
  voucherType?: CashVoucherType;
  status?: CashVoucherStatus;
  branchId?: string;
  search?: string;
  supplierId?: string;
  outletId?: string;
  bankAccountId?: string;
  /** Voucher date range, inclusive (YYYY-MM-DD). */
  from?: string;
  to?: string;
}

export interface CashVoucherApi {
  listCashVouchers(filters?: CashVoucherFilters): Promise<CashVoucher[]>;
  getCashVoucher(id: string): Promise<CashVoucher>;
  createCashVoucher(input: CreateCashVoucherInput): Promise<CashVoucher>;
  updateCashVoucher(input: UpdateCashVoucherInput): Promise<CashVoucher>;
  /** Writes the one balanced journal this voucher will ever post directly
   *  -- a later correction is a void, not an edit. */
  postCashVoucher(id: string, version: number): Promise<CashVoucher>;
  /** Posts the mirror of the original journal and marks the voucher void.
   *  Refused for a voucher still draft. */
  voidCashVoucher(id: string, version: number, reason: string): Promise<CashVoucher>;
  /** Removes a draft; a posted voucher is voided instead. */
  deleteCashVoucher(id: string): Promise<void>;
}
