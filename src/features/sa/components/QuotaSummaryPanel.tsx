import { useQuery } from "@tanstack/react-query";
import { AlertCircle, FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Meter, Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { cn } from "@/lib/utils";
import { formatDateId, formatDateLong, formatNumber, formatPercentId } from "@/lib/format";
import { supplierLabel, unitLabel } from "@/lib/lexicon";
import { scopeKey } from "@/lib/scope";
import { getQuotaSummary } from "../api/saApi";
import { useCurrentBaseReference } from "../hooks/useBaseReference";
import { currentJakartaMonth, monthLabel } from "../lib/period";
import type { BaseReference, QuotaSummary } from "../types";

/** "2026-10-18" as a local date, so the day never shifts with the browser's zone. */
function localDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * The branch's quota this month, daily first and then monthly, with what each
 * number means. Penyaluran SIM3LON is the source of truth, so every figure is
 * what was actually distributed rather than what plans have reserved.
 *
 * When the month's Acuan Base SA is uploaded, the SPBE's target leads: the
 * remaining figure is that target less what was distributed, and the SIM3LON
 * allocation -- every pangkalan's entitlement, usually larger -- stays as the
 * line beneath it (user's decision, 18 Nov 2026).
 *
 * `onUploadReference` is absent for a role that may not upload.
 */
export function QuotaSummaryPanel({ className, onUploadReference }: {
  className?: string;
  onUploadReference?: () => void;
}) {
  const month = currentJakartaMonth();
  const summary = useQuery({
    queryKey: [...scopeKey(), "sa-quota-summary", month],
    queryFn: () => getQuotaSummary(month),
  });
  const reference = useCurrentBaseReference(month);
  const remaining = summary.data?.referenceRemainingQty ?? summary.data?.remainingQty ?? 0;

  return (
    <Panel spine={remaining < 0 ? "text-rust" : "text-signal"} className={className}>
      <PanelHeader
        title="Kuota cabang"
        hint={`${monthLabel(month)} · sumber Penyaluran SIM3LON${summary.data?.referenceQty != null ? " · target Acuan SA" : ""}`}
      />
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
        {summary.data && (
          <QuotaSummaryBody
            summary={summary.data}
            reference={reference.data ?? null}
            onUploadReference={onUploadReference}
          />
        )}
      </PanelBody>
    </Panel>
  );
}

function QuotaSummaryBody({ summary, reference, onUploadReference }: {
  summary: QuotaSummary;
  reference: BaseReference | null;
  onUploadReference?: () => void;
}) {
  const unit = unitLabel();
  const hasReference = summary.referenceQty !== null;
  const peak = Math.max(0, ...summary.days.map((day) => Math.max(day.qty, day.referenceQty ?? 0)));
  // SIM3LON already holds a schedule for coming dates. Shown apart
  // from what was distributed, never added to it: until the date passes it is
  // a plan, and counting it would shrink Sisa for cylinders still in the depot.
  const scheduled = summary.days.filter((day) => isAfterToday(summary, day.date) && day.qty > 0);
  const scheduledQty = scheduled.reduce((sum, day) => sum + day.qty, 0);
  // Today and the dates SIM3LON has already scheduled below the PDF's target:
  // the shortfall a planner can still act on. Past days are in the monthly
  // figures, and a future date with no schedule yet has nothing to compare.
  const upcomingShort = summary.days.filter((day) =>
    day.referenceQty !== null && day.qty < day.referenceQty &&
    (day.date === summary.today || (isAfterToday(summary, day.date) && day.qty > 0)));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
          Kuota harian{summary.today && ` · ${formatDateLong(localDate(summary.today))}`}
        </h3>
        {summary.todayQty !== null && (
          <div>
            <p className="data text-display font-semibold text-ink">{formatNumber(summary.todayQty)}</p>
            <p className="mt-1 text-sm text-ink-muted">
              {unit} tersalurkan hari ini
              {summary.todayReferenceQty !== null && (
                <>
                  {" · target Acuan SA "}
                  <span className="data text-ink">{formatNumber(summary.todayReferenceQty)}</span>
                </>
              )}
            </p>
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
              const isFuture = isAfterToday(summary, day.date);
              const isScheduled = isFuture && day.qty > 0;
              // Below target: what was distributed (or is scheduled) under the
              // PDF's figure for the date. An unscheduled future date is open,
              // not short.
              const isShort = day.referenceQty !== null && day.qty < day.referenceQty && (!isFuture || isScheduled);
              const target = day.referenceQty !== null && day.referenceQty > 0
                ? `, target Acuan SA ${formatNumber(day.referenceQty)}`
                : "";
              const label = `${formatDateLong(date)}: ${
                isScheduled
                  ? `${formatNumber(day.qty)} ${unit} terjadwal`
                  : isFuture
                    ? "belum ada jadwal"
                    : `${formatNumber(day.qty)} ${unit}`
              }${target}`;
              return (
                <li key={day.date} className="flex flex-col items-center gap-1" title={label} aria-label={label}>
                  <span
                    className={cn(
                      "data text-2xs",
                      isShort ? "text-rust-ink" : isToday ? "text-ink" : "text-ink-muted",
                      isToday && "font-semibold",
                    )}
                  >
                    {isScheduled ? formatNumber(day.qty) : isFuture ? "·" : day.qty === 0 ? "–" : formatNumber(day.qty)}
                  </span>
                  <span className="relative flex h-12 w-full items-end justify-center">
                    <span
                      data-kind={isScheduled ? "scheduled" : isFuture ? "open" : "distributed"}
                      className={cn(
                        "w-3/4 rounded-t-sm",
                        isScheduled
                          ? "border border-b-0 border-dashed border-ink-muted"
                          : isToday
                            ? "bg-signal"
                            : "bg-ink/60",
                      )}
                      style={{ height: peak === 0 || (isFuture && !isScheduled) ? 0 : `${(day.qty / peak) * 100}%` }}
                    />
                    {day.referenceQty !== null && day.referenceQty > 0 && peak > 0 && (
                      <span
                        data-kind="target"
                        aria-hidden
                        className={cn("absolute inset-x-0 h-0.5", isShort ? "bg-rust" : "bg-ink")}
                        style={{ bottom: `calc(${(day.referenceQty / peak) * 100}% - 1px)` }}
                      />
                    )}
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
          Tanggal mendatang yang sudah terjadwal di SIM3LON tampil bergaris putus-putus dan belum dihitung tersalurkan;
          tanggal mendatang tanpa jadwal kosong (·); hari tanpa penyaluran, misalnya Minggu, tercatat 0 (–).
          {hasReference && " Garis melintang adalah target Acuan SA tanggal itu; angka merah berarti di bawah target."}
        </p>
        {scheduledQty > 0 && (
          <p className="text-xs text-ink">
            Terjadwal{" "}
            <span className="data font-semibold">{formatNumber(scheduledQty)}</span> {unit} untuk{" "}
            {formatNumber(scheduled.length)} tanggal mendatang.
          </p>
        )}
        {upcomingShort.length > 0 && (
          <p className="text-xs text-rust-ink">
            Di bawah target Acuan SA:{" "}
            {upcomingShort.slice(0, 5).map((day, index) => (
              <span key={day.date}>
                {index > 0 && ", "}
                {formatDateId(localDate(day.date))}{" "}
                <span className="data">({formatNumber(day.qty)} dari {formatNumber(day.referenceQty ?? 0)})</span>
              </span>
            ))}
            {upcomingShort.length > 5 && ` dan ${formatNumber(upcomingShort.length - 5)} tanggal lain`}.
          </p>
        )}
      </section>

      <section className="space-y-3 border-t border-line pt-4">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">
          Kuota bulanan · {monthLabel(summary.periodMonth)}
        </h3>
        {hasReference ? (
          <ReferenceMonth summary={summary} reference={reference} onUploadReference={onUploadReference} />
        ) : (
          <AllocationMonth summary={summary} onUploadReference={onUploadReference} />
        )}
      </section>
    </div>
  );
}

/** The month measured against the SPBE's Acuan Base SA, allocation beneath. */
function ReferenceMonth({ summary, reference, onUploadReference }: {
  summary: QuotaSummary;
  reference: BaseReference | null;
  onUploadReference?: () => void;
}) {
  const unit = unitLabel();
  const target = summary.referenceQty ?? 0;
  const remaining = summary.referenceRemainingQty ?? 0;
  const deliveredPct = target === 0 ? 0 : (summary.deliveredQty / target) * 100;

  return (
    <>
      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <QuotaFigure
          label="Target Acuan SA"
          value={target}
          meaning="Total target harian di PDF Acuan SA dari SPBE untuk bulan ini."
        />
        <QuotaFigure
          label="Tersalurkan"
          value={summary.deliveredQty}
          suffix={`(${formatPercentId(deliveredPct)})`}
          meaning="Sudah disalurkan ke pangkalan sejak awal bulan sampai hari ini, menurut Penyaluran SIM3LON."
        />
        <QuotaFigure
          label="Sisa target"
          value={remaining}
          tone={remaining < 0 ? "text-rust-ink" : undefined}
          meaning={remaining < 0
            ? `Penyaluran melebihi target Acuan SA sebesar ${formatNumber(-remaining)} ${unit}.`
            : "Target Acuan SA bulan ini yang belum disalurkan ke pangkalan."}
        />
      </dl>
      <Meter value={summary.deliveredQty} max={target} tone={remaining < 0 ? "rust" : "ink"} label="Target Acuan SA tersalurkan" />
      <p className="text-xs leading-relaxed text-ink-muted">
        Alokasi SIM3LON <span className="data text-ink">{formatNumber(summary.allocationQty)}</span> {unit} untuk{" "}
        {formatNumber(summary.outletCount)} pangkalan · sisa alokasi{" "}
        <span className={cn("data", summary.remainingQty < 0 ? "text-rust-ink" : "text-ink")}>
          {formatNumber(summary.remainingQty)}
        </span>
        {summary.kinds.length > 1 && (
          <span className="data">
            {" "}({summary.kinds.map((kind) => `${kind.name} ${formatNumber(kind.totalQty)}`).join(" · ")})
          </span>
        )}
      </p>
      {reference && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm bg-panel-sunk px-3.5 py-2.5">
          <FileText className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          <p className="min-w-0 flex-1 text-2xs text-ink-muted">
            <span className="text-ink">{reference.fileName}</span>
            {reference.appliedBy && ` · diunggah ${reference.appliedBy}`}
            {reference.appliedAt && `, ${formatDateId(reference.appliedAt)}`}
          </p>
          {onUploadReference && (
            <Button size="sm" variant="outline" onClick={onUploadReference}>
              Ganti PDF
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/** The month against the SIM3LON allocation alone: no Acuan SA uploaded. */
function AllocationMonth({ summary, onUploadReference }: {
  summary: QuotaSummary;
  onUploadReference?: () => void;
}) {
  const unit = unitLabel();
  const deliveredPct = summary.allocationQty === 0 ? 0 : (summary.deliveredQty / summary.allocationQty) * 100;
  return (
    <>
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm bg-panel-sunk px-3.5 py-2.5">
        <p className="min-w-0 flex-1 text-2xs leading-relaxed text-ink-muted">
          Acuan SA {monthLabel(summary.periodMonth)} belum diunggah, jadi sisa di atas dihitung dari alokasi SIM3LON.
          Setelah PDF dari SPBE diunggah, kartu ini mengukur penyaluran terhadap targetnya.
        </p>
        {onUploadReference && (
          <Button size="sm" variant="outline" onClick={onUploadReference}>
            <Upload className="h-3.5 w-3.5" />
            Unggah Acuan SA
          </Button>
        )}
      </div>
    </>
  );
}

/** Strictly after today: today's figure is already counted as distributed. */
function isAfterToday(summary: QuotaSummary, date: string): boolean {
  return summary.today !== null && date > summary.today;
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
