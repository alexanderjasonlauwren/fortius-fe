import { describe, expect, it } from "vitest";
import { withNewGroupsOpen } from "./useSidebar";

describe("sidebar groups after the menu changes", () => {
  const current = ["Menu utama", "Operasi harian", "Keuangan · Transaksi", "Keuangan · Akun & Laporan", "Data induk"];

  it("opens a group this browser has never seen", () => {
    const open = withNewGroupsOpen(["Menu utama", "Operasi harian", "Keuangan", "Data induk"],
      ["Menu utama", "Operasi harian", "Keuangan", "Data induk"], current);
    expect(open).toContain("Keuangan · Transaksi");
    expect(open).toContain("Keuangan · Akun & Laporan");
  });

  it("keeps a group someone closed on purpose closed", () => {
    const open = withNewGroupsOpen(["Menu utama"], current, current);
    expect(open).toEqual(["Menu utama"]);
  });
});
