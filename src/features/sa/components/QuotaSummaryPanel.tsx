import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Meter, Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { cn } from "@/lib/utils";
import { formatDateLong, formatNumber, formatPercentId } from "@/lib/format";
import { supplierLabel, unitLabel } from "@/lib/lexicon";
import { scopeKey } from "@/lib/scope";
import { getQuotaSummary } from "../api/saApi";
import { currentJakartaMonth } from "../lib/period";
import type { QuotaSummary } from "../types";

/** "2026-10-18" as a local date, so the day never shifts with the browser's zone. */
function localDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function monthLabel(month: string): string {
  return localDate(`${month}-01`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

/**
 * The branch's quota this month, daily first and then monthly, with what each
 * number means. Penyaluran SIM3LON is the source of truth, so every figure is
 * what was actually distributed rather than what plans have reserved.
 */
export function QuotaSummaryPanel({ className }: { className?: string }) {
  const month = currentJakartaMonth();
  const summary = useQuery({
    queryKey: [...scopeKey(), "sa-quota-summary", month],
    queryFn: () => getQuotaSummary(month),
  });
  const over = (summary.data?.remainingQty ?? 0) < 0;

  return (
    <Panel spine={over ? "text-rust" : "text-signal"} className={className}>
      <PanelHeader title="Kuota cabang" hint={`${monthLabel(month)} · sumber Penyaluran SIM3LON`} />
      <PanelBody>
        {summary.isPending && (
          <div className="space-y-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {summary.isError && (
          <div className="flex items-center gap-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-rust-ink" />
            <p className="flex-1 text-sm text-ink">
              Kuota gagal dimuat. <span className="text-ink-muted">{summary.error.message}</span>
            </p>
            <Button size="sm" variant="outline" onClick={() => summary.refetch()}>
              Coba lagi
            </Button>
          </div>
        )}
        {summary.data && <QuotaSummaryBody summary={summary.data} />}
      </PanelBody>
    </Panel>
  );
}

function QuotaSummaryBody({ summary }: { summary: QuotaSummary }) {
  const unit = unitLabel();
  const peak = Math.max(0, ...summary.days.map((day) => day.qty));
  const deliveredPct = summary.allocationQty === 0 ? 0 : (summary.deliveredQty / summary.allocationQty) * 100;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
          Kuota harian{summary.today && ` · ${formatDateLong(localDate(summary.today))}`}
        </h3>
        {summary.todayQty !== null && (
          <div>
            <p className="data text-display font-semibold text-ink">{formatNumber(summary.todayQty)}</p>
            <p className="mt-1 text-sm text-ink-muted">{unit} tersalurkan hari ini</p>
          </div>
        )}
        {/* Scrolls inside the card on a phone rather than squeezing 31 days
            into unreadable slivers or widening the page. */}
        <div className="overflow-x-auto">
          <ol
            className="grid min-w-[720px] gap-px"
            style={{ gridTemplateColumns: `repeat(${summary.days.length}, minmax(0, 1fr))` }}
          >
            {summary.days.map((day) => {
              const date = localDate(day.date);
              const isToday = day.date === summary.today;
              const isFuture = summary.today !== null && day.date > summary.today;
              const label = `${formatDateLong(date)}: ${isFuture ? "belum terjadi" : `${formatNumber(day.qty)} ${unit}`}`;
              return (
                <li key={day.date} className="flex flex-col items-center gap-1" title={label} aria-label={label}>
                  <span className={cn("data text-2xs", isToday ? "font-semibold text-ink" : "text-ink-muted")}>
                    {isFuture ? "·" : day.qty === 0 ? "–" : formatNumber(day.qty)}
                  </span>
                  <span className="flex h-12 w-full items-end justify-center">
                    <span
                      className={cn("w-3/4 rounded-t-sm", isToday ? "bg-signal" : "bg-ink/60")}
                      style={{ height: peak === 0 || isFuture ? 0 : `${(day.qty / peak) * 100}%` }}
                    />
                  </span>
                  <span
                    className={cn(
                      "data text-2xs",
                      isToday ? "font-semibold text-ink" : date.getDay() === 0 ? "text-rust-ink" : "text-ink-muted",
                    )}
                  >
                    {String(date.getDate()).padStart(2, "0")}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          Setiap kolom adalah jumlah {unit} yang disalurkan ke pangkalan pada tanggal itu, menurut Penyaluran SIM3LON.
          Tanggal yang belum lewat masih kosong (·); hari tanpa penyaluran, misalnya Minggu, tercatat 0 (–).
        </p>
      </section>

      <section className="space-y-3 border-t border-line pt-4">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
          Kuota bulanan · {monthLabel(summary.periodMonth)}
        </h3>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <QuotaFigure
            label="Alokasi"
            value={summary.allocationQty}
            meaning={`Kuota yang diterbitkan ${supplierLabel()} untuk bulan ini, dibagi ke ${formatNumber(summary.outletCount)} pangkalan.`}
            detail={summary.kinds.length > 1
              ? summary.kinds.map((kind) => `${kind.name} ${formatNumber(kind.totalQty)}`).join(" · ")
              : undefined}
          />
          <QuotaFigure
            label="Tersalurkan"
            value={summary.deliveredQty}
            suffix={`(${formatPercentId(deliveredPct)})`}
            meaning="Sudah disalurkan ke pangkalan sejak awal bulan sampai hari ini."
          />
          <QuotaFigure
            label="Sisa alokasi"
            value={summary.remainingQty}
            tone={summary.remainingQty < 0 ? "text-rust-ink" : undefined}
            meaning={summary.remainingQty < 0
              ? `Penyaluran melebihi alokasi sebesar ${formatNumber(-summary.remainingQty)} ${unit}.`
              : "Alokasi bulan ini yang belum disalurkan ke pangkalan."}
          />
        </dl>
        <Meter value={summary.deliveredQty} max={summary.allocationQty} tone={summary.remainingQty < 0 ? "rust" : "ink"} label="Alokasi tersalurkan" />
      </section>
    </div>
  );
}

function QuotaFigure({ label, value, suffix, meaning, detail, tone }: {
  label: string;
  value: number;
  suffix?: string;
  meaning: string;
  detail?: string;
  tone?: string;
}) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-medium text-ink">{label}</dt>
      <dd className="space-y-1">
        <p className={cn("data text-lg font-semibold", tone ?? "text-ink")}>
          {formatNumber(value)}{" "}
          <span className="text-xs font-normal text-ink-muted">{unitLabel()} {suffix}</span>
        </p>
        <p className="text-xs leading-relaxed text-ink-muted">{meaning}</p>
        {detail && <p className="data text-2xs text-ink-muted">{detail}</p>}
      </dd>
    </div>
  );
}
