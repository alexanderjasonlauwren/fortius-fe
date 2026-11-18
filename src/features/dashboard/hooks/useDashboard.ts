import { scopeKey } from "@/lib/scope";
import { useQuery } from "@tanstack/react-query";
import { useIntakePolicy } from "@/features/distribution/hooks/useIntakePolicy";
import { useAuthStore } from "@/features/auth/store/authStore";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { getRecentAudit, getSummary } from "../api/dashboardApi";

/**
 * Beranda's operational tiles read one query (Round 1 G15): the rail, the
 * chart, the shares and the activity table all come from the same
 * `/dashboard/summary` response, so they load, refresh and fail together.
 */
export function useDashboard() {
  const intakePolicy = useIntakePolicy();
  const canReadOrders = useAuthStore((state) => state.hasPermission(PERMISSIONS.ORDERS_VIEW));
  const showManualOrders = intakePolicy.allowsManualIntake && canReadOrders;
  const summary = useQuery({ queryKey: [...scopeKey(), "dashboard-summary"], queryFn: getSummary });
  const audit = useQuery({ queryKey: [...scopeKey(), "recent-audit"], queryFn: () => getRecentAudit(6) });
  const data = summary.data;

  return {
    showManualOrders,
    // Open orders mean nothing where the agent takes no manual orders.
    kpi: data && { ...data.kpi, openOrders: showManualOrders ? data.kpi.openOrders : 0 },
    rail: data?.rail,
    monthlyChart: data?.monthlyChart ?? [],
    outletShares: data?.outletShares ?? [],
    recentActivities: data?.recentActivities ?? [],
    audit: audit.data ?? [],
    isLoading: summary.isLoading,
    isLoadingCharts: summary.isLoading,
    isLoadingActivities: summary.isLoading,
    isError: summary.isError,
    error: summary.error as Error | null,
    refetch: () => {
      void summary.refetch();
      void audit.refetch();
    },
  };
}
