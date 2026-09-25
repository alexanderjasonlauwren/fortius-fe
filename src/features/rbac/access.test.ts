import { describe, expect, it } from "vitest";

import { describeAccess, describeRoles } from "./access";
import { PERMISSIONS } from "./permissions";
import { NAV_GROUPS, navGroupsFor, landingPathFor, titleFor, usesDriverConsole } from "@/layouts/nav";

describe("financial report navigation", () => {
  it("places the renamed report immediately after Beranda without duplicates", () => {
    const items = NAV_GROUPS.flatMap((group) => group.items);
    expect(items.slice(0, 2).map((item) => item.href)).toEqual(["/dashboard", "/reports"]);
    expect(items.filter((item) => item.href === "/reports")).toHaveLength(1);
    expect(titleFor("/reports")).toBe("Laporan Keuangan");
  });
  it("retains the report's invoice permission gate", () => {
    expect(navGroupsFor([]).flatMap((group) => group.items).some((item) => item.href === "/reports")).toBe(false);
    expect(navGroupsFor([PERMISSIONS.INVOICES_VIEW]).flatMap((group) => group.items).some((item) => item.href === "/reports")).toBe(true);
  });
});

describe("describeRoles", () => {
  // The whole reason this replaced ROLE_LABEL[role]: a person can hold several,
  // and the old lookup had to pick one.
  it("lists every role, not just the first", () => {
    expect(describeRoles(["Finance", "Dispatcher"])).toBe("Finance, Dispatcher");
  });

  // No roles is a real state — a user created but not yet granted anything — and
  // must not render as a role they do not have.
  it("says so when there are none", () => {
    expect(describeRoles([])).toBe("Belum ada peran");
    expect(describeRoles()).toBe("Belum ada peran");
  });

  // The names are the tenant's own words, from the server. Translating them
  // would show a role that does not exist in their configuration.
  it("shows names as given rather than translating them", () => {
    expect(describeRoles(["Kepala Cabang"])).toBe("Kepala Cabang");
  });
});

describe("describeAccess", () => {
  it("says plainly when someone can do nothing yet", () => {
    expect(describeAccess([])).toContain("Belum ada akses");
  });

  // A read-only user must not be told they can change things. This is the case
  // ROLE_SUMMARY got right by hand and would have got wrong the first time a
  // "viewer" role was granted one write permission.
  it("recognises read-only access", () => {
    const summary = describeAccess([
      PERMISSIONS.SA_VIEW,
      PERMISSIONS.PAYMENTS_VIEW,
      PERMISSIONS.INVOICES_EXPORT,
    ]);
    expect(summary).toContain("Hanya membaca");
  });

  // One write permission among reads is no longer read-only, and the sentence
  // has to follow the grants rather than the label someone attached to them.
  it("stops calling it read-only as soon as one write is granted", () => {
    const summary = describeAccess([PERMISSIONS.SA_VIEW, PERMISSIONS.PAYMENTS_VERIFY]);
    expect(summary).not.toContain("Hanya membaca");
  });

  it("recognises full administrative access", () => {
    expect(describeAccess(Object.values(PERMISSIONS))).toContain("Akses penuh");
  });
});

