/**
 * Cash vouchers (kas masuk/keluar/transfer), against the mock database.
 *
 * Posts through the same postJournal/reverseJournal mocks/ledger.ts every
 * other write-path feature uses, so a voucher's journal is visible on the
 * Laba Rugi/Neraca/Buku Besar the instant it is posted -- not a parallel
 * number that happens to look right.
 *
 * Every bank/cash account of the same `kind` posts to the SAME ledger leaf
 * (accountByRole(db, "bank") / accountByRole(db, "kas")) -- the mock chart
 * has one generic "1-1100 Bank" and one generic "1-1000 Kas" account, not a
 * sub-ledger per core.bank_accounts row the way the real backend's
 * BankAccountResponse.LedgerAccountCode implies. Telling two bank accounts
 * apart in the ledger is not this mock's job; see DATA_SOURCES.md for the
 * same kind of documented gap externalstatementsApi.mock.ts carries.
 */
import { accountByRole, postJournal, reverseJournal } from "@/mocks/ledger";
import { ApiError, currentActor, latency, mutate, nextId } from "@/mocks/db";
import { scopedDb, stampScope } from "@/mocks/scope";
import type { BankAccountEntity, CashVoucherEntity } from "@/types/domain";
import type {
  CashVoucher,
  CashVoucherApi,
  CashVoucherFilters,
  CashVoucherLine,
  CreateCashVoucherInput,
  UpdateCashVoucherInput,
} from "./contract";

function bankAccount(id: string): BankAccountEntity {
  const found = scopedDb().bankAccounts.find((a) => a.id === id);
  if (!found) throw new ApiError("Akun kas/bank tidak ditemukan.", 400);
  return found;
}

function ledgerRoleFor(account: BankAccountEntity): "bank" | "kas" {
  return account.kind === "cash" ? "kas" : "bank";
}

