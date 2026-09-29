/**
 * The statement engine, ported from fortius-backend's own
 * internal/usecase/financialstatement/engine.go -- same account-tree
 * construction, same dependency-ordered (not sort_order-ordered) layout
 * evaluation, same integrity warnings. Financial-statements plan, phase P2.
 *
 * Kept as a straight port rather than a reinterpretation: the backend's own
 * golden-figure tests are the source of truth for what "correct" means
 * here, and this file's own vitest test runs the same fixture through it.
 */
import type { AccountEntity, Database } from "@/types/domain";
import type {
  AccountAmount,
  GeneralLedgerLine,
  GeneralLedgerPage,
  NotesStatement,
  Statement,
  StatementLine,
  StatementNote,
  StatementWarning,
} from "../api/contract";
import type { LayoutDef, LayoutLineDef } from "./layouts";

const EPOCH = "0001-01-01";

/* ── accounts ──────────────────────────────────────────────────────────── */

interface AccountRow {
  id: string;
  code: string;
  name: string;
  tipe: AccountEntity["tipe"];
  role?: string;
  parentCode?: string;
  debit: number;
  credit: number;
}

function debitByNature(tipe: string): boolean {
  return tipe === "Aset" || tipe === "Beban";
}

/**
 * rawValue is an account's balance signed so a larger number always means
 * "more of what this type exists to measure" -- ignoring is_contra
 * deliberately, so a contra account (Retur & Potongan Penjualan, Akumulasi
 * Penyusutan) nets correctly against whatever else shares its statement
 * line. See engine.go's own doc for the fuller reasoning.
 */
function rawValue(r: AccountRow): number {
  return debitByNature(r.tipe) ? r.debit - r.credit : r.credit - r.debit;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fiscalYearStart(asOf: string): string {
  return asOf.slice(0, 4) + "-01-01";
}

function loadAccountBalances(db: Database, from: string, to: string, branchId?: string): AccountRow[] {
  const sums = new Map<string, { debit: number; credit: number }>();
  for (const j of db.journals) {
    if (j.status !== "Diposting") continue;
    if (j.tanggal < from || j.tanggal > to) continue;
    if (branchId && j.branchId !== branchId) continue;
    for (const l of j.lines) {
      const cur = sums.get(l.akunId) ?? { debit: 0, credit: 0 };
      cur.debit += l.debit;
      cur.credit += l.kredit;
      sums.set(l.akunId, cur);
    }
  }
  return db.accounts.map((a) => {
    const s = sums.get(a.id) ?? { debit: 0, credit: 0 };
    return { id: a.id, code: a.kode, name: a.nama, tipe: a.tipe, role: a.role, parentCode: a.induk, debit: s.debit, credit: s.credit };
  });
}

interface Tree {
  byId: Map<string, AccountRow>;
  byCode: Map<string, AccountRow>;
  childrenOf: Map<string, string[]>;
}

function buildTree(rows: AccountRow[]): Tree {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parentCode) {
      const arr = childrenOf.get(r.parentCode) ?? [];
      arr.push(r.code);
      childrenOf.set(r.parentCode, arr);
    }
  }
  return { byId, byCode, childrenOf };
}

function subtreeCodes(tree: Tree, rootCode: string): string[] {
  const codes = [rootCode];
  for (const child of tree.childrenOf.get(rootCode) ?? []) {
    codes.push(...subtreeCodes(tree, child));
  }
  return codes;
}

function byRole(tree: Tree, role: string): AccountRow | undefined {
  for (const r of tree.byId.values()) {
    if (r.role === role) return r;
  }
  return undefined;
}

function netIncomeForWindow(db: Database, from: string, to: string, branchId?: string): number {
  const rows = loadAccountBalances(db, from, to, branchId);
  let revenue = 0;
  let expense = 0;
  for (const r of rows) {
    if (r.tipe === "Pendapatan") revenue += rawValue(r);
    else if (r.tipe === "Beban") expense += rawValue(r);
  }
  return revenue - expense;
}

