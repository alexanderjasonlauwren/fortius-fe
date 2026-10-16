import { useEffect, useState } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import { useAuthStore } from "./features/auth/store/authStore";
import { setSessionExpiredHandler } from "./lib/api";
import { landingPathFor } from "./layouts/nav";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { LoginPage } from "./pages/auth/LoginPage";
import { DashboardPage } from "./pages/dashboard/DashboardPage";
import { OrderListPage } from "./pages/orders/OrderListPage";
import { SAManagementPage } from "./pages/sa/SAManagementPage";
import { SADetailPage } from "./pages/sa/SADetailPage";
import { DistributionPage } from "./pages/distribution/DistributionPage";
import { MonitoringPage } from "./pages/monitoring/MonitoringPage";
import { SIM3LONIntegrationPage } from "./pages/integration/SIM3LONIntegrationPage";
import { TransportationClaimListPage } from "./pages/transportation/TransportationClaimListPage";
import { TransportationClaimDocumentPage } from "./pages/transportation/TransportationClaimDocumentPage";
import { TransportationRecapPage } from "./pages/transportation/TransportationRecapPage";
import { ExpensePage } from "./pages/expenses/ExpensePage";
import { SopirPage } from "./pages/sopir/SopirPage";
import { OcrPage } from "./pages/ocr/OcrPage";
import { PaymentPage } from "./pages/payments/PaymentPage";
import { PaymentControlPage } from "./pages/payments/PaymentControlPage";
import { ReceivablesPage } from "./pages/receivables/ReceivablesPage";
import { InvoiceDetailPage } from "./pages/receivables/InvoiceDetailPage";
import { CashBankPage } from "./pages/cashbank/CashBankPage";
import { AssetsPage } from "./pages/assets/AssetsPage";
import { PurchaseDetailPage } from "./pages/purchases/PurchaseDetailPage";
import { PurchasesPage } from "./pages/purchases/PurchasesPage";
import { OpeningBalanceWizardPage } from "./pages/openingbalance/OpeningBalanceWizardPage";
import { LedgerPage } from "./pages/ledger/LedgerPage";
import { FinancialStatementsPage } from "./pages/financialstatements/FinancialStatementsPage";
import { ReportsPage } from "./pages/reports/ReportsPage";
import { AccountsPage } from "./pages/accounts/AccountsPage";
import { FinanceDashboardPage } from "./pages/financedashboard/FinanceDashboardPage";
import { FiscalYearsPage } from "./pages/fiscalyears/FiscalYearsPage";
import { FinanceReportsPage } from "./pages/financereports/FinanceReportsPage";
import { FinanceReportPage } from "./pages/financereports/FinanceReportPage";
import { TransactionListPage } from "./pages/transactions/TransactionListPage";
import { OutletListPage } from "./pages/outlet/OutletListPage";
import { OutletFormPage } from "./pages/outlet/OutletFormPage";
import { OutletDetailPage } from "./pages/outlet/OutletDetailPage";
import { GeofenceRulePage } from "./pages/geofence/GeofenceRulePage";
import { DriverPage } from "./pages/drivers/DriverPage";
import { DriverDetailPage } from "./pages/drivers/DriverDetailPage";
import { VehiclePage } from "./pages/vehicles/VehiclePage";
import { ProductListPage } from "./pages/products/ProductListPage";
import { ProductFormPage } from "./pages/products/ProductFormPage";
import { UserListPage } from "./pages/users/UserListPage";
import { NotificationPage } from "./pages/notifications/NotificationPage";
import { SettingsPage } from "./pages/settings/SettingsPage";
import { TenantListPage } from "./pages/tenants/TenantListPage";
import { TenantDetailPage } from "./pages/tenants/TenantDetailPage";
import { NotFoundPage } from "./pages/errors/NotFoundPage";
import { ErrorBoundary } from "./pages/errors/ErrorBoundary";
import { ProtectedRoute } from "./features/auth/components/ProtectedRoutes";
import { RequirePermission } from "./features/rbac/components/RequirePermission";
import { PERMISSIONS } from "./features/rbac/permissions";
import { outletLabel } from "@/lib/lexicon";

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
