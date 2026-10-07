/**
 * Rekening koran import, auto-match, classification and reconciliation,
 * against the mock database.
 *
 * The mock build cannot read an uploaded file's actual bytes -- same
 * limitation externalstatementsApi.mock.ts documents for its own import,
 * and the same reason: no xlsx/CSV-parsing library exists in
 * admin-dashboard (see DATA_SOURCES.md). What it substitutes is the best
 * available proxy: every journal line already posted to this bank
 * account's own ledger leaf within the stated period becomes one
 * statement line (a real payment or cash voucher the mock already knows
 * about), plus one synthetic "unidentified" line sized so the aggregate
 * opening/closing balance check passes -- standing in for a bank fee or
 * interest nothing in the mock ledger posted yet. Every line starts
 * "unmatched", exactly like the real backend; autoMatch is what resolves
 * them, also like the real backend.
 */
import { accountByRole, postJournal } from "@/mocks/ledger";
import { ApiError, currentActor, latency, mutate, nextId } from "@/mocks/db";
import { scopedDb, stampScope } from "@/mocks/scope";
import type {
  BankAccountEntity,
  BankStatementImportEntity,
  BankStatementLineEntity,
  BankStatementRuleEntity,
  CashVoucherEntity,
  Database,
  JournalEntity,
} from "@/types/domain";
import type {
  AutoMatchResult,
  BankStatementApi,
  BankStatementImport,
  BankStatementLine,
  BankStatementRule,
  ClassifyLineInput,
  CreateRuleInput,
  ImportBankStatementInput,
  Reconciliation,
  UpdateRuleInput,
} from "./contract";

function bankAccount(id: string): BankAccountEntity {
  const found = scopedDb().bankAccounts.find((a) => a.id === id);
  if (!found) throw new ApiError("Akun kas/bank tidak ditemukan.", 400);
  return found;
}

function ledgerRoleFor(account: BankAccountEntity): "bank" | "kas" {
  return account.kind === "cash" ? "kas" : "bank";
}

/** The vocabulary ClassifyRequest's own match_source_type/LineResponse's
 *  own matched_source_type use on the real backend -- only the two source
 *  types any mock posting path actually produces today map to one. */
function wireSourceType(tipe: JournalEntity["sumber"]["tipe"]): string | undefined {
  if (tipe === "payment") return "payment";
  if (tipe === "cashVoucher") return "cash_voucher";
  return undefined;
}

function toLine(row: BankStatementLineEntity): BankStatementLine {
  return {
    id: row.id,
    lineNo: row.lineNo,
    lineDate: row.lineDate,
    description: row.description,
    reference: row.reference,
    debit: row.debit,
    credit: row.credit,
    balance: row.balance,
    status: row.status,
    matchedSourceType: row.matchedSourceType,
    cashVoucherId: row.cashVoucherId,
  };
}

function toImportView(row: BankStatementImportEntity, includeLines: boolean): BankStatementImport {
  const bank = scopedDb().bankAccounts.find((a) => a.id === row.bankAccountId);
  return {
    id: row.id,
    bankAccountId: row.bankAccountId,
    bankAccountLabel: bank ? `${bank.kind === "cash" ? "Kas" : bank.bank} ${bank.nomorRekening}` : "",
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    openingBalance: row.openingBalance,
    closingBalance: row.closingBalance,
    fileName: row.fileName,
    rowCount: row.lines.length,
    newRowCount: row.lines.length,
    createdAt: row.createdAt,
    lines: includeLines ? row.lines.map(toLine) : undefined,
  };
}