function relevantToStatement(kind: "profit_loss" | "balance_sheet", tipe: string): boolean {
  if (kind === "profit_loss") return tipe === "Pendapatan" || tipe === "Beban";
  return tipe === "Aset" || tipe === "Kewajiban" || tipe === "Ekuitas";
}

/* ── evaluation ────────────────────────────────────────────────────────── */

interface EngineContext {
  db: Database;
  tree: Tree;
  from: string;
  to: string;
  asOf: string;
  branchId?: string;
  covered: Set<string>;
  warnings: StatementWarning[];
  statementKind: "profit_loss" | "balance_sheet";
}

function sumAccounts(ec: EngineContext, codes: string[]): { sum: number; accounts: AccountAmount[] } {
  let sum = 0;
  const accounts: AccountAmount[] = [];
  for (const code of codes) {
    if (!ec.tree.byCode.has(code)) continue;
    for (const c of subtreeCodes(ec.tree, code)) {
      const row = ec.tree.byCode.get(c);
      if (!row) continue;
      ec.covered.add(c);
      const v = rawValue(row);
      if (v !== 0) {
        accounts.push({ accountId: row.id, code: row.code, name: row.name, amount: v });
      }
      sum += v;
    }
  }
  return { sum, accounts };
}

function evalInventoryGroup(
  ec: EngineContext,
  layout: LayoutDef,
  groupCode: string,
  amounts: Map<string, number>,
): void {
  const group = layout.lines.find((l) => l.code === groupCode);
  if (!group) throw new Error(`financial statement: inventory group ${groupCode} not found`);

  let openingCode: string | undefined;
  let purchasesCode: string | undefined;
  let closingCode: string | undefined;
  for (const l of layout.lines) {
    if (l.parent !== groupCode) continue;
    if (l.lineKind === "inventory_opening") openingCode = l.code;
    if (l.lineKind === "inventory_purchases") purchasesCode = l.code;
    if (l.lineKind === "inventory_closing") closingCode = l.code;
  }

  const invCodes: string[] = [];
  for (const code of group.accounts ?? []) {
    if (!ec.tree.byCode.has(code)) continue;
    invCodes.push(...subtreeCodes(ec.tree, code));
  }
  for (const c of invCodes) ec.covered.add(c);

  const dayBeforeFrom = addDays(ec.from, -1);
  const openingRows = buildTree(loadAccountBalances(ec.db, EPOCH, dayBeforeFrom, ec.branchId));
  const closingRows = buildTree(loadAccountBalances(ec.db, EPOCH, ec.to, ec.branchId));

  let opening = 0;
  let closing = 0;
  for (const c of invCodes) {
    const o = openingRows.byCode.get(c);
    if (o) opening += rawValue(o);
    const cl = closingRows.byCode.get(c);
    if (cl) closing += rawValue(cl);
  }

  let total = 0;
  for (const role of ["hpp", "selisihPersediaan"]) {
    const row = byRole(ec.tree, role);
    if (!row) continue;
    for (const c of subtreeCodes(ec.tree, row.code)) {
      ec.covered.add(c);
      const r = ec.tree.byCode.get(c);
      if (r) total += rawValue(r);
    }
  }

  const purchases = total - opening + closing;

  const fromPurchases = sumPurchaseDebitsToAccounts(ec.db, invCodes, ec.from, ec.to, ec.branchId);
  if (Math.round(purchases * 100) !== Math.round(fromPurchases * 100)) {
    ec.warnings.push({
      code: "INVENTORY_PURCHASES_MISMATCH",
      message: `Pembelian dihitung Rp ${Math.round(purchases).toLocaleString("id-ID")} dari pergerakan persediaan (Awal + Pembelian - Akhir), namun jurnal pembelian mencatat Rp ${Math.round(fromPurchases).toLocaleString("id-ID")} pada periode ini`,
      amount: purchases - fromPurchases,
    });
  }

  const sign = (l?: LayoutLineDef) => (l?.displaySign ?? 1);
  amounts.set(groupCode, total * sign(group));
  if (openingCode) amounts.set(openingCode, opening * sign(layout.lines.find((l) => l.code === openingCode)));
  if (purchasesCode) amounts.set(purchasesCode, purchases * sign(layout.lines.find((l) => l.code === purchasesCode)));
  if (closingCode) amounts.set(closingCode, closing * sign(layout.lines.find((l) => l.code === closingCode)));
}

