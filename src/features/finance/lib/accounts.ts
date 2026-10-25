import type { AccountEntity } from "@/types/domain";

export interface AccountBalance {
  akun: AccountEntity;
  debit: number;
  kredit: number;
  /** Signed by the account's normal balance, so a positive figure reads right. */
  saldo: number;
}

/**
 * Every account no other account names as `induk`.
 *
 * The backend's `ledger.Post` refuses a posting to a parent account ("Akun %s
 * adalah akun induk; posting harus ke sub-akun") — caught live posting a manual
 * journal to the 5-4000 header. Every picker that writes a journal line filters
 * through this so that refusal is never the first thing a user sees.
 */
export function leafAccounts(rows: AccountBalance[]): AccountBalance[] {
  const parentCodes = new Set(rows.map((r) => r.akun.induk).filter((k): k is string => !!k));
  return rows.filter((r) => !parentCodes.has(r.akun.kode));
}
