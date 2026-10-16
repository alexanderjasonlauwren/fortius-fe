/**
 * Tutup Buku: the monthly lock (accounting parity P7) above closing and
 * reopening a fiscal year. Was a tab of Buku Besar until P6.
 */
import { FiscalYearSection } from "@/features/fiscalyears/components/FiscalYearSection";
import { MonthlyPeriodsPanel } from "@/features/accountingperiods/components/MonthlyPeriodsPanel";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";

export function FiscalYearsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Tutup Buku"
        description="Kunci bulanan untuk review dan penutupan periode, dan tutup tahun buku yang memindahkan laba rugi tahun itu ke Laba Ditahan."
      />
      <CanAccess permission={PERMISSIONS.ACCOUNTING_PERIODS_VIEW}>
        <MonthlyPeriodsPanel />
      </CanAccess>
      <FiscalYearSection />
    </div>
  );
}