function sumPurchaseDebitsToAccounts(db: Database, codes: string[], from: string, to: string, branchId?: string): number {
  if (codes.length === 0) return 0;
  const codeSet = new Set(codes);
  const byAccountId = new Set(db.accounts.filter((a) => codeSet.has(a.kode)).map((a) => a.id));
  let total = 0;
  for (const j of db.journals) {
    if (j.status !== "Diposting") continue;
    if (j.sumber.tipe !== "purchase") continue;
    if (j.tanggal < from || j.tanggal > to) continue;
    if (branchId && j.branchId !== branchId) continue;
    for (const l of j.lines) {
      if (byAccountId.has(l.akunId)) total += l.debit;
    }
  }
  return total;
}

function unmappedNetIncomeContribution(ec: EngineContext): number {
  let revenue = 0;
  let expense = 0;
  for (const row of ec.tree.byId.values()) {
    if (ec.covered.has(row.code)) continue;
    if (row.tipe === "Pendapatan") revenue += rawValue(row);
    else if (row.tipe === "Beban") expense += rawValue(row);
  }
  return revenue - expense;
}

function unmappedWarnings(ec: EngineContext): StatementWarning[] {
  const warnings: StatementWarning[] = [];
  for (const row of ec.tree.byId.values()) {
    if (ec.covered.has(row.code) || !relevantToStatement(ec.statementKind, row.tipe)) continue;
    const v = rawValue(row);
    if (v === 0) continue;
    warnings.push({
      code: "UNMAPPED_ACCOUNT",
      message: `Akun ${row.code} (${row.name}) memiliki saldo tetapi tidak dipetakan ke baris laporan manapun`,
      accountCode: row.code,
      amount: v,
    });
  }
  return warnings;
}

function evaluateLayout(ec: EngineContext, layout: LayoutDef): StatementLine[] {
  const amounts = new Map<string, number>();
  const accountsOf = new Map<string, AccountAmount[]>();
  const byCode = new Map(layout.lines.map((l) => [l.code, l]));

  function evalLine(code: string): number {
    if (amounts.has(code)) return amounts.get(code)!;
    const line = byCode.get(code);
    if (!line) throw new Error(`financial statement: layout ${layout.code} references undefined line ${code}`);

    switch (line.lineKind) {
      case "header":
        amounts.set(code, 0);
        break;

      case "accounts": {
        const { sum, accounts } = sumAccounts(ec, line.accounts ?? []);
        amounts.set(code, sum * (line.displaySign ?? 1));
        accountsOf.set(code, accounts);
        break;
      }

      case "retained_earnings": {
        const { sum, accounts } = sumAccounts(ec, line.accounts ?? []);
        const priorNet = netIncomeForWindow(ec.db, EPOCH, addDays(fiscalYearStart(ec.asOf), -1), ec.branchId);
        amounts.set(code, (sum + priorNet) * (line.displaySign ?? 1));
        accountsOf.set(code, accounts);
        break;
      }

      case "current_year_earnings": {
        const v = netIncomeForWindow(ec.db, fiscalYearStart(ec.asOf), ec.asOf, ec.branchId);
        amounts.set(code, v * (line.displaySign ?? 1));
        break;
      }

      case "subtotal": {
        let sum = 0;
        for (const term of line.formula ?? []) {
          sum += evalLine(term.code) * term.sign;
        }
        amounts.set(code, sum);
        break;
      }

      case "inventory_change":
      case "inventory_opening":
      case "inventory_purchases":
      case "inventory_closing": {
        const groupCode = line.lineKind === "inventory_change" ? code : line.parent!;
        if (!amounts.has(groupCode)) {
          evalInventoryGroup(ec, layout, groupCode, amounts);
        }
        break;
      }

      default:
        throw new Error(`financial statement: layout ${layout.code} line ${code} has unknown line_kind ${line.lineKind}`);
    }
    return amounts.get(code)!;
  }

  for (const line of layout.lines) evalLine(line.code);

  // The bottom line stays truthful even when something is unmapped -- see
  // engine.go's own note on why only the terminal net-income line is
  // corrected, not every subtotal upstream of it.
  if (layout.kind === "profit_loss" && byCode.has("laba_bersih")) {
    const unmapped = unmappedNetIncomeContribution(ec);
    if (unmapped !== 0) {
      amounts.set("laba_bersih", (amounts.get("laba_bersih") ?? 0) + unmapped);
    }
  }

  function level(code: string): number {
    let lvl = 0;
    let cur = byCode.get(code);
    const seen = new Set<string>();
    while (cur?.parent && !seen.has(cur.code)) {
      seen.add(cur.code);
      lvl++;
      cur = byCode.get(cur.parent);
    }
    return lvl;
  }

  const lines: StatementLine[] = [];
  for (const l of layout.lines) {
    const amount = amounts.get(l.code) ?? 0;
    if (l.hideWhenZero && amount === 0) continue;
    let ratio: number | null = null;
    if (l.showRatio && l.ratioBase) {
      const base = amounts.get(l.ratioBase);
      if (base) ratio = Math.round((amount / base) * 100) / 100;
    }
    lines.push({
      code: l.code,
      label: l.label,
      kind: l.lineKind,
      parentCode: l.parent ?? null,
      level: level(l.code),
      isBold: !!l.isBold,
      noteNumber: l.noteNumber ?? null,
      amount,
      ratio,
      accounts: accountsOf.get(l.code) ?? [],
    });
  }
  return lines;
}

