import { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { useAuthStore } from "./features/auth/store/authStore";
import { setSessionExpiredHandler } from "./lib/api";
import { landingPathFor } from "./layouts/nav";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { LoginPage } from "./pages/auth/LoginPage";
import { NotFoundPage } from "./pages/errors/NotFoundPage";
import { ErrorBoundary } from "./pages/errors/ErrorBoundary";
import { ProtectedRoute } from "./features/auth/components/ProtectedRoutes";
import { RequirePermission } from "./features/rbac/components/RequirePermission";
import { PERMISSIONS } from "./features/rbac/permissions";
import { outletLabel } from "@/lib/lexicon";
import { lazyPage } from "@/lib/lazyPage";

// Every console page loads on first visit, so the sign-in screen and the
// first page someone opens do not wait for the other forty-odd.
const DashboardPage = lazyPage(() => import("./pages/dashboard/DashboardPage"), "DashboardPage");
const OrderListPage = lazyPage(() => import("./pages/orders/OrderListPage"), "OrderListPage");
const SAManagementPage = lazyPage(() => import("./pages/sa/SAManagementPage"), "SAManagementPage");
const SADetailPage = lazyPage(() => import("./pages/sa/SADetailPage"), "SADetailPage");
const DistributionPage = lazyPage(() => import("./pages/distribution/DistributionPage"), "DistributionPage");
const MonitoringPage = lazyPage(() => import("./pages/monitoring/MonitoringPage"), "MonitoringPage");
const SIM3LONIntegrationPage = lazyPage(() => import("./pages/integration/SIM3LONIntegrationPage"), "SIM3LONIntegrationPage");
const TransportationClaimListPage = lazyPage(() => import("./pages/transportation/TransportationClaimListPage"), "TransportationClaimListPage");
const TransportationClaimDocumentPage = lazyPage(() => import("./pages/transportation/TransportationClaimDocumentPage"), "TransportationClaimDocumentPage");
const TransportationRecapPage = lazyPage(() => import("./pages/transportation/TransportationRecapPage"), "TransportationRecapPage");
const TransportInvoicePage = lazyPage(() => import("./pages/transportation/TransportInvoicePage"), "TransportInvoicePage");
const ExpensePage = lazyPage(() => import("./pages/expenses/ExpensePage"), "ExpensePage");
const SopirPage = lazyPage(() => import("./pages/sopir/SopirPage"), "SopirPage");
const OcrPage = lazyPage(() => import("./pages/ocr/OcrPage"), "OcrPage");
const PaymentPage = lazyPage(() => import("./pages/payments/PaymentPage"), "PaymentPage");
const PaymentControlPage = lazyPage(() => import("./pages/payments/PaymentControlPage"), "PaymentControlPage");
const ReceivablesPage = lazyPage(() => import("./pages/receivables/ReceivablesPage"), "ReceivablesPage");
const InvoiceDetailPage = lazyPage(() => import("./pages/receivables/InvoiceDetailPage"), "InvoiceDetailPage");
const CashBankPage = lazyPage(() => import("./pages/cashbank/CashBankPage"), "CashBankPage");
const AssetsPage = lazyPage(() => import("./pages/assets/AssetsPage"), "AssetsPage");
const PurchaseDetailPage = lazyPage(() => import("./pages/purchases/PurchaseDetailPage"), "PurchaseDetailPage");
const PurchasesPage = lazyPage(() => import("./pages/purchases/PurchasesPage"), "PurchasesPage");
const OpeningBalanceWizardPage = lazyPage(() => import("./pages/openingbalance/OpeningBalanceWizardPage"), "OpeningBalanceWizardPage");
const LedgerPage = lazyPage(() => import("./pages/ledger/LedgerPage"), "LedgerPage");
const FinancialStatementsPage = lazyPage(() => import("./pages/financialstatements/FinancialStatementsPage"), "FinancialStatementsPage");
const ReportsPage = lazyPage(() => import("./pages/reports/ReportsPage"), "ReportsPage");
const AccountsPage = lazyPage(() => import("./pages/accounts/AccountsPage"), "AccountsPage");
const FinanceDashboardPage = lazyPage(() => import("./pages/financedashboard/FinanceDashboardPage"), "FinanceDashboardPage");
const FiscalYearsPage = lazyPage(() => import("./pages/fiscalyears/FiscalYearsPage"), "FiscalYearsPage");
const ApprovalsPage = lazyPage(() => import("./pages/approvals/ApprovalsPage"), "ApprovalsPage");
const InventoryPage = lazyPage(() => import("./pages/inventory/InventoryPage"), "InventoryPage");
const FinanceReportsPage = lazyPage(() => import("./pages/financereports/FinanceReportsPage"), "FinanceReportsPage");
const FinanceReportPage = lazyPage(() => import("./pages/financereports/FinanceReportPage"), "FinanceReportPage");
const TransactionListPage = lazyPage(() => import("./pages/transactions/TransactionListPage"), "TransactionListPage");
const OutletListPage = lazyPage(() => import("./pages/outlet/OutletListPage"), "OutletListPage");
const OutletFormPage = lazyPage(() => import("./pages/outlet/OutletFormPage"), "OutletFormPage");
const OutletDetailPage = lazyPage(() => import("./pages/outlet/OutletDetailPage"), "OutletDetailPage");
const GeofenceRulePage = lazyPage(() => import("./pages/geofence/GeofenceRulePage"), "GeofenceRulePage");
const DriverPage = lazyPage(() => import("./pages/drivers/DriverPage"), "DriverPage");
const DriverDetailPage = lazyPage(() => import("./pages/drivers/DriverDetailPage"), "DriverDetailPage");
const VehiclePage = lazyPage(() => import("./pages/vehicles/VehiclePage"), "VehiclePage");
const ProductListPage = lazyPage(() => import("./pages/products/ProductListPage"), "ProductListPage");
const ProductFormPage = lazyPage(() => import("./pages/products/ProductFormPage"), "ProductFormPage");
const UserListPage = lazyPage(() => import("./pages/users/UserListPage"), "UserListPage");
const NotificationPage = lazyPage(() => import("./pages/notifications/NotificationPage"), "NotificationPage");
const SettingsPage = lazyPage(() => import("./pages/settings/SettingsPage"), "SettingsPage");
const TenantListPage = lazyPage(() => import("./pages/tenants/TenantListPage"), "TenantListPage");
const TenantDetailPage = lazyPage(() => import("./pages/tenants/TenantDetailPage"), "TenantDetailPage");

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <DashboardLayout />
      </ProtectedRoute>
    ),
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <HomeRedirect /> },

      // Operasi harian — intake through to the road.
      {
        path: "dashboard",
        element: (
          // Carries agency-wide finance figures — receivables, unverified
          // payments — so it is not the neutral landing page it looks like.
          <RequirePermission permission={PERMISSIONS.DISTRIBUTION_VIEW}>
            <DashboardPage />
          </RequirePermission>
        ),
      },
      { path: "orders", element: (
        <RequirePermission permission={PERMISSIONS.ORDERS_VIEW}>
          <OrderListPage />
        </RequirePermission>
      ) },
      { path: "sa", element: (
        <RequirePermission permission={PERMISSIONS.SA_VIEW}>
          <SAManagementPage />
        </RequirePermission>
      ) },
      { path: "sa/:id", element: (
        <RequirePermission permission={PERMISSIONS.SA_VIEW}>
          <SADetailPage />
        </RequirePermission>
      ) },
      { path: "distribution", element: (
        <RequirePermission permission={PERMISSIONS.DISTRIBUTION_VIEW}>
          <DistributionPage />
        </RequirePermission>
      ) },
      // Both, because GET /monitoring/board requires both and Require is an
      // AND. Gated on DELIVERIES_VIEW alone this page opened for three roles
      // whose only request on it answers 403.
      { path: "monitoring", element: (
        <RequirePermission
          permissions={[PERMISSIONS.DELIVERIES_VIEW, PERMISSIONS.GPS_TRACKS_VIEW]}
        >
          <MonitoringPage />
        </RequirePermission>
      ) },
      // The backend additionally restricts this to SPBE tenants; the permission
      // gate here only hides it from roles that cannot open it at all.
      { path: "integration/sim3lon", element: (
        <RequirePermission permission={PERMISSIONS.INTEGRATION_SIM3LON_VIEW}>
          <SIM3LONIntegrationPage />
        </RequirePermission>
      ) },
      { path: "transportation-claims", element: (
        <RequirePermission permission={PERMISSIONS.TRANSPORTATION_CLAIMS_VIEW}>
          <TransportationClaimListPage />
        </RequirePermission>
      ) },
      { path: "transportation-claims/recap", element: (
        <RequirePermission permission={PERMISSIONS.TRANSPORTATION_CLAIMS_VIEW}>
          <TransportationRecapPage />
        </RequirePermission>
      ) },
      { path: "transport-invoices", element: (
        <RequirePermission permission={PERMISSIONS.TRANSPORTATION_CLAIMS_VIEW}>
          <TransportInvoicePage />
        </RequirePermission>
      ) },
      { path: "transportation-claims/:id", element: (
        <RequirePermission permission={PERMISSIONS.TRANSPORTATION_CLAIMS_VIEW}>
          <TransportationClaimDocumentPage />
        </RequirePermission>
      ) },
      { path: "expenses", element: (
        <RequirePermission permission={PERMISSIONS.EXPENSES_VIEW}>
          <ExpensePage />
        </RequirePermission>
      ) },

      // Lapangan — the driver's own console.
      { path: "sopir", element: (
        <RequirePermission permission={PERMISSIONS.DELIVERIES_EXECUTE}>
          <SopirPage />
        </RequirePermission>
      ) },

      // Keuangan — what the day is worth.
      { path: "ocr", element: (
        <RequirePermission permissions={[PERMISSIONS.OCR_VIEW, PERMISSIONS.OCR_ARCHIVE_VIEW]}>
          <OcrPage />
        </RequirePermission>
      ) },
      { path: "receivables", element: (
        <RequirePermission permission={PERMISSIONS.PAYMENTS_VIEW}>
          <ReceivablesPage />
        </RequirePermission>
      ) },
      { path: "receivables/:id", element: (
        <RequirePermission permission={PERMISSIONS.INVOICES_VIEW}>
          <InvoiceDetailPage />
        </RequirePermission>
      ) },
      { path: "payments", element: (
        <RequirePermission permission={PERMISSIONS.PAYMENTS_VIEW}>
          <PaymentPage />
        </RequirePermission>
      ) },
      // Renamed "Alokasi Dana Pengiriman" in accounting parity P6: it funds
      // dispatch, it does not verify payments. The old path still lands.
      { path: "dispatch-funding", element: (
        <RequirePermission permission={PERMISSIONS.PAYMENTS_VIEW}>
          <PaymentControlPage />
        </RequirePermission>
      ) },
      { path: "payment-control", element: <Navigate to="/dispatch-funding" replace /> },
      { path: "cash-bank", element: (
        <RequirePermission permission={PERMISSIONS.CASH_VOUCHERS_VIEW}>
          <CashBankPage />
        </RequirePermission>
      ) },
      { path: "assets", element: (
        <RequirePermission permission={PERMISSIONS.ASSETS_VIEW}>
          <AssetsPage />
        </RequirePermission>
      ) },
      { path: "purchases", element: (
        <RequirePermission permission={PERMISSIONS.PURCHASES_VIEW}>
          <PurchasesPage />
        </RequirePermission>
      ) },
      { path: "purchases/:id", element: (
        <RequirePermission permission={PERMISSIONS.PURCHASES_VIEW}>
          <PurchaseDetailPage />
        </RequirePermission>
      ) },
      { path: "opening-balance", element: (
        <RequirePermission permission={PERMISSIONS.FISCAL_YEARS_VIEW}>
          <OpeningBalanceWizardPage />
        </RequirePermission>
      ) },
      { path: "accounts", element: (
        <RequirePermission permission={PERMISSIONS.ACCOUNTS_VIEW}>
          <AccountsPage />
        </RequirePermission>
      ) },
      // Client answer 5: voids and refunds wait here for a second person.
      { path: "approvals", element: (
        <RequirePermission permission={PERMISSIONS.VOID_REQUESTS_VIEW}>
          <ApprovalsPage />
        </RequirePermission>
      ) },
      { path: "inventory", element: (
        <RequirePermission permission={PERMISSIONS.INVENTORY_VIEW}>
          <InventoryPage />
        </RequirePermission>
      ) },
      { path: "fiscal-years", element: (
        <RequirePermission permission={PERMISSIONS.FISCAL_YEARS_VIEW}>
          <FiscalYearsPage />
        </RequirePermission>
      ) },
      { path: "ledger", element: (
        <RequirePermission permission={PERMISSIONS.JOURNALS_VIEW}>
          <LedgerPage />
        </RequirePermission>
      ) },
      { path: "financial-statements", element: (
        <RequirePermission permission={PERMISSIONS.FINANCIAL_STATEMENTS_VIEW}>
          <FinancialStatementsPage />
        </RequirePermission>
      ) },
      { path: "finance-dashboard", element: (
        <RequirePermission permissions={[PERMISSIONS.FINANCE_REPORTS_VIEW, PERMISSIONS.FINANCIAL_STATEMENTS_VIEW]}>
          <FinanceDashboardPage />
        </RequirePermission>
      ) },
      { path: "laporan", element: (
        <RequirePermission permission={PERMISSIONS.FINANCE_REPORTS_VIEW}>
          <FinanceReportsPage />
        </RequirePermission>
      ) },
      { path: "laporan/:key", element: (
        <RequirePermission permission={PERMISSIONS.FINANCE_REPORTS_VIEW}>
          <FinanceReportPage />
        </RequirePermission>
      ) },
      { path: "reports", element: (
        <RequirePermission permission={PERMISSIONS.INVOICES_VIEW}>
          <ReportsPage />
        </RequirePermission>
      ) },
      { path: "transactions", element: (
        <RequirePermission permission={PERMISSIONS.TRANSACTIONS_VIEW}>
          <TransactionListPage />
        </RequirePermission>
      ) },

      // Data induk.
      { path: outletLabel(), element: (
        <RequirePermission permission={PERMISSIONS.OUTLETS_VIEW}>
          <OutletListPage />
        </RequirePermission>
      ) },
      { path: `${outletLabel()}/new`, element: (
        <RequirePermission permission={PERMISSIONS.OUTLETS_EDIT}>
          <OutletFormPage />
        </RequirePermission>
      ) },
      { path: `${outletLabel()}/:id`, element: (
        <RequirePermission permission={PERMISSIONS.OUTLETS_VIEW}>
          <OutletDetailPage />
        </RequirePermission>
      ) },
      { path: `${outletLabel()}/:id/edit`, element: (
        <RequirePermission permission={PERMISSIONS.OUTLETS_EDIT}>
          <OutletFormPage />
        </RequirePermission>
      ) },
      { path: "geofence", element: (
        <RequirePermission permission={PERMISSIONS.GEOFENCE_VIEW}>
          <GeofenceRulePage />
        </RequirePermission>
      ) },
      { path: "drivers", element: (
        <RequirePermission permission={PERMISSIONS.DRIVERS_VIEW}>
          <DriverPage />
        </RequirePermission>
      ) },
      { path: "drivers/:id", element: (
        <RequirePermission permission={PERMISSIONS.DRIVERS_VIEW}>
          <DriverDetailPage />
        </RequirePermission>
      ) },
      { path: "vehicles", element: (
        <RequirePermission permission={PERMISSIONS.VEHICLES_VIEW}>
          <VehiclePage />
        </RequirePermission>
      ) },
      { path: "products", element: (
        <RequirePermission permission={PERMISSIONS.PRODUCTS_VIEW}>
          <ProductListPage />
        </RequirePermission>
      ) },
      { path: "products/new", element: (
        <RequirePermission permission={PERMISSIONS.PRODUCTS_EDIT}>
          <ProductFormPage />
        </RequirePermission>
      ) },
      { path: "products/:id/edit", element: (
        <RequirePermission permission={PERMISSIONS.PRODUCTS_EDIT}>
          <ProductFormPage />
        </RequirePermission>
      ) },
      { path: "users", element: (
        <RequirePermission permission={PERMISSIONS.USERS_VIEW}>
          <UserListPage />
        </RequirePermission>
      ) },
      { path: "system", element: <Navigate to="/settings" replace /> },

      { path: "tenants", element: (
        <RequirePermission permission={PERMISSIONS.SETTINGS_VIEW}>
          <TenantListPage />
        </RequirePermission>
      ) },
      { path: "tenants/:id", element: (
        <RequirePermission permission={PERMISSIONS.SETTINGS_VIEW}>
          <TenantDetailPage />
        </RequirePermission>
      ) },

      { path: "notifications", element: <NotificationPage /> },
      { path: "settings", element: <SettingsPage /> },

      { path: "*", element: <NotFoundPage /> },
    ],
  },
  { path: "*", element: <NotFoundPage /> },
]);

