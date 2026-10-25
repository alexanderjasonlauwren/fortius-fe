import { scopeKey } from "@/lib/scope";
import { useQuery } from "@tanstack/react-query";
import { useIntakePolicy } from "@/features/distribution/hooks/useIntakePolicy";
import { useAuthStore } from "@/features/auth/store/authStore";
import { PERMISSIONS } from "@/features/rbac/permissions";
import {
  getDispatchRail,
  getKpiSummary,
  getMonthlyChart,
  getOutletShares,
  getRecentActivities,
  getRecentAudit,
} from "../api/dashboardApi";

export function useDashboard() {
  const intakePolicy = useIntakePolicy();
  const canReadOrders = useAuthStore((state) => state.hasPermission(PERMISSIONS.ORDERS_VIEW));
  const showManualOrders = intakePolicy.allowsManualIntake && canReadOrders;
  const kpi = useQuery({
    queryKey: [...scopeKey(), "kpi", showManualOrders],
    queryFn: () => getKpiSummary(showManualOrders),
  });
  const rail = useQuery({ queryKey: [...scopeKey(), "dispatch-rail"], queryFn: getDispatchRail });
  const monthlyChart = useQuery({
    queryKey: [...scopeKey(), "monthly-chart"],
    queryFn: getMonthlyChart,
  });
  const outletShares = useQuery({
    queryKey: [...scopeKey(), "outlet-shares"],
    queryFn: getOutletShares,
  });
  const recentActivities = useQuery({
    queryKey: [...scopeKey(), "recent-activities"],
    queryFn: getRecentActivities,
  });
  const audit = useQuery({ queryKey: [...scopeKey(), "recent-audit"], queryFn: () => getRecentAudit(6) });

  return {
    showManualOrders,
    kpi: kpi.data,
    rail: rail.data,
    monthlyChart: monthlyChart.data ?? [],
    outletShares: outletShares.data ?? [],
    recentActivities: recentActivities.data ?? [],
    audit: audit.data ?? [],
    isLoading: kpi.isLoading || rail.isLoading,
    isLoadingCharts: monthlyChart.isLoading || outletShares.isLoading,
    isLoadingActivities: recentActivities.isLoading,
    isError: kpi.isError || rail.isError,
    error: (kpi.error ?? rail.error) as Error | null,
    refetch: () => {
      void kpi.refetch();
      void rail.refetch();
      void monthlyChart.refetch();
      void outletShares.refetch();
      void recentActivities.refetch();
      void audit.refetch();
    },
  };
}