describe("the driver console", () => {
  // A sopir landing on the dashboard opens the console on a dispatch rail of
  // trucks that are not theirs, with their own run two taps away.
  it("is where someone who may only record deliveries lands", () => {
    const driver = [PERMISSIONS.DELIVERIES_EXECUTE];

    expect(usesDriverConsole(driver)).toBe(true);
    expect(landingPathFor(driver)).toBe("/sopir");
    expect(navGroupsFor(driver)).not.toEqual(navGroupsFor([PERMISSIONS.SA_VIEW]));
  });

  // The case a role name got wrong the moment anyone held two. A dispatcher who
  // can also execute deliveries needs the whole console, and asking
  // `role === "driver"` would have taken it away from them.
  it("is not where someone who can execute deliveries AND plan them lands", () => {
    const dispatcher = [PERMISSIONS.DELIVERIES_EXECUTE, PERMISSIONS.DISTRIBUTION_EDIT];

    expect(usesDriverConsole(dispatcher)).toBe(false);
    expect(landingPathFor(dispatcher)).toBe("/dashboard");
  });

  // Fails open to the full console rather than trapping someone in the driver
  // view: an unknown session is better served a dashboard it may not fill than
  // a screen built for one run it does not have.
  it("is not where an unknown session lands", () => {
    expect(usesDriverConsole()).toBe(false);
    expect(usesDriverConsole([])).toBe(false);
    expect(landingPathFor(undefined)).toBe("/dashboard");
  });

  // The regression this whole set exists for: the seeded `driver` role
  // (fortius-backend seeds/04-role-permissions/seeder.go) holds fourteen
  // permissions, not one -- delivery proofs, GPS filing, stock movements, its
  // own expense/OCR claim path, notifications, and the near-universal
  // iam.read.tenants. An exact one-permission match sent every real driver
  // account to the full twenty-item console, filtered down to whichever
  // unrelated items happened to share a permission code (Tenant, because
  // iam.read.tenants also gates it; Keuangan, because distribution.read/
  // create.expenses and the OCR reads also gate those pages) -- and then
  // straight into a Beranda that refuses them, since /dashboard needs
  // DISTRIBUTION_VIEW, which nothing in this bundle grants.
  it("is where the real seeded driver role lands, not a filtered admin console", () => {
    const seededDriver = [
      PERMISSIONS.DELIVERIES_VIEW,
      PERMISSIONS.DELIVERIES_EXECUTE,
      PERMISSIONS.DELIVERY_PROOFS_VIEW,
      PERMISSIONS.DELIVERY_PROOFS_CREATE,
      PERMISSIONS.GPS_TRACKS_CREATE,
      PERMISSIONS.STOCK_MOVEMENTS_VIEW,
      PERMISSIONS.STOCK_MOVEMENTS_CREATE,
      PERMISSIONS.EXPENSES_VIEW,
      PERMISSIONS.EXPENSES_CREATE,
      PERMISSIONS.OCR_CREATE,
      PERMISSIONS.OCR_VIEW,
      PERMISSIONS.OCR_VERIFY,
      PERMISSIONS.OCR_ARCHIVE_VIEW,
      PERMISSIONS.NOTIFICATIONS_VIEW,
      PERMISSIONS.SETTINGS_VIEW,
    ];

    expect(usesDriverConsole(seededDriver)).toBe(true);
    expect(landingPathFor(seededDriver)).toBe("/sopir");

    const shown = navGroupsFor(seededDriver).flatMap((g) => g.items.map((i) => i.href));
    expect(shown).toEqual(["/sopir"]);
    expect(shown).not.toContain("/tenants");
    expect(shown).not.toContain("/expenses");
  });

  // A dispatcher's grant is not a subset of the driver bundle -- it holds
  // distribution.read.distribution_orders and a dozen other codes no driver
  // does -- so even though every one of the driver bundle's own permissions
  // could theoretically overlap, one grant outside it is enough to keep the
  // full console.
  it("keeps the full console for a role whose grants merely overlap the driver bundle", () => {
    const almostDriver = [
      PERMISSIONS.DELIVERIES_EXECUTE,
      PERMISSIONS.EXPENSES_VIEW,
      PERMISSIONS.OCR_ARCHIVE_VIEW,
      PERMISSIONS.DISTRIBUTION_VIEW,
    ];
    expect(usesDriverConsole(almostDriver)).toBe(false);
  });
});

describe("the nav a role is shown", () => {
  const hrefs = (permissions: readonly string[]) =>
    navGroupsFor(permissions, "manual").flatMap((g) => g.items.map((i) => i.href));

  // The bug this whole gate exists for. GET /monitoring/board requires
  // deliveries read AND gps_tracks read; warehouse_staff, finance_officer and
  // auditor_viewer hold the first without the second. Before the nav knew
  // that, all three were shown "Monitoring Distribusi", clicked it, and met a
  // 403 the menu had promised would work.
  it("hides Monitoring from a role holding deliveries read but not telemetry", () => {
    expect(hrefs([PERMISSIONS.DELIVERIES_VIEW])).not.toContain("/monitoring");
  });

  it("shows Monitoring only when both permissions are held", () => {
    expect(
      hrefs([PERMISSIONS.DELIVERIES_VIEW, PERMISSIONS.GPS_TRACKS_VIEW]),
    ).toContain("/monitoring");
  });

  // Outlets are their own resource. A role granted outlets and not products --
  // which is exactly what a dispatcher is -- must reach the outlet pages the
  // monitoring board deep-links to.
  it("shows outlets to a role holding outlets read, without products", () => {
    expect(hrefs([PERMISSIONS.OUTLETS_VIEW])).toContain("/outlet");
    expect(hrefs([PERMISSIONS.OUTLETS_VIEW])).not.toContain("/products");
  });

  it("hides outlets from a role holding only products read", () => {
    expect(hrefs([PERMISSIONS.PRODUCTS_VIEW])).not.toContain("/outlet");
  });

  // A viewer was shown "Buku Besar" -- the agency's whole finance position --
  // and found out by clicking.
  it("hides a page a role cannot open rather than letting them find out", () => {
    const viewer = [PERMISSIONS.SA_VIEW, PERMISSIONS.ORDERS_VIEW];
    const shown = hrefs(viewer);
    expect(shown).toContain("/sa");
    expect(shown).toContain("/orders");
    expect(shown).not.toContain("/ledger");
    expect(shown).not.toContain("/users");
  });

  // Otherwise "Keuangan" renders as a heading with nothing under it.
  it("drops a group whose every item was filtered away", () => {
    const labels = navGroupsFor([PERMISSIONS.SA_VIEW]).map((g) => g.label);
    expect(labels).not.toContain("Keuangan");
  });

  // The two ungated routes stay reachable: an item with no permission means
  // "always show", not "show to nobody".
  it("keeps an item that names no permission", () => {
    expect(hrefs([]).length).toBeGreaterThan(0);
    expect(hrefs([])).toContain("/dashboard");
  });

  // A sopir gets a different menu, not a filtered one, and that must survive
  // the filtering being added around it.
  it("still gives a sopir their own console rather than a filtered tree", () => {
    const driver = [PERMISSIONS.DELIVERIES_EXECUTE];
    expect(usesDriverConsole(driver)).toBe(true);
    expect(hrefs(driver)).toContain("/sopir");
    expect(hrefs(driver)).not.toContain("/dashboard");
  });
});