/** Sends each role to the console it works from. */
function HomeRedirect() {
  const permissions = useAuthStore((state) => state.user?.permissions);
  return <Navigate to={landingPathFor(permissions)} replace />;
}

/**
 * Restores the session before anything renders.
 *
 * The persisted store carries a token and `isAuthenticated`, never the
 * permission set — so on a page reload the console knows a session may exist
 * but not what it may do. `restore()` re-reads both from the source of truth;
 * until it answers, rendering would flash either a login screen at a signed-in
 * user or an empty menu at an authorised one.
 *
 * It also wires the 401 handler into the store. Without this, the fallback in
 * `lib/api.ts` clears tokens and navigates, leaving `isAuthenticated: true`
 * persisted behind it — a state the next load has to discover is a lie.
 */
function App() {
  const restore = useAuthStore((state) => state.restore);
  // Seeded from the token rather than set to true by an effect: with no token
  // there is nothing to restore, and a signed-out visitor should reach the
  // login screen on the first render instead of after a blank one.
  const [ready, setReady] = useState(() => localStorage.getItem("auth_token") === null);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      void useAuthStore.getState().logout();
      window.location.href = "/login";
    });
  }, []);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void restore().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // `ready` is read as a one-way latch, not a dependency to re-run on: once
    // it flips true the effect is finished for the lifetime of the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restore]);

  if (!ready) return null;

  return <RouterProvider router={router} />;
}

export default App;