function toRule(row: BankStatementRuleEntity): BankStatementRule {
  const account = scopedDb().accounts.find((a) => a.id === row.accountId);
  return {
    id: row.id,
    pattern: row.pattern,
    direction: row.direction,
    accountId: row.accountId,
    accountCode: account?.kode ?? "",
    accountName: account?.nama ?? "",
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function importStatement(input: ImportBankStatementInput): Promise<BankStatementImport> {
  await latency("upload");
  const account = bankAccount(input.bankAccountId);

  return mutate((db) => {
    const ledger = accountByRole(db, ledgerRoleFor(account));
    const inPeriod = db.journals.filter(
      (j) =>
        j.status === "Diposting" &&
        j.tanggal >= input.periodFrom &&
        j.tanggal <= input.periodTo &&
        j.lines.some((l) => l.akunId === ledger.id),
    );

    let lineNo = 0;
    let running = input.openingBalance;
    const lines: BankStatementLineEntity[] = [];
    for (const journal of inPeriod.sort((a, b) => a.tanggal.localeCompare(b.tanggal))) {
      for (const line of journal.lines.filter((l) => l.akunId === ledger.id)) {
        // A journal line crediting the bank's own asset account is money
        // leaving it -- the statement's own Debit column (uang keluar). A
        // debit to it is money arriving (uang masuk, statement Credit).
        const debit = line.kredit;
        const credit = line.debit;
        running += credit - debit;
        lineNo += 1;
        lines.push({
          id: nextId("bsl"),
          lineNo,
          lineDate: journal.tanggal,
          description: journal.keterangan,
          reference: journal.nomor,
          debit,
          credit,
          balance: running,
          status: "unmatched",
          sourceJournalId: journal.id,
        });
      }
    }

    const residual = round2(input.closingBalance - running);
    if (residual !== 0) {
      lineNo += 1;
      running += residual;
      lines.push({
        id: nextId("bsl"),
        lineNo,
        lineDate: input.periodTo,
        description: "Mutasi belum teridentifikasi",
        reference: "",
        debit: residual < 0 ? -residual : 0,
        credit: residual > 0 ? residual : 0,
        balance: running,
        status: "unmatched",
      });
    }

    const row: BankStatementImportEntity = stampScope({
      id: nextId("bsi"),
      bankAccountId: input.bankAccountId,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
      openingBalance: input.openingBalance,
      closingBalance: input.closingBalance,
      fileName: input.file.name,
      lines,
      createdAt: new Date().toISOString(),
    });
    db.bankStatementImports.unshift(row);
    return toImportView(row, true);
  });
}

async function listImports(bankAccountId?: string): Promise<BankStatementImport[]> {
  await latency("read");
  return scopedDb()
    .bankStatementImports.filter((row) => !bankAccountId || row.bankAccountId === bankAccountId)
    .sort((a, b) => b.periodTo.localeCompare(a.periodTo))
    .map((row) => toImportView(row, false));
}

async function getImport(id: string): Promise<BankStatementImport> {
  await latency("read");
  const row = scopedDb().bankStatementImports.find((i) => i.id === id);
  if (!row) throw new ApiError("Impor tidak ditemukan.", 404);
  return toImportView(row, true);
}

/** Links a line to a journal already known from import time, or -- for the
 *  synthetic residual line -- applies the first matching rule and posts a
 *  new cash voucher. Mirrors the real backend's own two-tier AutoMatch. */
async function autoMatch(id: string): Promise<AutoMatchResult> {
  await latency("write");
  return mutate((db) => {
    const imp = db.bankStatementImports.find((i) => i.id === id);
    if (!imp) throw new ApiError("Impor tidak ditemukan.", 404);
    const bank = db.bankAccounts.find((a) => a.id === imp.bankAccountId);
    if (!bank) throw new ApiError("Akun kas/bank tidak ditemukan.", 400);

    let matched = 0;
    let posted = 0;
    for (const line of imp.lines) {
      if (line.status !== "unmatched") continue;

      if (line.sourceJournalId) {
        const journal = db.journals.find((j) => j.id === line.sourceJournalId);
        line.status = "matched";
        line.matchedSourceType = journal ? wireSourceType(journal.sumber.tipe) : undefined;
        if (journal?.sumber.tipe === "cashVoucher") line.cashVoucherId = journal.sumber.id;
        matched += 1;
        continue;
      }

      const direction = line.credit > 0 ? "in" : "out";
      const rule = db.bankStatementRules
        .filter((r) => r.isActive && r.direction === direction)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .find((r) => line.description.toLowerCase().includes(r.pattern.toLowerCase()));
      if (!rule) continue;

      const amount = direction === "in" ? line.credit : line.debit;
      const voucher = createVoucherSync(db, bank, rule.accountId, direction === "in", amount, line.lineDate, line.description);
      line.status = "posted";
      line.cashVoucherId = voucher.id;
      posted += 1;
    }

    return {
      matched,
      posted,
      stillUnmatched: imp.lines.filter((l) => l.status === "unmatched").length,
    };
  });
}

/**
 * Posts a cash voucher inline, synchronously, inside the same mutate()
 * transaction autoMatch/classifyLine already hold -- createCashVoucher/
 * postCashVoucher are each their own latency-simulated async call (correct
 * for a user-driven create), which would double-apply mutate()'s own
 * persist-and-notify if awaited from inside one. Mirrors the shape, not
 * the call, of the real backend's postVoucherFromClassification, which
 * really does call through to the cashvoucher usecase because Go has no
 * such re-entrancy hazard.
 */
function createVoucherSync(
  db: Database,
  bank: BankAccountEntity,
  accountId: string,
  isCredit: boolean,
  amount: number,
  date: string,
  description: string,
): { id: string } {
  const bankLedger = accountByRole(db, ledgerRoleFor(bank));
  const voucherType = isCredit ? "receipt" : "disbursement";
  const now = new Date().toISOString();
  const seq = db.cashVouchers.length + 1;
  const voucher: CashVoucherEntity = stampScope({
    id: nextId("cv"),
    voucherNumber: `KV-${now.slice(0, 7).replace("-", "")}-${String(seq).padStart(4, "0")}`,
    voucherType: voucherType as "receipt" | "disbursement",
    voucherDate: date,
    description: `Dari rekening koran: ${description}`,
    bankAccountId: bank.id,
    totalAmount: amount,
    status: "draft",
    lines: [{ accountId, amount }],
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  db.cashVouchers.unshift(voucher);

  const lines = isCredit
    ? [
        { akunId: bankLedger.id, debit: amount, kredit: 0 },
        { akunId: accountId, debit: 0, kredit: amount },
      ]
    : [
        { akunId: accountId, debit: amount, kredit: 0 },
        { akunId: bankLedger.id, debit: 0, kredit: amount },
      ];
  const journal = postJournal(db, {
    scope: { tenantId: voucher.tenantId, branchId: voucher.branchId },
    tanggal: voucher.voucherDate,
    keterangan: voucher.voucherNumber,
    sumber: { tipe: "cashVoucher", id: voucher.id },
    aktor: currentActor(),
    lines,
  });
  voucher.journalId = journal.id;
  voucher.status = "posted";
  voucher.version += 1;
  return voucher;
}

async function classifyLine(input: ClassifyLineInput): Promise<BankStatementLine> {
  await latency("write");
  const modes = [input.accountId, input.matchSourceType ?? input.matchSourceId, input.ignore].filter(Boolean).length;
  if (modes !== 1) throw new ApiError("Pilih tepat satu cara klasifikasi.", 422);

  return mutate((db) => {
    let found: { imp: BankStatementImportEntity; line: BankStatementLineEntity } | undefined;
    for (const imp of db.bankStatementImports) {
      const line = imp.lines.find((l) => l.id === input.lineId);
      if (line) { found = { imp, line }; break; }
    }
    if (!found) throw new ApiError("Baris tidak ditemukan.", 404);
    const { imp, line } = found;
    if (line.status !== "unmatched") throw new ApiError("Baris ini sudah diklasifikasi.", 409);

    const bank = db.bankAccounts.find((a) => a.id === imp.bankAccountId);
    if (!bank) throw new ApiError("Akun kas/bank tidak ditemukan.", 400);

    if (input.ignore) {
      line.status = "ignored";
    } else if (input.accountId) {
      const isCredit = line.credit > 0;
      const amount = isCredit ? line.credit : line.debit;
      const voucher = createVoucherSync(db, bank, input.accountId, isCredit, amount, line.lineDate, line.description);
      line.status = "posted";
      line.cashVoucherId = voucher.id;
    } else {
      line.status = "matched";
      line.matchedSourceType = input.matchSourceType;
    }
    return toLine(line);
  });
}

async function getReconciliation(bankAccountId: string, asOf: string): Promise<Reconciliation> {
  await latency("read");
  const db = scopedDb();
  const account = bankAccount(bankAccountId);
  const ledger = accountByRole(db, ledgerRoleFor(account));
  const ledgerBalance = round2(
    db.journals
      .filter((j) => j.status === "Diposting" && j.tanggal <= asOf)
      .flatMap((j) => j.lines)
      .filter((l) => l.akunId === ledger.id)
      .reduce((sum, l) => sum + l.debit - l.kredit, 0),
  );

  const latestImport = db.bankStatementImports
    .filter((i) => i.bankAccountId === bankAccountId && i.periodTo <= asOf)
    .sort((a, b) => b.periodTo.localeCompare(a.periodTo))[0];

  const statementBalance = latestImport?.periodTo === asOf ? latestImport.closingBalance : undefined;
  const unmatchedCount =
    latestImport?.lines.filter((l) => l.status === "unmatched").length ?? 0;

  return {
    bankAccountId,
    asOf,
    statementBalance,
    ledgerBalance,
    difference: statementBalance !== undefined ? round2(statementBalance - ledgerBalance) : undefined,
    unmatchedCount,
  };
}

async function listRules(): Promise<BankStatementRule[]> {
  await latency("read");
  return scopedDb().bankStatementRules.sort((a, b) => a.sortOrder - b.sortOrder).map(toRule);
}

async function createRule(input: CreateRuleInput): Promise<BankStatementRule> {
  await latency("write");
  if (!scopedDb().accounts.some((a) => a.id === input.accountId)) {
    throw new ApiError("Akun tidak ditemukan.", 422);
  }
  return mutate((db) => {
    const now = new Date().toISOString();
    const row: BankStatementRuleEntity = stampScope({
      id: nextId("bsr"),
      pattern: input.pattern,
      direction: input.direction,
      accountId: input.accountId,
      sortOrder: input.sortOrder ?? 0,
      isActive: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    db.bankStatementRules.push(row);
    return toRule(row);
  });
}

async function updateRule(input: UpdateRuleInput): Promise<BankStatementRule> {
  await latency("write");
  return mutate((db) => {
    const row = db.bankStatementRules.find((r) => r.id === input.id);
    if (!row) throw new ApiError("Aturan tidak ditemukan.", 404);
    if (row.version !== input.version) {
      throw new ApiError("Aturan sudah berubah. Muat ulang lalu coba lagi.", 409, "STALE_VERSION");
    }
    row.pattern = input.pattern;
    row.direction = input.direction;
    row.accountId = input.accountId;
    row.sortOrder = input.sortOrder;
    row.isActive = input.isActive;
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    return toRule(row);
  });
}

export const bankStatementApiMock: BankStatementApi = {
  importStatement,
  listImports,
  getImport,
  autoMatch,
  classifyLine,
  getReconciliation,
  listRules,
  createRule,
  updateRule,
};