function doubleMappedWarnings(layout: LayoutDef): StatementWarning[] {
  const lineCountByAccount = new Map<string, Set<string>>();
  for (const l of layout.lines) {
    for (const code of l.accounts ?? []) {
      const set = lineCountByAccount.get(code) ?? new Set<string>();
      set.add(l.code);
      lineCountByAccount.set(code, set);
    }
  }
  const warnings: StatementWarning[] = [];
  for (const [code, lines] of lineCountByAccount) {
    if (lines.size > 1) {
      warnings.push({ code: "DOUBLE_MAPPED", message: `Akun ${code} dipetakan ke lebih dari satu baris laporan`, accountCode: code });
    }
  }
  return warnings;
}

function buildWarnings(
  ec: EngineContext,
  layout: LayoutDef,
  lines: StatementLine[],
  netIncomeCheckCode: string,
  balancePair: [string, string] | null,
): { warnings: StatementWarning[]; balanced: boolean } {
  const warnings: StatementWarning[] = [...ec.warnings, ...unmappedWarnings(ec), ...doubleMappedWarnings(layout)];
  const byCode = new Map(lines.map((l) => [l.code, l.amount]));

  if (netIncomeCheckCode && byCode.has(netIncomeCheckCode)) {
    const reported = byCode.get(netIncomeCheckCode)!;
    const truth = netIncomeForWindow(ec.db, ec.from, ec.to, ec.branchId);
    if (Math.round(reported * 100) !== Math.round(truth * 100)) {
      warnings.push({
        code: "NET_INCOME_MISMATCH",
        message: "Laba bersih pada laporan tidak sama dengan laba bersih menurut buku besar; kemungkinan ada akun yang belum terpetakan",
        amount: reported - truth,
      });
    }
  }

  let balanced = true;
  if (balancePair) {
    const [leftCode, rightCode] = balancePair;
    if (byCode.has(leftCode) && byCode.has(rightCode)) {
      const left = byCode.get(leftCode)!;
      const right = byCode.get(rightCode)!;
      balanced = Math.round(left * 100) === Math.round(right * 100);
      if (!balanced) {
        warnings.push({ code: "NOT_BALANCED", message: "Total aset tidak sama dengan total kewajiban dan ekuitas", amount: left - right });
      }
    }
  }
  return { warnings, balanced };
}

/* ── public entry points ──────────────────────────────────────────────── */

