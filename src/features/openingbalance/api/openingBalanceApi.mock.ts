/**
 * The opening-balance wizard, against the mock database.
 *
 * Scope decision (gap-closing plan, Phase E), the same one externalstatements
 * and bankstatements already document: this project has no xlsx-PARSING
 * library, so nothing here can read the uploaded workbook's actual content.
 * previewOpeningBalance always reports a clean, canned result rather than
 * a fabricated error path -- the "deliberately-broken workbook" half of
 * this feature's own verification can only be demonstrated against the
 * real API. commitOpeningBalance posts one small, fixed opening-balance
 * journal (Kas/Bank debited, Saldo Awal Ekuitas credited) and creates no
 * invoices/purchases/assets, since there is no real workbook content to
 * read them from; it does still enforce the one-time guard the real
 * backend's own "An opening balance already exists" refusal carries.
 */
import { ApiError, currentActor, latency, mutate } from "@/mocks/db";
import { accountByRole, postJournal } from "@/mocks/ledger";
import { stampScope } from "@/mocks/scope";
import type { OpeningBalanceEntity } from "@/types/domain";
import type { OpeningBalanceApi, OpeningBalanceCommitResult, OpeningBalancePreview } from "./contract";

const CANNED_LINES = [
  { role: "kas" as const, amount: 25_000_000 },
];
const CANNED_TOTAL = CANNED_LINES.reduce((s, l) => s + l.amount, 0);

async function getTemplate(): Promise<void> {
  await latency("read");
  // Nothing to download in mock mode -- there is no file to produce
  // without the xlsx library this build does not have. The wizard
  // explains this and lets the user preview/commit a demo opening
  // balance anyway (see this file's own header).
}

async function previewOpeningBalance(asOf: string): Promise<OpeningBalancePreview> {
  await latency("upload");
  return {
    asOf,
    balanced: true,
    errors: [],
    trialBalanceRows: CANNED_LINES.length + 1,
    totalDebit: CANNED_TOTAL,
    totalCredit: CANNED_TOTAL,
    piutangRows: 0,
    hutangRows: 0,
    asetRows: 0,
  };
}

async function commitOpeningBalance(asOf: string): Promise<OpeningBalanceCommitResult> {
  await latency("upload");
  return mutate((db) => {
    if (db.openingBalances.length > 0) {
      throw new ApiError("Saldo awal sudah pernah di-commit untuk tenant ini.", 409);
    }

    const saldoAwalEkuitas = accountByRole(db, "saldoAwalEkuitas");
    const lines = CANNED_LINES.map((l) => ({ akunId: accountByRole(db, l.role).id, debit: l.amount, kredit: 0 }));
    const journal = postJournal(db, {
      tanggal: asOf,
      keterangan: `Opening balance as of ${asOf}`,
      sumber: { tipe: "openingBalance", id: "opening" },
      aktor: currentActor(),
      lines: [...lines, { akunId: saldoAwalEkuitas.id, debit: 0, kredit: CANNED_TOTAL }],
    });

    const row: OpeningBalanceEntity = stampScope({
      asOf, journalId: journal.id, committedAt: new Date().toISOString(),
    });
    db.openingBalances.push(row);

    return { journalId: journal.id, invoicesCreated: 0, purchasesCreated: 0, assetsCreated: 0 };
  });
}

export const openingBalanceApiMock: OpeningBalanceApi = {
  getTemplate,
  previewOpeningBalance,
  commitOpeningBalance,
};
