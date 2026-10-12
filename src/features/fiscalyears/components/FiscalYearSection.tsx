/**
 * "Tutup Buku": close/reopen a fiscal year, and the entry point into the
 * opening-balance wizard. Financial-statements plan P7.1/P7.2, gap-closing
 * plan Phase E.
 *
 * ListFiscalYears only ever returns a row for a year that has been closed
 * (and possibly reopened since) -- a year nobody has ever touched has no
 * row at all, "open" only by the absence of one. So this list is a
 * history, not a catalogue of closeable years: "Tutup tahun" below always
 * lets the user type which year to close (defaulting to the current one),
 * rather than this trying to guess a set of "closeable" years up front.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LockOpen, Plus, Upload } from "lucide-react";
import { listFiscalYears, type FiscalYearView } from "@/features/fiscalyears/api/fiscalYearApi";
import { CloseYearDialog } from "./CloseYearDialog";
import { ReopenYearDialog } from "./ReopenYearDialog";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatDateId } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

export function FiscalYearSection() {
  const navigate = useNavigate();
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenTarget, setReopenTarget] = useState<FiscalYearView | null>(null);

  const years = useQuery({ queryKey: [...scopeKey(), "fiscal-years"], queryFn: listFiscalYears });

  return (
    <>
      <Panel>
        <PanelHeader
          title="Tahun buku"
          hint="Hanya tahun yang pernah ditutup tercantum di sini -- tahun lain masih terbuka."
          actions={
            <div className="flex gap-2">
              <CanAccess permission={PERMISSIONS.FISCAL_YEARS_VIEW}>
                <Button variant="outline" size="sm" onClick={() => navigate("/opening-balance")}>
                  <Upload className="h-3.5 w-3.5" />
                  Saldo awal
                </Button>
              </CanAccess>
              <CanAccess permission={PERMISSIONS.FISCAL_YEARS_CLOSE}>
                <Button size="sm" onClick={() => setCloseOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Tutup tahun
                </Button>
              </CanAccess>
            </div>
          }
        />
        {years.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (years.data ?? []).length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-muted">
            Belum ada tahun buku yang ditutup.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {(years.data ?? []).map((fy) => (
              <li key={fy.year} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="data text-sm font-semibold text-ink">{fy.year}</span>
                  <StatusBadge
                    label={fy.status === "closed" ? "Tertutup" : "Terbuka"}
                    variant={fy.status === "closed" ? "draft" : "success"}
                  />
                  {fy.status === "closed" && fy.closedAt && (
                    <span className="text-xs text-ink-muted">ditutup {formatDateId(fy.closedAt)}</span>
                  )}
                </div>
                {fy.status === "closed" && (
                  <CanAccess permission={PERMISSIONS.FISCAL_YEARS_REOPEN}>
                    <Button variant="outline" size="sm" onClick={() => setReopenTarget(fy)}>
                      <LockOpen className="h-3.5 w-3.5" />
                      Buka kembali
                    </Button>
                  </CanAccess>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <CloseYearDialog
        // Forces a fresh mount on every open -- without this, the
        // dialog's own lazy initial `year` state (computed once, on
        // first mount) would keep whatever was last typed instead of
        // resetting to the current year, the same staleness
        // RunDepreciationDialog's own key fixes for the identical
        // reason (gap-closing plan, Phase D).
        key={closeOpen ? "open" : "closed"}
        open={closeOpen} onClose={() => setCloseOpen(false)} onClosed={() => void years.refetch()}
      />
      <ReopenYearDialog year={reopenTarget} onClose={() => setReopenTarget(null)} onReopened={() => void years.refetch()} />
    </>
  );
}
