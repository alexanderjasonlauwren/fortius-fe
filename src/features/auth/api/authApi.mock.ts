/**
 * Authentication, against the mock database.
 *
 * This is where the role-to-permission table lives, and it belongs here rather
 * than in the store: it is sample data. The backend has no such table — it
 * resolves grants from `iam.user_roles` through `iam.role_permissions`, where a
 * user may hold several roles at once and each grant carries a scope. Keeping
 * the flat version next to the rest of the mock says plainly that it is a demo
 * fixture, not the console's model of authority.
 *
 * The codes are the backend's, so `hasPermission` means the same thing in both
 * builds. That is the whole point of the change that moved them: before it, the
 * mock granted `sa:view` and the API required
 * `distribution.read.schedule_agreements`, and no build ran both to notice.
 */
import { scopedDb } from "@/mocks/scope";
import { latency, mutate } from "@/mocks/db";
import { CONSOLE_ONLY_PERMISSIONS, PERMISSIONS } from "@/features/rbac/permissions";
import type { User, UserRole } from "@/types/auth";
import type { AuthApi, SessionResult } from "./contract";

/**
 * What each role may do. The console reads these to hide actions a user cannot
 * complete, rather than letting them fail at the point of submission.
 */
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  // Including the console-only codes: the demo shows every screen, and these
  // are the ones with no backend route behind them yet.
  admin: [...Object.values(PERMISSIONS)],
  manager: [
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PRODUCTS_EDIT,
    // Outlets are their own resource now. Roles that reached the outlet pages
    // through masterdata.*.products keep them by holding the real code.
    PERMISSIONS.OUTLETS_VIEW,
    PERMISSIONS.OUTLETS_EDIT,
    // The board needs both, as the backend does. Mirrors ops_manager, which
    // holds deliveries read, gps_tracks read and the whole geofence set.
    PERMISSIONS.DELIVERIES_VIEW,
    PERMISSIONS.GPS_TRACKS_VIEW,
    PERMISSIONS.GEOFENCE_VIEW,
    PERMISSIONS.GEOFENCE_CREATE,
    PERMISSIONS.GEOFENCE_EDIT,
    PERMISSIONS.GEOFENCE_DELETE,
    PERMISSIONS.GEOFENCE_ALERTS_VIEW,
    PERMISSIONS.GEOFENCE_ALERTS_ACK,
    PERMISSIONS.SA_VIEW,
    PERMISSIONS.SA_CREATE,
    PERMISSIONS.SA_EDIT,
    PERMISSIONS.SA_IMPORT,
    PERMISSIONS.DISTRIBUTION_VIEW,
    PERMISSIONS.DISTRIBUTION_CREATE,
    PERMISSIONS.DISTRIBUTION_EDIT,
    PERMISSIONS.DISTRIBUTION_APPROVE,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.DRIVERS_VIEW,
    PERMISSIONS.DRIVERS_ASSIGN,
    PERMISSIONS.VEHICLES_VIEW,
    PERMISSIONS.VEHICLES_MANAGE,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_EDIT,
    PERMISSIONS.INVOICES_VIEW,
    PERMISSIONS.INVOICES_EXPORT,
    PERMISSIONS.EXPENSES_VIEW,
    PERMISSIONS.EXPENSES_CREATE,
    PERMISSIONS.EXPENSES_APPROVE,
    PERMISSIONS.EXPENSE_CATEGORIES_VIEW,
    PERMISSIONS.OCR_CREATE,
    PERMISSIONS.OCR_VIEW,
    PERMISSIONS.OCR_VERIFY,
    PERMISSIONS.OCR_ARCHIVE_VIEW,
    PERMISSIONS.SETTINGS_VIEW,
  ],
  finance: [
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.PAYMENTS_CREATE,
    PERMISSIONS.PAYMENTS_VERIFY,
    PERMISSIONS.SA_VIEW,
    PERMISSIONS.DISTRIBUTION_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.INVOICES_VIEW,
    // "Buat tagihan" (gap-closing phase, Phase C) -- finance_officer holds
    // finance.create.invoices on the backend, the same code the manual
    // invoice route rides on.
    PERMISSIONS.INVOICES_CREATE,
    PERMISSIONS.INVOICES_EXPORT,
    // Picking a template when raising a registration invoice -- read-only
    // here, the same tier bank_statement_rules above takes: defining or
    // renaming a package stays with tenant_admin.
    PERMISSIONS.REGISTRATION_PACKAGES_VIEW,
    // Only finance_officer and tenant_admin hold journal read on the
    // backend -- this mock role is the finance_officer counterpart.
    PERMISSIONS.JOURNALS_VIEW,
    // Needed to pick a line account on a cash voucher or classify a bank
    // statement line (gap-closing phase, Phase B) -- mirrors the same
    // backend grant added this phase (seeds/04-role-permissions/seeder.go).
    PERMISSIONS.ACCOUNTS_VIEW,
    // Kas & Bank vouchers and rekening koran (gap-closing phase, Phase B).
    // Rules stay read-only here, the same tier the backend's own
    // finance_officer bundle gives them.
    PERMISSIONS.CASH_VOUCHERS_VIEW,
    PERMISSIONS.CASH_VOUCHERS_CREATE,
    PERMISSIONS.CASH_VOUCHERS_UPDATE,
    PERMISSIONS.CASH_VOUCHERS_APPROVE,
    PERMISSIONS.BANK_STATEMENTS_VIEW,
    PERMISSIONS.BANK_STATEMENTS_IMPORT,
    PERMISSIONS.BANK_STATEMENTS_CLASSIFY,
    PERMISSIONS.BANK_STATEMENT_RULES_VIEW,
    // The asset register and depreciation runs (gap-closing phase, Phase
    // D): read-only, the same tier journals/registration_packages above
    // take -- registering an asset or running depreciation stays with
    // tenant_admin.
    PERMISSIONS.ASSETS_VIEW,
    PERMISSIONS.DEPRECIATION_RUNS_VIEW,
    // Fiscal-year close/reopen and the opening-balance wizard (gap-closing
    // phase, Phase E): read-only, the same tier assets/depreciation_runs
    // above take -- closing (and especially reopening) a year, or
    // committing an opening balance, stays with tenant_admin.
    PERMISSIONS.FISCAL_YEARS_VIEW,
    PERMISSIONS.EXPENSES_VIEW,
    PERMISSIONS.EXPENSES_APPROVE,
    // Sub-ledger admin (gap-closing phase, Phase F): expense categories
    // read-only (needed to see which one an expense was filed against,
    // the same tier every expense-filing role holds); purchases full
    // read/create/verify; suppliers read-only to pick one on a general
    // purchase -- mirrors finance_officer's own grant exactly.
    PERMISSIONS.EXPENSE_CATEGORIES_VIEW,
    PERMISSIONS.SUPPLIERS_VIEW,
    PERMISSIONS.PURCHASES_VIEW,
    PERMISSIONS.PURCHASES_CREATE,
    PERMISSIONS.PURCHASES_VERIFY,
    PERMISSIONS.OCR_ARCHIVE_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.OUTLETS_VIEW,
    PERMISSIONS.SETTINGS_VIEW,
  ],
  staff: [
    PERMISSIONS.SA_VIEW,
    PERMISSIONS.DISTRIBUTION_VIEW,
    PERMISSIONS.DISTRIBUTION_CREATE,
    PERMISSIONS.DISTRIBUTION_EDIT,
    PERMISSIONS.DRIVERS_VIEW,
    PERMISSIONS.DRIVERS_ASSIGN,
    PERMISSIONS.DELIVERIES_VIEW,
    PERMISSIONS.DELIVERIES_EXECUTE,
    // A dispatcher watches the board and the fences it reports against, and
    // follows its rows through to the outlet they are for.
    PERMISSIONS.GPS_TRACKS_VIEW,
    PERMISSIONS.GEOFENCE_ALERTS_VIEW,
    PERMISSIONS.OUTLETS_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_CREATE,
    PERMISSIONS.ORDERS_EDIT,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.INVOICES_VIEW,
    PERMISSIONS.EXPENSES_VIEW,
    PERMISSIONS.EXPENSES_CREATE,
    // Picking a category when filing an expense claim -- mirrors
    // ops_manager/dispatcher's own real grant (gap-closing phase, Phase F).
    PERMISSIONS.EXPENSE_CATEGORIES_VIEW,
    PERMISSIONS.OCR_CREATE,
    PERMISSIONS.OCR_VIEW,
    PERMISSIONS.OCR_VERIFY,
    PERMISSIONS.OCR_ARCHIVE_VIEW,
  ],
  viewer: [
    PERMISSIONS.SA_VIEW,
    PERMISSIONS.DISTRIBUTION_VIEW,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.PAYMENTS_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.OUTLETS_VIEW,
    PERMISSIONS.DRIVERS_VIEW,
    PERMISSIONS.INVOICES_VIEW,
    PERMISSIONS.EXPENSES_VIEW,
    PERMISSIONS.OCR_ARCHIVE_VIEW,
    // Deliberately no GPS_TRACKS_VIEW, and therefore no Monitoring in the
    // nav. This is the demo's copy of the real gap: warehouse_staff,
    // finance_officer and auditor_viewer all hold deliveries read without
    // telemetry read, and the board requires both.
  ],
  /**
   * A sopir sees one thing: their own run, and what they must record on it.
   *
   * Deliberately the narrowest set in the table. Read permissions that look
   * harmless are not — DELIVERIES_VIEW opens the whole fleet board, and
   * DISTRIBUTION_VIEW opens the planner with every outlet's credit position on
   * it. Neither is anything a driver at a gate can act on.
   */
  driver: [
    PERMISSIONS.DELIVERIES_EXECUTE,
    PERMISSIONS.EXPENSES_VIEW,
    PERMISSIONS.EXPENSES_CREATE,
    // Mirrors the real driver role's own finance.read.expense_categories
    // grant (gap-closing phase, Phase F) -- needed to pick a category when
    // filing a fuel/toll/maintenance claim.
    PERMISSIONS.EXPENSE_CATEGORIES_VIEW,
    PERMISSIONS.OCR_CREATE,
    PERMISSIONS.OCR_VIEW,
    PERMISSIONS.OCR_VERIFY,
    PERMISSIONS.OCR_ARCHIVE_VIEW,
  ],
};

