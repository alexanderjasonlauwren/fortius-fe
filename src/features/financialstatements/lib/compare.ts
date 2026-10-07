/**
 * Komparasi, for the mock build -- ported from fortius-backend's
 * internal/usecase/financialstatement/compare.go. The http adapter never
 * needs this: the real backend already returns compareAmount/variance/
 * keterangan on the wire. Only the mock has to compute the merge itself,
 * since it owns neither a database nor a second usecase to call.
 */
import {
  findExternalStatementForCompare,
  findNoteForCompare,
} from "@/features/externalstatements/api/externalstatementsApi.mock";
import { ApiError } from "@/mocks/db";
import type { ExtraCompareLine, NotesStatement, Statement, StatementNote } from "../api/contract";

export interface ParsedCompare {
  kind: "external" | "prior_period" | "prior_year";
  externalId?: string;
}

export function parseCompare(raw?: string): ParsedCompare | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("external:")) {
    const id = raw.slice("external:".length);
    if (!id) throw new ApiError("compare tidak valid: external:<id> diperlukan.", 400);
    return { kind: "external", externalId: id };
  }
  if (raw === "prior_period" || raw === "prior_year") return { kind: raw };
  throw new ApiError("compare tidak valid: external:<id>, prior_period atau prior_year.", 400);
}

/** Attaches each note's general (no-comparison) Keterangan -- readable
 *  from the plain Penjelasan Akun tab regardless of whether a Komparasi
 *  is active, financial-statements plan's gap-closing phase, Phase A's
 *  own closing note. Mirrors BalanceSheetNotes' own unconditional attach
 *  on the backend. */
export function attachGeneralNotesKeterangan(notes: NotesStatement, scopeKey: string): NotesStatement {
  return {
    ...notes,
    notes: notes.notes.map((n) => ({ ...n, keterangan: findNoteForCompare(n.lineCode, scopeKey, undefined) })),
  };
}

export function scopeKeyPL(from: string, to: string): string {
  return `pl:${from}..${to}`;
}
export function scopeKeyBS(asOf: string): string {
  return `bs:${asOf}`;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDaysUTC(iso: string, days: number): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days));
}
function addYearsUTC(iso: string, years: number): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y + years, m - 1, d));
}

/** prior_period: the immediately preceding window of the same length.
 *  prior_year: the same dates one calendar year earlier. */
export function shiftPLWindow(from: string, to: string, kind: "prior_period" | "prior_year"): [string, string] {
  if (kind === "prior_year") {
    return [toISODate(addYearsUTC(from, -1)), toISODate(addYearsUTC(to, -1))];
  }
  const days = Math.round((addDaysUTC(to, 0).getTime() - addDaysUTC(from, 0).getTime()) / 86_400_000) + 1;
  const newTo = addDaysUTC(from, -1);
  const newFrom = new Date(newTo.getTime() - (days - 1) * 86_400_000);
  return [toISODate(newFrom), toISODate(newTo)];
}

/** prior_period: end of the preceding calendar month. prior_year: the
 *  same date one calendar year earlier. */
export function shiftBSAsOf(asOf: string, kind: "prior_period" | "prior_year"): string {
  if (kind === "prior_year") return toISODate(addYearsUTC(asOf, -1));
  const [y, m] = asOf.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  return toISODate(new Date(firstOfMonth.getTime() - 86_400_000));
}

export function mergeOwnCompare(stmt: Statement, compareStmt: Statement, kind: "prior_period" | "prior_year", label: string, scopeKey: string): Statement {
  const byCode = new Map(compareStmt.lines.map((l) => [l.code, l.amount]));
  const lines = stmt.lines.map((l) => {
    const v = byCode.get(l.code);
    const keterangan = findNoteForCompare(l.code, scopeKey, undefined);
    if (v === undefined && keterangan === undefined) return l;
    return { ...l, ...(v !== undefined ? { compareAmount: v, variance: l.amount - v } : {}), ...(keterangan !== undefined ? { keterangan } : {}) };
  });
  return { ...stmt, lines, compare: { kind, label } };
}

