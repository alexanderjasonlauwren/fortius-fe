import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store/authStore";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { resolveRange } from "@/features/reports/api/contract";
import { getFinanceReport } from "@/features/financereports/api/financereportsApi";
import { todayIso } from "@/features/financereports/lib/period";
import { addDaysIso, agingSplit, reportTotal } from "@/features/financedashboard/lib/summary";
import { scopeKey } from "@/lib/scope";
import { getGrossMargin, getMonthlyReceivables, getVerifiedCash } from "../api/financeSummary";
import type { FinanceTotal } from "../api/financeSummary.contract";

const complete = (amount: number): FinanceTotal => ({ complete: true, amount });

/**
 * Beranda's finance strip. With the report pack (finance.read.reports) it
 * reads today's position off the reports themselves -- kas & bank, piutang
 * past due, hutang due within a week -- which have no row cap. Without it,
 * the older figures summed from the first page of payments and invoices
 * stay, so a role that saw them before still does (accounting parity P6).
 */
export function useFinanceSummary() {
  const canSeeReports = useAuthStore((state) => state.hasPermission(PERMISSIONS.FINANCE_REPORTS_VIEW));
  const canSeeDashboard = useAuthStore((state) =>
    state.hasPermission(PERMISSIONS.FINANCE_REPORTS_VIEW) && state.hasPermission(PERMISSIONS.FINANCIAL_STATEMENTS_VIEW));
  const canSeeCash = useAuthStore((state) => state.hasPermission(PERMISSIONS.PAYMENTS_VIEW)) && !canSeeReports;
  const canSeeReceivables = useAuthStore((state) => state.hasPermission(PERMISSIONS.INVOICES_VIEW)) && !canSeeReports;
  const canSeeMargin = useAuthStore((state) => state.hasPermission(PERMISSIONS.JOURNALS_VIEW));
  const window = resolveRange("bulan-ini");
  const today = todayIso();
  const weekAhead = addDaysIso(today, 7);
  const key = [...scopeKey(), "dashboard-finance", window.from, window.to];

  const cash = useQuery({
    queryKey: [...key, "cash"], queryFn: () => getVerifiedCash(window), enabled: canSeeCash,
  });
  const receivables = useQuery({
    queryKey: [...key, "receivables"], queryFn: () => getMonthlyReceivables(window), enabled: canSeeReceivables,
  });
  const margin = useQuery({
    queryKey: [...key, "margin"], queryFn: () => getGrossMargin(window), enabled: canSeeMargin,
  });
  const bank = useQuery({
    queryKey: [...key, "bank", today],
    queryFn: () => getFinanceReport("bank_summary", { from: window.from, to: today }),
    select: (r) => complete(reportTotal(r, "closing")),
    enabled: canSeeReports,
  });
  const overdueReceivables = useQuery({
    queryKey: [...key, "ar", today],
    queryFn: () => getFinanceReport("ar_aging", { asOf: today }),
    select: (r) => complete(agingSplit(r).overdue),
    enabled: canSeeReports,
  });
  // Aged as of a week ahead, everything not "current" then is due within
  // the week -- or already past due.
  const payablesDue = useQuery({
    queryKey: [...key, "ap", weekAhead],
    queryFn: () => getFinanceReport("ap_aging", { asOf: weekAhead }),
    select: (r) => complete(agingSplit(r).overdue),
    enabled: canSeeReports,
  });

  return { window, cash, receivables, margin, bank, overdueReceivables, payablesDue,
    canSeeCash, canSeeReceivables, canSeeMargin, canSeeReports, canSeeDashboard,
    refetch: () => {
      if (canSeeCash) void cash.refetch();
      if (canSeeReceivables) void receivables.refetch();
      if (canSeeMargin) void margin.refetch();
      if (canSeeReports) {
        void bank.refetch();
        void overdueReceivables.refetch();
        void payablesDue.refetch();
      }
    },
  };
}
