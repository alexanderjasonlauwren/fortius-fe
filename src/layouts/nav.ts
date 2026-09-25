import type { LucideIcon } from "lucide-react";
import { allowsManualIntake, type OrderIntakeMode } from "@/features/distribution/api/intakePolicy.contract";
import { PERMISSIONS } from "@/features/rbac/permissions";
import {
  Network,
  Bell,
  BookOpen,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  FileText,
  Fuel,
  IdCard,
  LayoutDashboard,
  Map,
  MapPin,
  Receipt,
  ReceiptText,
  Route,
  Settings,
  Store,
  Table2,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { outletLabel, outletLabelTitle, supplierLabel, unitLabel } from "@/lib/lexicon";

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  /** One line explaining what the page is for, used in the command palette. */
  hint: string;
  /**
   * The permission this item's route asserts, mirrored here so the link is
   * hidden rather than merely refused.
   *
   * Undefined means "always show", which is honest for the two ungated routes
   * (Notifikasi, Pengaturan). Where it is set it must match what App.tsx
   * actually checks — a nav entry claiming a different permission than its
   * route is worse than none, because it hides a page somebody may open.
   *
   * Several permissions means all of them, matching the backend's own AND:
   * the monitoring board needs deliveries read AND gps_tracks read, and a
   * role holding only the first must not be shown a page whose one request
   * answers 403.
   */
  permission?: string | readonly string[];
}

export interface NavGroup {
  /** Groups follow the working day: intake, dispatch, then money. */
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Menu utama",
    items: [
      {
        name: "Beranda",
        href: "/dashboard",
        icon: LayoutDashboard,
        hint: "Papan berangkat hari ini dan angka kunci",
      },
      {
        name: "Laporan Keuangan",
        href: "/reports",
        icon: FileText,
        hint: "Rekap distribusi, kas terverifikasi, dan piutang per periode",
        permission: PERMISSIONS.INVOICES_VIEW,
      },
    ],
  },
  {
    label: "Operasi harian",
    items: [
      {
        name: `Pesanan ${outletLabelTitle()}`,
        href: "/orders",
        icon: ClipboardList,
        hint: "Permintaan masuk yang menunggu persetujuan",
        permission: PERMISSIONS.ORDERS_VIEW,
      },
      {
        name: "Schedule Agreement",
        href: "/sa",
        icon: FileText,
        hint: `Kuota dari ${supplierLabel()} dan sisa yang bisa ditarik`,
        permission: PERMISSIONS.SA_VIEW,
      },
      {
        name: "Perencanaan Distribusi",
        href: "/distribution",
        icon: Truck,
        hint: "Susun rute, tetapkan armada, konfirmasi rencana",
        permission: PERMISSIONS.DISTRIBUTION_VIEW,
      },
      {
        name: "Monitoring Distribusi",
        href: "/monitoring",
        icon: Map,
        hint: "Posisi armada dan status tiap surat jalan",
        permission: [PERMISSIONS.DELIVERIES_VIEW, PERMISSIONS.GPS_TRACKS_VIEW],
      },
      {
        name: "Verifikasi Pembayaran",
        href: "/payment-control",
        icon: ClipboardCheck,
        hint: "Dana terverifikasi per pangkalan sebelum armada berangkat",
        permission: PERMISSIONS.PAYMENTS_VIEW,
      },
      {
        name: "Klaim Transportasi",
        href: "/transportation-claims",
        icon: FileSignature,
        hint: "Catat BAST dan status klaim biaya transportasi ke prinsipal",
        permission: PERMISSIONS.TRANSPORTATION_CLAIMS_VIEW,
      },
    ],
  },
  {
    label: "Keuangan",
    items: [
      {
        name: "Pengeluaran & Kas Kecil",
        href: "/expenses",
        icon: Fuel,
        hint: "Catat biaya operasional dan persetujuannya",
        permission: PERMISSIONS.EXPENSES_VIEW,
      },
      {
        name: "Bukti Pengeluaran",
        href: "/ocr",
        icon: Receipt,
        hint: "Catat dan klasifikasikan struk biaya operasional",
        permission: [PERMISSIONS.OCR_VIEW, PERMISSIONS.OCR_ARCHIVE_VIEW],
      },
      {
        name: "Piutang",
        href: "/receivables",
        icon: ReceiptText,
        hint: "Umur piutang, tagihan, dan nota kredit",
        permission: PERMISSIONS.PAYMENTS_VIEW,
      },
      {
        name: "Penerimaan Kas",
        href: "/payments",
        icon: Wallet,
        hint: "Uang masuk dan alokasinya ke tagihan",
        permission: PERMISSIONS.PAYMENTS_VIEW,
      },
      {
        name: "Buku Besar",
        href: "/ledger",
        icon: BookOpen,
        hint: "Jurnal, neraca saldo, dan laba rugi",
        permission: PERMISSIONS.JOURNALS_VIEW,
      },
      {
        name: "Rekap Transaksi",
        href: "/transactions",
        icon: Table2,
        hint: "Daftar seluruh transaksi, disaring dan diekspor ke Excel",
        permission: PERMISSIONS.INVOICES_VIEW,
      },
    ],
  },
  {
    label: "Data induk",
    items: [
      {
        name: outletLabelTitle(),
        href: "/outlet",
        icon: Store,
        hint: `Daftar ${outletLabel()}, kuota, dan penanggung jawab`,
        permission: PERMISSIONS.OUTLETS_VIEW,
      },
      {
        name: "Driver",
        href: "/drivers",
        icon: IdCard,
        hint: "Pengemudi, SIM, dan kinerja 30 hari",
        permission: PERMISSIONS.DRIVERS_VIEW,
      },
      // Two entries, because the service serves two lists. A driver swaps
      // trucks and a truck swaps drivers, so neither owns the other and the
      // pairing belongs to the run -- see mocks/fleet.ts.
      {
        name: "Armada",
        href: "/vehicles",
        icon: Truck,
        hint: "Kendaraan, kapasitas angkut, dan masa berlaku STNK/KIR",
        permission: PERMISSIONS.VEHICLES_VIEW,
      },
      {
        name: "Pagar Geografis",
        href: "/geofence",
        icon: MapPin,
        hint: "Batas depot dan wilayah yang diperiksa terhadap posisi armada",
        permission: PERMISSIONS.GEOFENCE_VIEW,
      },
      {
        name: "Produk",
        href: "/products",
        icon: Fuel,
        hint: `Katalog ${unitLabel()}, harga, dan stok gudang`,
        permission: PERMISSIONS.PRODUCTS_VIEW,
      },
      {
        // Above Pengguna & Akses on purpose: a user belongs to a tenant, so the
        // structure reads before the people in it.
        name: "Tenant",
        href: "/tenants",
        icon: Network,
        hint: "Struktur perusahaan, sub-tenant, dan cabang pertamanya",
        permission: PERMISSIONS.SETTINGS_VIEW,
      },
      {
        name: "Pengguna & Akses",
        href: "/users",
        icon: Users,
        hint: "Akun tim dan jejak aktivitas sistem",
        permission: PERMISSIONS.USER_ROLES_VIEW,
      },
    ],
  },
];