export function computeProfitAndLoss(
  db: Database,
  from: string,
  to: string,
  layout: LayoutDef,
  branchId?: string,
): Statement {
  const rows = loadAccountBalances(db, from, to, branchId);
  const ec: EngineContext = {
    db, tree: buildTree(rows), from, to, asOf: to, branchId,
    covered: new Set(), warnings: [], statementKind: "profit_loss",
  };
  const lines = evaluateLayout(ec, layout);
  const { warnings, balanced } = buildWarnings(ec, layout, lines, "laba_bersih", null);
  return {
    layout: { code: layout.code, name: layout.name },
    period: { from, to },
    company: { legalName: companyLegalName(db) },
    lines, balanced, warnings,
  };
}

export function computeBalanceSheet(db: Database, asOf: string, layout: LayoutDef, branchId?: string): Statement {
  const rows = loadAccountBalances(db, EPOCH, asOf, branchId);
  const ec: EngineContext = {
    db, tree: buildTree(rows), from: EPOCH, to: asOf, asOf, branchId,
    covered: new Set(), warnings: [], statementKind: "balance_sheet",
  };
  const lines = evaluateLayout(ec, layout);
  const { warnings, balanced } = buildWarnings(ec, layout, lines, "", ["total_aset", "total_kewajiban_ekuitas"]);
  return {
    layout: { code: layout.code, name: layout.name },
    period: { asOf },
    company: { legalName: companyLegalName(db) },
    lines, balanced, warnings,
  };
}

export function computeNotes(db: Database, asOf: string, layout: LayoutDef): NotesStatement {
  const rows = loadAccountBalances(db, EPOCH, asOf);
  const tree = buildTree(rows);
  const notes: StatementNote[] = [];
  for (const l of layout.lines) {
    if (l.noteNumber == null) continue;
    let total = 0;
    const leaves: { code: string; name: string; amount: number }[] = [];
    for (const code of l.accounts ?? []) {
      if (!tree.byCode.has(code)) continue;
      for (const c of subtreeCodes(tree, code)) {
        const row = tree.byCode.get(c);
        if (!row) continue;
        const v = rawValue(row);
        if (v === 0) continue;
        leaves.push({ code: row.code, name: row.name, amount: v });
        total += v;
      }
    }
    notes.push({ noteNumber: l.noteNumber, lineCode: l.code, label: l.label, total, leaves });
  }
  return { asOf, company: { legalName: companyLegalName(db) }, notes };
}

export function computeGeneralLedger(
  db: Database,
  accountId: string,
  from: string,
  to: string,
  limit = 500,
  offset = 0,
): GeneralLedgerPage {
  const account = db.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error("Akun tidak ditemukan");

  const priorRows = buildTree(loadAccountBalances(db, EPOCH, addDays(from, -1)));
  const subtreeAccountCodes = new Set(subtreeCodes(priorRows, account.kode));
  let opening = 0;
  for (const code of subtreeAccountCodes) {
    const r = priorRows.byCode.get(code);
    if (r) opening += rawValue(r);
  }

  const subtreeIds = new Set(db.accounts.filter((a) => subtreeAccountCodes.has(a.kode)).map((a) => a.id));
  const matches = db.journals
    .filter((j) => j.status === "Diposting" && j.tanggal >= from && j.tanggal <= to)
    .flatMap((j) => j.lines.filter((l) => subtreeIds.has(l.akunId)).map((l) => ({ j, l })))
    .sort((a, b) => (a.j.tanggal < b.j.tanggal ? -1 : a.j.tanggal > b.j.tanggal ? 1 : a.j.nomor.localeCompare(b.j.nomor)));

  const debit = debitByNature(account.tipe);
  let running = opening;
  const lines: GeneralLedgerLine[] = [];
  const page = matches.slice(offset, offset + limit);
  for (const { j, l } of page) {
    running += debit ? l.debit - l.kredit : l.kredit - l.debit;
    lines.push({
      journalId: j.id, journalNumber: j.nomor, accountCode: account.kode,
      date: j.tanggal, description: j.keterangan, sourceType: j.sumber.tipe,
      debit: l.debit, credit: l.kredit, balance: running,
    });
  }

  return {
    accountCode: account.kode, accountName: account.nama, from, to,
    openingBalance: opening, lines, total: matches.length, limit, offset,
  };
}

function companyLegalName(db: Database): string {
  return db.tenants?.[0]?.nama ?? "";
}
