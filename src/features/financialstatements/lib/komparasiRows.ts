/**
 * Flattens a Statement/NotesStatement into the uniform row shape
 * KomparasiPanel renders -- kept out of that component's own file so
 * fast-refresh only ever sees components there.
 */
import type { NotesStatement, Statement } from "../api/financialstatementsApi";

export interface KomparasiRow {
  key: string;
  label: string;
  level: number;
  isBold: boolean;
  amount: number;
  compareAmount?: number;
  variance?: number;
  keterangan?: string;
  /** Present only on rows a note/Keterangan can actually be saved
   *  against -- a leaf row inside Penjelasan Akun has none, since
   *  Keterangan is one text per note, not per leaf account. */
  layoutLineCode?: string;
}

export function statementToRows(stmt: Statement): KomparasiRow[] {
  return stmt.lines.map((l) => ({
    key: l.code,
    label: l.label,
    level: l.level,
    isBold: l.isBold,
    amount: l.amount,
    compareAmount: l.compareAmount,
    variance: l.variance,
    keterangan: l.keterangan,
    layoutLineCode: l.code,
  }));
}

export function notesToRows(notes: NotesStatement): KomparasiRow[] {
  const rows: KomparasiRow[] = [];
  for (const n of notes.notes) {
    rows.push({
      key: n.lineCode,
      label: `${n.noteNumber}. ${n.label}`,
      level: 0,
      isBold: true,
      amount: n.total,
      keterangan: n.keterangan,
      layoutLineCode: n.lineCode,
    });
    for (const leaf of n.leaves) {
      rows.push({
        key: `${n.lineCode}-${leaf.code}`,
        label: leaf.name,
        level: 1,
        isBold: false,
        amount: leaf.amount,
        compareAmount: leaf.compareAmount,
        variance: leaf.variance,
      });
    }
  }
  return rows;
}

/** Keterangan scope key for a P&L window — must match the backend's "pl:" key. */
export function scopeKeyPL(from: string, to: string): string {
  return `pl:${from}..${to}`;
}

/** Keterangan scope key for a balance sheet date — matches the backend's "bs:" key. */
export function scopeKeyBS(asOf: string): string {
  return `bs:${asOf}`;
}