/**
 * The sopir's console.
 *
 * A separate tree rather than a filtered one: a driver does not need a smaller
 * version of the dispatcher's menu, they need a different menu. Hiding twenty
 * items they can never use would still leave the console shaped like somebody
 * else's job.
 */
export const DRIVER_NAV_GROUPS: NavGroup[] = [
  {
    label: "Tugas saya",
    items: [
      {
        name: "Rute Saya",
        href: "/sopir",
        icon: Route,
        hint: "Pemberhentian hari ini dan pencatatan penerimaan",
        permission: PERMISSIONS.DELIVERIES_EXECUTE,
      },
    ],
  },
];

export const BOTTOM_NAV: NavItem[] = [
  {
    name: "Notifikasi",
    href: "/notifications",
    icon: Bell,
    hint: "Peringatan kuota, keterlambatan, dan tagihan",
  },
  {
    name: "Pengaturan",
    href: "/settings",
    icon: Settings,
    hint: "Profil agen, harga, pengingat, dan data",
  },
];

/** Every group in the application, whichever console it belongs to. */
export const ALL_NAV_GROUPS: NavGroup[] = [...NAV_GROUPS, ...DRIVER_NAV_GROUPS];

export const ALL_NAV_ITEMS: NavItem[] = [
  ...ALL_NAV_GROUPS.flatMap((g) => g.items),
  ...BOTTOM_NAV,
];

