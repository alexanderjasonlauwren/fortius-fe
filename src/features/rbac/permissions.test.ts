import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { CONSOLE_ONLY_PERMISSIONS, PERMISSIONS } from "./permissions";

/**
 * The console gates on permission codes the backend defines.
 *
 * Until 2026-08-28 it gated on codes it had invented -- `sa:view` against the
 * backend's `distribution.read.schedule_agreements` -- and nothing connected the
 * two, so a button could be shown to someone the route would refuse. That is
 * fixed, and this is what stops it recurring: the vocabulary is now a shared
 * contract across two repositories, and a shared contract with no check is a
 * comment.
 *
 * The catalogue lives in the backend repo, so this test needs it on disk. When
 * it is absent -- CI for this repository alone, or a fresh clone -- the test
 * says so and skips rather than failing, because a red build for a missing
 * sibling checkout teaches people to ignore red builds.
 */
const BACKEND = path.resolve(process.cwd(), "../fortius-backend");

function backendCatalogue(): string[] | null {
  if (!existsSync(path.join(BACKEND, "go.mod"))) return null;
  try {
    // Ask Go for the catalogue rather than parsing catalogue.go: the codes are
    // generated from a resource table by `permissionCode(module, action,
    // resource)`, so the file does not contain the strings this compares
    // against, and a regex over it would silently match nothing.
    const out = execFileSync(
      "go",
      ["run", "./tools/permdump"],
      { cwd: BACKEND, encoding: "utf8", timeout: 120_000 },
    );
    return out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

describe("permission vocabulary", () => {
  // The `console.` prefix marks codes with no backend counterpart. It is a
  // to-do list, so it must only ever shrink -- a new one is a decision to gate
  // a feature on something the server does not enforce.
  it("keeps console-only codes clearly marked and few", () => {
    for (const code of CONSOLE_ONLY_PERMISSIONS) {
      expect(code.startsWith("console."), `${code} should carry the console. prefix`).toBe(true);
    }
    // Zero. SA_IMPORT left this list when the backend gained
    // distribution.import.schedule_agreements, DISTRIBUTION_DELETE left it
    // when the distribution order module shipped with no delete at all, and
    // REPORTS_VIEW/REPORTS_EXPORT left it when the ledger shipped and
    // LedgerPage/ReportsPage/TransactionListPage moved onto
    // finance.read.journals and finance.read.invoices/finance.export.invoices.
    // Raising this number is a deliberate act; lower it as adapters land.
    expect(CONSOLE_ONLY_PERMISSIONS.length).toBeLessThanOrEqual(0);
  });

  // Every non-console code must be shaped like the backend's, which is
  // module.action.resource. A two-part code is the old vocabulary creeping back.
  it("uses the backend's module.action.resource shape", () => {
    for (const code of Object.values(PERMISSIONS)) {
      if (code.startsWith("console.")) continue;
      expect(code, `${code} is not module.action.resource`).toMatch(
        /^[a-z]+\.[a-z]+\.[a-z0-9_]+$/,
      );
      expect(code, `${code} uses the console's old module:verb shape`).not.toContain(":");
    }
  });

  // The check that matters: every code the console gates on is one the backend
  // will actually resolve. A code the catalogue does not define is refused for
  // every user, so the feature behind it is invisible and nothing says why.
  it("only names permissions the backend defines", () => {
    const catalogue = backendCatalogue();
    if (!catalogue) {
      console.warn(
        "skipping: ../fortius-backend not available, so the catalogue could not be read",
      );
      return;
    }

    expect(catalogue.length).toBeGreaterThan(0);
    const known = new Set(catalogue);

    const unknown = Object.entries(PERMISSIONS)
      .filter(([, code]) => !code.startsWith("console.") && !known.has(code))
      .map(([name, code]) => `${name} = ${code}`);

    expect(
      unknown,
      "these codes are gated on in the console but not defined in " +
        "seeds/03-permissions/catalogue.go, so every route behind them answers 403",
    ).toEqual([]);
  });
});