function toView(row: CashVoucherEntity): CashVoucher {
  const db = scopedDb();
  const bank = db.bankAccounts.find((a) => a.id === row.bankAccountId);
  const counter = row.counterBankAccountId
    ? db.bankAccounts.find((a) => a.id === row.counterBankAccountId)
    : undefined;
  const lines: CashVoucherLine[] = row.lines.map((l) => {
    const account = db.accounts.find((a) => a.id === l.accountId);
    return {
      accountId: l.accountId,
      accountCode: account?.kode ?? "",
      accountName: account?.nama ?? "",
      amount: l.amount,
      memo: l.memo,
    };
  });
  return {
    id: row.id,
    voucherNumber: row.voucherNumber,
    voucherType: row.voucherType,
    voucherDate: row.voucherDate,
    counterparty: row.counterparty,
    description: row.description,
    bankAccountId: row.bankAccountId,
    bankAccountLabel: bank ? `${bank.kind === "cash" ? "Kas" : bank.bank} ${bank.nomorRekening}` : "",
    counterBankAccountId: row.counterBankAccountId,
    counterBankAccountLabel: counter ? `${counter.kind === "cash" ? "Kas" : counter.bank} ${counter.nomorRekening}` : undefined,
    totalAmount: row.totalAmount,
    status: row.status,
    lines,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Mirrors the backend's own resolveLines: validates a request's shape
 *  against its voucher_type and resolves the total each one sums to. */
function resolveLines(
  voucherType: CashVoucher["voucherType"],
  lines: { accountId: string; amount: number; memo?: string }[] | undefined,
  amount: number | undefined,
): { lines: { accountId: string; amount: number; memo?: string }[]; total: number } {
  const db = scopedDb();
  if (voucherType === "transfer") {
    if (lines && lines.length > 0) {
      throw new ApiError("Transfer tidak memiliki baris akun.", 422);
    }
    if (amount == null || amount <= 0) {
      throw new ApiError("Transfer memerlukan nilai.", 422);
    }
    return { lines: [], total: amount };
  }
  if (!lines || lines.length === 0) {
    throw new ApiError("Kas masuk/keluar memerlukan minimal satu baris akun.", 422);
  }
  let total = 0;
  for (const line of lines) {
    if (!db.accounts.some((a) => a.id === line.accountId)) {
      throw new ApiError("Akun pada salah satu baris tidak ditemukan.", 422);
    }
    if (line.amount <= 0) throw new ApiError("Nilai baris harus lebih dari nol.", 422);
    total += line.amount;
  }
  return { lines, total };
}

async function listCashVouchers(filters?: CashVoucherFilters): Promise<CashVoucher[]> {
  await latency("read");
  const search = filters?.search?.trim().toLowerCase();
  return scopedDb()
    .cashVouchers.filter((row) => !filters?.voucherType || row.voucherType === filters.voucherType)
    .filter((row) => !filters?.status || row.status === filters.status)
    .filter((row) => !filters?.branchId || row.branchId === filters.branchId)
    .filter((row) =>
      !search ||
      row.voucherNumber.toLowerCase().includes(search) ||
      row.counterparty?.toLowerCase().includes(search) ||
      row.description?.toLowerCase().includes(search),
    )
    .sort((a, b) => b.voucherDate.localeCompare(a.voucherDate))
    .map(toView);
}

async function getCashVoucher(id: string): Promise<CashVoucher> {
  await latency("read");
  const row = scopedDb().cashVouchers.find((v) => v.id === id);
  if (!row) throw new ApiError("Voucher tidak ditemukan.", 404);
  return toView(row);
}

async function createCashVoucher(input: CreateCashVoucherInput): Promise<CashVoucher> {
  await latency("write");
  bankAccount(input.bankAccountId);
  if (input.voucherType === "transfer") {
    if (!input.counterBankAccountId) throw new ApiError("Transfer memerlukan akun tujuan.", 422);
    bankAccount(input.counterBankAccountId);
  }
  const { lines, total } = resolveLines(input.voucherType, input.lines, input.amount);

  return mutate((db) => {
    const now = new Date().toISOString();
    const seq = db.cashVouchers.length + 1;
    const row: CashVoucherEntity = stampScope(
      {
        id: nextId("cv"),
        voucherNumber: `KV-${now.slice(0, 7).replace("-", "")}-${String(seq).padStart(4, "0")}`,
        voucherType: input.voucherType,
        voucherDate: input.voucherDate,
        counterparty: input.counterparty,
        description: input.description,
        bankAccountId: input.bankAccountId,
        counterBankAccountId: input.counterBankAccountId,
        totalAmount: total,
        status: "draft" as const,
        lines,
        version: 1,
        createdAt: now,
        updatedAt: now,
      },
      input.branchId ? { branchId: input.branchId } : undefined,
    );
    db.cashVouchers.unshift(row);
    return toView(row);
  });
}

async function updateCashVoucher(input: UpdateCashVoucherInput): Promise<CashVoucher> {
  await latency("write");
  bankAccount(input.bankAccountId);
  if (input.counterBankAccountId) bankAccount(input.counterBankAccountId);

  return mutate((db) => {
    const row = db.cashVouchers.find((v) => v.id === input.id);
    if (!row) throw new ApiError("Voucher tidak ditemukan.", 404);
    if (row.version !== input.version) {
      throw new ApiError("Voucher sudah berubah. Muat ulang lalu coba lagi.", 409, "STALE_VERSION");
    }
    if (row.status !== "draft") {
      throw new ApiError("Hanya voucher draft yang dapat diubah.", 409);
    }
    const { lines, total } = resolveLines(row.voucherType, input.lines, input.amount);
    row.voucherDate = input.voucherDate;
    row.bankAccountId = input.bankAccountId;
    row.counterBankAccountId = input.counterBankAccountId;
    row.counterparty = input.counterparty;
    row.description = input.description;
    row.totalAmount = total;
    row.lines = lines;
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    return toView(row);
  });
}

async function postCashVoucher(id: string, version: number): Promise<CashVoucher> {
  await latency("write");
  return mutate((db) => {
    const row = db.cashVouchers.find((v) => v.id === id);
    if (!row) throw new ApiError("Voucher tidak ditemukan.", 404);
    if (row.version !== version) {
      throw new ApiError("Voucher sudah berubah. Muat ulang lalu coba lagi.", 409, "STALE_VERSION");
    }
    if (row.status !== "draft") {
      throw new ApiError("Voucher sudah diposting.", 409);
    }
    const bank = db.bankAccounts.find((a) => a.id === row.bankAccountId);
    if (!bank) throw new ApiError("Akun kas/bank tidak ditemukan.", 400);
    const bankLedger = accountByRole(db, ledgerRoleFor(bank));

    const lines =
      row.voucherType === "transfer"
        ? (() => {
            const counter = db.bankAccounts.find((a) => a.id === row.counterBankAccountId);
            if (!counter) throw new ApiError("Akun tujuan transfer tidak ditemukan.", 400);
            const counterLedger = accountByRole(db, ledgerRoleFor(counter));
            return [
              { akunId: counterLedger.id, debit: row.totalAmount, kredit: 0 },
              { akunId: bankLedger.id, debit: 0, kredit: row.totalAmount },
            ];
          })()
        : row.voucherType === "receipt"
          ? [
              { akunId: bankLedger.id, debit: row.totalAmount, kredit: 0 },
              ...row.lines.map((l) => ({ akunId: l.accountId, debit: 0, kredit: l.amount, memo: l.memo })),
            ]
          : [
              ...row.lines.map((l) => ({ akunId: l.accountId, debit: l.amount, kredit: 0, memo: l.memo })),
              { akunId: bankLedger.id, debit: 0, kredit: row.totalAmount },
            ];

    const journal = postJournal(db, {
      scope: { tenantId: row.tenantId, branchId: row.branchId },
      tanggal: row.voucherDate,
      keterangan: `${row.voucherNumber}${row.counterparty ? ` — ${row.counterparty}` : ""}`,
      sumber: { tipe: "cashVoucher", id: row.id },
      aktor: currentActor(),
      lines,
    });

    row.journalId = journal.id;
    row.status = "posted";
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    return toView(row);
  });
}

async function voidCashVoucher(id: string, version: number, reason: string): Promise<CashVoucher> {
  await latency("write");
  return mutate((db) => {
    const row = db.cashVouchers.find((v) => v.id === id);
    if (!row) throw new ApiError("Voucher tidak ditemukan.", 404);
    if (row.version !== version) {
      throw new ApiError("Voucher sudah berubah. Muat ulang lalu coba lagi.", 409, "STALE_VERSION");
    }
    if (row.status !== "posted" || !row.journalId) {
      throw new ApiError("Hanya voucher yang sudah diposting dapat dibatalkan.", 409);
    }
    reverseJournal(db, row.journalId, currentActor(), reason);
    row.status = "void";
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    return toView(row);
  });
}

export const cashVoucherApiMock: CashVoucherApi = {
  listCashVouchers,
  getCashVoucher,
  createCashVoucher,
  updateCashVoucher,
  postCashVoucher,
  voidCashVoucher,
};