/**
 * The permissions the seeded `driver` role grants -- mirrors
 * fortius-backend/seeds/04-role-permissions/seeder.go, rolePermissionMap
 * ["driver"], the same trade tenantprovisioning's maxTenantDepth makes on the
 * backend: the seed is the source of truth, and duplicating its shape here is
 * what lets usesDriverConsole recognise the role without asking the question
 * below, which has no honest answer.
 *
 * Kept in sync by hand. A permission the seed adds to the driver role and this
 * set does not gets treated as "holds something outside the driver bundle",
 * which sends a real driver to the twenty-item console instead of narrowing
 * it -- the safe direction to be wrong in, but worth fixing here too.
 */
const DRIVER_ROLE_PERMISSIONS = new Set<string>([
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
]);

/**
 * Whether this person works from the driver console.
 *
 * Derived from what they may do, not from a role name. The console used to ask
 * `role === "driver"`, which assumed one role per user; the backend has never
 * worked that way -- authority is a set of grants from iam.user_roles, a person
 * may hold several roles at once, and there is no `role` column on iam.users to
 * read. So the question had no honest answer and the API adapter had to invent
 * one.
 *
 * The real question is narrower and answerable: someone who may record a
 * delivery and holds nothing outside the driver bundle above has only one
 * screen to be on. A dispatcher who can also execute deliveries holds
 * `distribution.read.distribution_orders` and a dozen other grants no driver
 * does, so the subset check below fails for them and they keep the full
 * console -- the correct outcome, and the one a role name (or an exact
 * one-permission match, which this used to be) got wrong the moment the
 * driver role legitimately grew past a single permission.
 */
export function usesDriverConsole(permissions: readonly string[] = []): boolean {
  return (
    permissions.includes(PERMISSIONS.DELIVERIES_EXECUTE) &&
    permissions.every((code) => DRIVER_ROLE_PERMISSIONS.has(code))
  );
}

/**
 * Whether this person may open the page an item links to.
 *
 * All of them when several are named, matching what the route asserts and what
 * the backend enforces.
 */
export function mayOpen(item: NavItem, permissions: readonly string[]): boolean {
  if (!item.permission) return true;
  const required = Array.isArray(item.permission)
    ? item.permission
    : [item.permission as string];
  return required.every((code) => permissions.includes(code));
}

/**
 * The menu this person actually works from.
 *
 * Two things happen here. A sopir gets a different menu, not a filtered one --
 * their console is one screen and the twenty-item tree would be noise. Everyone
 * else gets the full tree with the items they cannot open removed.
 *
 * Filtering matters more than it looks: until this existed, every role saw all
 * twenty links and found out by clicking. A viewer was shown "Buku Besar" --
 * the agency's whole finance position -- and met a refusal panel. Hiding a link
 * is not access control (RequirePermission is), but showing one that cannot
 * work is a promise the console does not keep.
 *
 * A group whose items are all filtered away is dropped, or "Keuangan" renders
 * as a heading with nothing under it.
 */
export function isAvailableForIntake(item: NavItem, mode?: OrderIntakeMode): boolean {
  return item.href !== "/orders" || allowsManualIntake(mode);
}

export function navGroupsFor(permissions?: readonly string[], mode?: OrderIntakeMode): NavGroup[] {
  if (usesDriverConsole(permissions)) return DRIVER_NAV_GROUPS;
  const held = permissions ?? [];
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => mayOpen(item, held) && isAvailableForIntake(item, mode)),
  })).filter((group) => group.items.length > 0);
}

/**
 * Where someone belongs after signing in.
 *
 * A sopir landing on the dashboard would open the console on a dispatch rail of
 * trucks that are not theirs, with their own run two taps away.
 */
export function landingPathFor(permissions?: readonly string[]): string {
  return usesDriverConsole(permissions) ? "/sopir" : "/dashboard";
}

/** Title shown in the header for a given path. */
export function titleFor(pathname: string): string {
  const exact = ALL_NAV_ITEMS.find((i) => i.href === pathname);
  if (exact) return exact.name;
  const prefix = ALL_NAV_ITEMS.filter((i) => pathname.startsWith(`${i.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return prefix?.name ?? "SiDistrib";
}

/** The group a path belongs to, used as the header eyebrow. */
export function sectionFor(pathname: string): string | undefined {
  return ALL_NAV_GROUPS.find((g) =>
    g.items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)),
  )?.label;
}
