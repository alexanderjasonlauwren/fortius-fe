import { describe, expect, it } from "vitest";
import type { NotesStatement, Statement } from "../api/contract";
import { mergeOwnCompare, mergeOwnNotesCompare, parseCompare, shiftBSAsOf, shiftPLWindow } from "./compare";

function stmt(lines: { code: string; amount: number }[]): Statement {
  return {
    layout: { code: "laba_rugi", name: "Laporan Laba Rugi" },
    period: {},
    company: { legalName: "PT Contoh" },
    lines: lines.map((l) => ({
      code: l.code, label: l.code, kind: "accounts", parentCode: null,
      level: 0, isBold: false, noteNumber: null, amount: l.amount, ratio: null, accounts: [],
    })),
    balanced: true,
    warnings: [],
  };
}

describe("parseCompare", () => {
  it("parses external:<id>", () => {
    expect(parseCompare("external:abc-123")).toEqual({ kind: "external", externalId: "abc-123" });
  });
  it("parses prior_period and prior_year", () => {
    expect(parseCompare("prior_period")).toEqual({ kind: "prior_period" });
    expect(parseCompare("prior_year")).toEqual({ kind: "prior_year" });
  });
  it("returns undefined for empty", () => {
    expect(parseCompare(undefined)).toBeUndefined();
    expect(parseCompare("")).toBeUndefined();
  });
  it("rejects anything else", () => {
    expect(() => parseCompare("nonsense")).toThrow();
  });
});

describe("shiftPLWindow", () => {
  it("prior_period is the immediately preceding window of the same length", () => {
    // 2025 is 365 days; 2024 is a leap year (366), so a 365-day window
    // ending 2024-12-31 cannot start 2024-01-01 -- that would be 366 days.
    // It starts one day later.
    expect(shiftPLWindow("2025-01-01", "2025-12-31", "prior_period")).toEqual(["2024-01-02", "2024-12-31"]);
    // March is 31 days, February (2025, non-leap) is 28 -- the preceding
    // window of the SAME length (31 days) ending 2025-02-28 therefore
    // spills back into January, it is not simply "the month before".
    expect(shiftPLWindow("2025-03-01", "2025-03-31", "prior_period")).toEqual(["2025-01-29", "2025-02-28"]);
  });
  it("prior_year is the same dates one calendar year earlier", () => {
    expect(shiftPLWindow("2025-03-01", "2025-03-31", "prior_year")).toEqual(["2024-03-01", "2024-03-31"]);
  });
});

describe("shiftBSAsOf", () => {
  it("prior_period is the end of the preceding calendar month", () => {
    expect(shiftBSAsOf("2025-12-31", "prior_period")).toBe("2025-11-30");
    expect(shiftBSAsOf("2025-03-15", "prior_period")).toBe("2025-02-28");
  });
  it("prior_year is the same date one calendar year earlier", () => {
    expect(shiftBSAsOf("2025-12-31", "prior_year")).toBe("2024-12-31");
  });
});

describe("mergeOwnCompare", () => {
  it("sets compareAmount/variance only on matching codes, and never produces extras", () => {
    const current = stmt([{ code: "laba_bersih", amount: 100 }, { code: "ebitda", amount: 80 }]);
    const prior = stmt([{ code: "laba_bersih", amount: 60 }]);
    const merged = mergeOwnCompare(current, prior, "prior_period", "2024-01-01 - 2024-12-31", "pl:x");

    const laba = merged.lines.find((l) => l.code === "laba_bersih");
    expect(laba?.compareAmount).toBe(60);
    expect(laba?.variance).toBe(40);

    const ebitda = merged.lines.find((l) => l.code === "ebitda");
    expect(ebitda?.compareAmount).toBeUndefined();

    expect(merged.compare).toEqual({ kind: "prior_period", label: "2024-01-01 - 2024-12-31" });
    expect(merged.extraCompareLines).toBeUndefined();
  });
});

describe("mergeOwnNotesCompare", () => {
  it("never leaks a note's own general (no-comparison) Keterangan into a comparison that has none of its own", () => {
    // Simulates what attachGeneralNotesKeterangan (the plain Penjelasan
    // Akun tab's own call) would have set on this note before a
    // comparison merge runs on top of it -- financial-statements plan's
    // gap-closing phase, Phase A's own closing note, and the mirror of
    // the backend fix for the exact same leak class
    // (internal/usecase/financialstatement/compare.go).
    const notes: NotesStatement = {
      asOf: "2025-12-31",
      company: { legalName: "PT Contoh" },
      notes: [{
        noteNumber: 2, lineCode: "persediaan", label: "Persediaan", total: 100,
        leaves: [{ code: "1-1300", name: "Tabung", amount: 100 }],
        keterangan: "Catatan umum, bukan untuk komparasi manapun.",
      }],
    };
    const compareNotes: NotesStatement = { ...notes, notes: [{ ...notes.notes[0], total: 0, leaves: [] }] };

    const merged = mergeOwnNotesCompare(notes, compareNotes, "prior_period", "2024-12-31", "bs:no-note-written-for-this-scope");

    expect(merged.notes[0].keterangan).toBeUndefined();
  });
});
