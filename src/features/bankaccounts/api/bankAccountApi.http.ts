/**
 * The agency's receiving accounts, against the real API.
 *
 * A clean mapping — `internal/controller/bankaccount` is a plain tenant-wide
 * CRUD resource with no model mismatch, unlike `products`' own HTTP adapter.
 */
import { getList, getOne, send } from "@/lib/api";
import type { BankAccountEntity, BankNameEntity } from "@/types/domain";
import type { BankAccountApi } from "./contract";

/** Mirrors the backend's BankAccountResponse. */
interface BankAccountResponse {
  id: string;
  bank_name: string;
  account_number: string;
  account_holder: string;
  branch_name?: string;
  is_default: boolean;
  kind: string;
  ledger_account_code: string;
  status: string;
  version: number;
}

function toEntity(row: BankAccountResponse): BankAccountEntity {
  return {
    id: row.id,
    // The console offers a closed set of Indonesian banks; the service
    // accepts any string. Only the console itself writes this field in
    // practice, so a value it wrote round-trips exactly.
    bank: row.bank_name as BankNameEntity,
    nomorRekening: row.account_number,
    atasNama: row.account_holder,
    cabang: row.branch_name ?? "",
    utama: row.is_default,
    aktif: row.status === "atv",
    kind: row.kind === "cash" ? "cash" : "bank",
    ledgerAccountCode: row.ledger_account_code,
  };
}

/** 100 is every list definition's MaxPageSize; a tenant's own receiving
 *  accounts will never approach it. */
async function getBankAccounts(): Promise<BankAccountEntity[]> {
  const page = await getList<BankAccountResponse>("/bank-accounts", {
    pageSize: 100,
    sort: [{ field: "bank_name" }],
  });
  return page.items.map(toEntity);
}

async function saveBankAccount(
  input: Partial<BankAccountEntity> & { id?: string },
): Promise<BankAccountEntity> {
  if (!input.id) {
    return toEntity(
      await send<BankAccountResponse>("post", "/bank-accounts", {
        bank_name: input.bank,
        account_number: input.nomorRekening,
        account_holder: input.atasNama,
        branch_name: input.cabang || undefined,
        is_default: input.utama ?? false,
        // Omitted defaults to "bank" server-side -- see
        // CreateBankAccountRequest.Kind's own doc. Immutable after
        // creation, so this is the only place it is ever sent.
        kind: input.kind,
      }),
    );
  }

  const current = await getOne<BankAccountResponse>(`/bank-accounts/${input.id}`);
  const updated = await send<BankAccountResponse>("put", `/bank-accounts/${input.id}`, {
    version: current.version,
    bank_name: input.bank,
    account_number: input.nomorRekening,
    account_holder: input.atasNama,
    branch_name: input.cabang || undefined,
    is_default: input.utama,
    status: input.aktif !== undefined ? (input.aktif ? "atv" : "ina") : undefined,
  });
  return toEntity(updated);
}

async function deleteBankAccount(id: string): Promise<void> {
  await send("delete", `/bank-accounts/${id}`);
}

export const bankAccountApiHttp: BankAccountApi = {
  getBankAccounts,
  saveBankAccount,
  deleteBankAccount,
};
