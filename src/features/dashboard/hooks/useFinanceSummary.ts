import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/store/authStore";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { resolveRange } from "@/features/reports/api/contract";
import { scopeKey } from "@/lib/scope";
import { getGrossMargin, getMonthlyReceivables, getVerifiedCash } from "../api/financeSummary";

export function useFinanceSummary() {
  const canSeeCash = useAuthStore((state) => state.hasPermission(PERMISSIONS.PAYMENTS_VIEW));
  const canSeeReceivables = useAuthStore((state) => state.hasPermission(PERMISSIONS.INVOICES_VIEW));
  const canSeeMargin = useAuthStore((state) => state.hasPermission(PERMISSIONS.JOURNALS_VIEW));
  const window = resolveRange("bulan-ini");
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
  return { window, cash, receivables, margin, canSeeCash, canSeeReceivables, canSeeMargin,
    refetch: () => {
      if (canSeeCash) void cash.refetch();
      if (canSeeReceivables) void receivables.refetch();
      if (canSeeMargin) void margin.refetch();
    },
  };
}
