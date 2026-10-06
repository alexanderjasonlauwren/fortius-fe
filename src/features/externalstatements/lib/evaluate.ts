/**
 * The recompute engine, ported line for line from fortius-backend's
 * internal/usecase/externalstatement/evaluate.go.
 *
 * Every non-subtotal layout line is taken as the import's own figure (or
 * zero if missing); every subtotal is always recomputed from its own
 * formula over the imported leaves and extras, so a wrong total typed
 * into (or printed on) someone else's book can never leak into what this
 * system reports as that book's own total. An "extra" line (no code of
 * its own, only a parent) folds into whichever line it's parented to,
 * leaf or subtotal, before that line's own value is used anywhere else.
 */
import type { LayoutDef } from "@/features/financialstatements/lib/layouts";
import type { ExternalStatementLineInput } from "../api/contract";

export interface RawImportedLine {
  lineCode?: string | null;
  parentLineCode?: string | null;
  accountCode?: string | null;
  label: string;
  amount: number;
}

export function evaluateImported(layout: LayoutDef, raw: RawImportedLine[]): ExternalStatementLineInput[] {
  const leafByCode = new Map<string, number>();
  const leafLabelByCode = new Map<string, string>();
  const extrasByParent = new Map<string, number>();
  const extras: RawImportedLine[] = [];

  for (const r of raw) {
    if (r.lineCode) {
      leafByCode.set(r.lineCode, r.amount);
      if (r.label) leafLabelByCode.set(r.lineCode, r.label);
      continue;
    }
    if (r.parentLineCode) {
      extrasByParent.set(r.parentLineCode, (extrasByParent.get(r.parentLineCode) ?? 0) + r.amount);
      extras.push(r);
    }
  }

  const byCode = new Map(layout.lines.map((l) => [l.code, l]));
  const amounts = new Map<string, number>();

  function evalLine(code: string): number {
    const cached = amounts.get(code);
    if (cached !== undefined) return cached;
    const line = byCode.get(code);
    const extra = extrasByParent.get(code) ?? 0;
    if (!line) {
      amounts.set(code, extra);
      return extra;
    }
    let base = 0;
    if (line.lineKind === "subtotal") {
      base = (line.formula ?? []).reduce((sum, term) => sum + evalLine(term.code) * term.sign, 0);
    } else if (line.lineKind === "header") {
      base = 0;
    } else {
      base = leafByCode.get(code) ?? 0;
    }
    const total = base + extra;
    amounts.set(code, total);
    return total;
  }

  const result: ExternalStatementLineInput[] = layout.lines.map((line, i) => ({
    lineCode: line.code,
    parentLineCode: null,
    accountCode: null,
    label: leafLabelByCode.get(line.code) ?? line.label,
    amount: evalLine(line.code),
    sortOrder: i,
  }));
  extras.forEach((e, i) => {
    result.push({
      lineCode: null,
      parentLineCode: e.parentLineCode ?? null,
      accountCode: e.accountCode ?? null,
      label: e.label,
      amount: e.amount,
      sortOrder: layout.lines.length + i,
    });
  });
  return result;
}