/** Stand-in for the password a real deployment would check against a hash. */
const DEMO_PASSWORD = "sidistrib";

/** Where the mock keeps "who is signed in" across a page reload. */
const MOCK_SESSION_KEY = "mock_session_user";

function sessionFor(accountId: string): SessionResult {
  const account = scopedDb().users.find((u) => u.id === accountId);
  if (!account) {
    throw new Error("Sesi tidak lagi berlaku. Silakan masuk kembali.");
  }

  const user: User = {
    id: account.id,
    email: account.email,
    name: account.nama,
    // One in the mock's fixture, a list on the wire. The demo has always had
    // exactly one role per account; the shape is what changed, not the data.
    roles: [account.role],
    permissions: ROLE_PERMISSIONS[account.role] ?? [],
    branch: account.cabang,
    branchIds: account.branchIds ?? [],
    scopeType: account.scopeType ?? "tenant",
    phone: account.telepon,
    driverId: account.driverId,
  };

  return { user, tenant: null, token: `mock-jwt-${account.id}` };
}

export const authApiMock: AuthApi = {
  async login(email: string, password: string): Promise<SessionResult> {
    await latency("write");

    if (!email.trim()) throw new Error("Masukkan alamat email Anda.");
    if (password.length < 6) {
      throw new Error("Kata sandi minimal 6 karakter.");
    }

    const account = scopedDb().users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
    );

    if (!account) {
      throw new Error(
        `Tidak ada akun terdaftar dengan email ${email.trim()}. Periksa kembali, atau hubungi admin agen Anda.`,
      );
    }
    if (password !== DEMO_PASSWORD) {
      throw new Error("Kata sandi salah. Untuk data contoh, gunakan “sidistrib”.");
    }
    if (account.status === "Nonaktif") {
      throw new Error(
        `Akun ${account.nama} dinonaktifkan. Minta admin mengaktifkannya kembali di halaman Pengguna & Akses.`,
      );
    }

    // Signing in is itself a recorded event, and flips an invited account to
    // active — the same thing a real backend would do.
    mutate((db) => {
      const row = db.users.find((u) => u.id === account.id);
      if (row) {
        row.terakhirMasuk = new Date().toISOString();
        if (row.status === "Diundang") row.status = "Aktif";
      }
    });

    localStorage.setItem(MOCK_SESSION_KEY, account.id);
    return sessionFor(account.id);
  },

  async session(): Promise<SessionResult> {
    const accountId = localStorage.getItem(MOCK_SESSION_KEY);
    if (!accountId) throw new Error("Sesi tidak ditemukan. Silakan masuk kembali.");
    return sessionFor(accountId);
  },

  async logout(): Promise<void> {
    localStorage.removeItem(MOCK_SESSION_KEY);
  },
};

/**
 * Exported for the test that asserts the mock grants exactly the console-only
 * codes and no invented ones — the check that keeps this table honest as the
 * backend catalogue grows.
 */
export const mockRolePermissions = ROLE_PERMISSIONS;
export { CONSOLE_ONLY_PERMISSIONS };
