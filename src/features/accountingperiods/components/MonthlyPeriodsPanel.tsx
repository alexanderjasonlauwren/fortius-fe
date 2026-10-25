/**
 * The twelve months of a year and their lock (accounting parity P7, client
 * requirement §16): open, under review -- only finance may still post -- or
 * closed. Moving a month is one click; reopening a closed one asks why,
 * because figures already reported are about to be allowed to change.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, LockOpen, Search } from "lucide-react";
import {
  PERIOD_STATUS_LABEL,
  listAccountingPeriods,
  setAccountingPeriodStatus,
  type AccountingPeriod,
  type PeriodStatus,
} from "@/features/accountingperiods/api/accountingPeriodApi";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { SelectInput } from "@/components/common/Field";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ReasonDialog } from "@/components/common/ReasonDialog";
import { Button } from "@/components/ui/button";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { formatDateId } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

const VARIANT: Record<PeriodStatus, "success" | "warning" | "draft"> = { open: "success", review: "warning", closed: "draft" };

function monthName(period: string): string {
  return MONTHS[Number(period.slice(5, 7)) - 1] ?? period;
}

export function MonthlyPeriodsPanel() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [reopening, setReopening] = useState<AccountingPeriod | null>(null);
  const months = useQuery({
    queryKey: [...scopeKey(), "accounting-periods", year],
    queryFn: () => listAccountingPeriods(year),
  });

  const move = useDeskMutation({
    mutationFn: (input: { month: AccountingPeriod; status: PeriodStatus; reason?: string }) =>
      setAccountingPeriodStatus(input.month.period, { status: input.status, version: input.month.version, reason: input.reason }),
    errorTitle: "Status periode gagal diubah",
    success: (result) => ({ title: `${monthName(result.period)} ${result.period.slice(0, 4)}: ${PERIOD_STATUS_LABEL[result.status].toLowerCase()}` }),
    onDone: () => setReopening(null),
  });

  const current = new Date().getFullYear();
  return (
    <Panel>
      <PanelHeader
        title="Periode bulanan"
        hint="Terbuka: semua yang berwenang bisa mencatat. Ditinjau: hanya tim keuangan. Ditutup: tidak ada yang bisa mencatat; pembatalan dokumen masuk ke bulan terbuka berikutnya."
        actions={
          <SelectInput aria-label="Tahun" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[current + 1, current, current - 1, current - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </SelectInput>
        }
      />
      {months.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <ul className="divide-y divide-line">
          {(months.data ?? []).map((m) => (
            <li key={m.period} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span className="w-24 text-sm font-semibold text-ink">{monthName(m.period)}</span>
                <StatusBadge label={PERIOD_STATUS_LABEL[m.status]} variant={VARIANT[m.status]} />
                <span className="data text-xs text-ink-muted">{m.journals} jurnal</span>
                {m.yearClosed ? (
                  <span className="text-xs text-ink-muted">tahun buku ditutup</span>
                ) : m.changedAt ? (
                  <span className="text-xs text-ink-muted">
                    {formatDateId(m.changedAt)}{m.changedBy ? ` · ${m.changedBy}` : ""}{m.reason ? ` · ${m.reason}` : ""}
                  </span>
                ) : null}
              </div>
              {!m.yearClosed && (
                <CanAccess permission={PERMISSIONS.ACCOUNTING_PERIODS_UPDATE}>
                  <div className="flex gap-2">
                    {m.status === "open" && (
                      <Button variant="outline" size="sm" disabled={move.isPending} onClick={() => move.mutate({ month: m, status: "review" })}>
                        <Search className="h-3.5 w-3.5" /> Tinjau
                      </Button>
                    )}
                    {m.status !== "closed" && (
                      <Button variant="outline" size="sm" disabled={move.isPending} onClick={() => move.mutate({ month: m, status: "closed" })}>
                        <Lock className="h-3.5 w-3.5" /> Tutup
                      </Button>
                    )}
                    {m.status === "review" && (
                      <Button variant="ghost" size="sm" disabled={move.isPending} onClick={() => move.mutate({ month: m, status: "open" })}>
                        Buka
                      </Button>
                    )}
                    {m.status === "closed" && (
                      <Button variant="outline" size="sm" onClick={() => setReopening(m)}>
                        <LockOpen className="h-3.5 w-3.5" /> Buka kembali
                      </Button>
                    )}
                  </div>
                </CanAccess>
              )}
            </li>
          ))}
        </ul>
      )}
      <ReasonDialog
        open={!!reopening}
        title={reopening ? `Buka kembali ${monthName(reopening.period)} ${reopening.period.slice(0, 4)}` : ""}
        description="Angka bulan ini mungkin sudah dilaporkan. Alasan membuka kembali dicatat bersama periodenya."
        confirmLabel="Buka kembali"
        placeholder="Contoh: koreksi nota kredit yang terlambat dicatat"
        pending={move.isPending}
        onConfirm={(reason) => reopening && move.mutate({ month: reopening, status: "open", reason })}
        onClose={() => setReopening(null)}
      />
    </Panel>
  );
}
