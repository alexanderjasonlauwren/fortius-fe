import { describe, expect, it } from "vitest";
import { reportLinkHref } from "./links";

describe("reportLinkHref", () => {
  const account = { type: "account", id: "acc-1" } as const;

  it("opens an account's Buku Besar over the report's range", () => {
    expect(reportLinkHref(account, { from: "2026-03-01", to: "2026-03-31" })).toBe(
      "/financial-statements?tab=buku-besar&account=acc-1&from=2026-03-01&to=2026-03-31",
    );
  });

  it("opens an as-of report's account on that year to date", () => {
    expect(reportLinkHref(account, { asOf: "2025-06-30" })).toBe(
      "/financial-statements?tab=buku-besar&account=acc-1&from=2025-01-01&to=2025-06-30",
    );
  });

  it("names no period when the report has none", () => {
    expect(reportLinkHref(account)).toBe("/financial-statements?tab=buku-besar&account=acc-1");
  });
});