export function mergeExternalCompare(stmt: Statement, externalId: string, scopeKey: string): Statement {
  const ext = findExternalStatementForCompare(externalId);
  if (!ext) throw new ApiError("Laporan pembanding tidak ditemukan.", 404);

  const byCode = new Map<string, number>();
  const extras: ExtraCompareLine[] = [];
  for (const l of ext.lines) {
    if (l.lineCode) {
      byCode.set(l.lineCode, l.amount);
      continue;
    }
    if (l.parentLineCode) extras.push({ parentCode: l.parentLineCode, label: l.label, amount: l.amount });
  }

  const lines = stmt.lines.map((l) => {
    const v = byCode.get(l.code);
    const keterangan = findNoteForCompare(l.code, scopeKey, externalId);
    if (v === undefined && keterangan === undefined) return l;
    return { ...l, ...(v !== undefined ? { compareAmount: v, variance: l.amount - v } : {}), ...(keterangan !== undefined ? { keterangan } : {}) };
  });
  return { ...stmt, lines, compare: { kind: "external", label: ext.label }, extraCompareLines: extras };
}

export function mergeOwnNotesCompare(notes: NotesStatement, compareNotes: NotesStatement, kind: "prior_period" | "prior_year", label: string, scopeKey: string): NotesStatement {
  const byNoteLeaf = new Map<string, Map<string, number>>();
  for (const n of compareNotes.notes) {
    byNoteLeaf.set(n.lineCode, new Map(n.leaves.map((leaf) => [leaf.code, leaf.amount])));
  }
  const resultNotes: StatementNote[] = notes.notes.map((n) => {
    const leafAmounts = byNoteLeaf.get(n.lineCode);
    const keterangan = findNoteForCompare(n.lineCode, scopeKey, undefined);
    const leaves = n.leaves.map((leaf) => {
      const v = leafAmounts?.get(leaf.code);
      if (v === undefined) return leaf;
      return { ...leaf, compareAmount: v, variance: leaf.amount - v };
    });
    // keterangan is assigned explicitly (not spread conditionally) so it
    // always overrides n's own -- n may already carry a general
    // (no-comparison) Keterangan the plain getBalanceSheetNotes call
    // attached, and a line with no note scoped to THIS comparison must
    // show none, never fall back to the general one. Mirrors the same
    // fix on the backend (internal/usecase/financialstatement/compare.go).
    return { ...n, leaves, keterangan };
  });
  return { ...notes, notes: resultNotes, compare: { kind, label } };
}

export function mergeExternalNotesCompare(notes: NotesStatement, externalId: string, scopeKey: string): NotesStatement {
  const ext = findExternalStatementForCompare(externalId);
  if (!ext) throw new ApiError("Laporan pembanding tidak ditemukan.", 404);

  const byNote = new Map<string, { accountCode: string | null; label: string; amount: number }[]>();
  for (const l of ext.lines) {
    if (!l.parentLineCode) continue;
    const list = byNote.get(l.parentLineCode) ?? [];
    list.push({ accountCode: l.accountCode, label: l.label, amount: l.amount });
    byNote.set(l.parentLineCode, list);
  }

  const extras: ExtraCompareLine[] = [];
  const resultNotes: StatementNote[] = notes.notes.map((n) => {
    const rows = byNote.get(n.lineCode) ?? [];
    const byAccountCode = new Map(rows.filter((r) => r.accountCode).map((r) => [r.accountCode as string, r.amount]));
    const keterangan = findNoteForCompare(n.lineCode, scopeKey, externalId);
    const leaves = n.leaves.map((leaf) => {
      const v = byAccountCode.get(leaf.code);
      if (v === undefined) return leaf;
      return { ...leaf, compareAmount: v, variance: leaf.amount - v };
    });
    for (const r of rows) {
      const matched = r.accountCode && n.leaves.some((leaf) => leaf.code === r.accountCode);
      if (!matched) extras.push({ parentCode: n.lineCode, label: r.label, amount: r.amount });
    }
    // Explicit assignment, not a conditional spread -- see mergeOwnNotesCompare's
    // own comment for why this matters.
    return { ...n, leaves, keterangan };
  });
  return { ...notes, notes: resultNotes, compare: { kind: "external", label: ext.label }, extraCompareLines: extras };
}
