import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, minutesToClock } from "@/lib/format";
import { Skeleton } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import type { DispatchRail as RailData, DispatchStop, StopStage } from "../types";
import { splitLanes, STAGE_WORD, VISIBLE_LANES } from "../lib/railLanes";
import { outletLabelTitle } from "@/lib/lexicon";

/**
 * The dispatch rail — today's working day as one lane per truck.
 *
 * This is the console's opening statement: an agency's day is a timeline of
 * vehicles, so the dashboard leads with the timeline rather than a row of
 * totals. A stop's position is its planned window; the "now" marker makes late
 * work obvious without anyone reading a status column.
 *
 * `data.hasSchedule` is false: no field for a stop's planned time of day
 * exists anywhere in the schema (`jamRencana` reads empty everywhere else for
 * the same reason). The rail still
 * positions stops left-to-right by their real visiting order in that case
 * -- it just stops drawing a clock ruler, a "now" line and a late verdict
 * over a position that isn't a real time, rather than presenting an
 * invented one as real.
 *
 * # A large fleet
 *
 * Trucks are ordered by what needs someone (a failed stop first, finished
 * trucks last), and past six the rest fold into one summary row that counts
 * them by state. Not a scroll box: the rail already scrolls sideways on a
 * phone, and a box scrolling both ways inside a scrolling page traps the
 * swipe and hides how many trucks there are.
 */
export function DispatchRail({
  data,
  isLoading,
  canMonitor = true,
  canOpenDrivers = true,
  canPlan = true,
}: {
  data?: RailData;
  isLoading?: boolean;
  /** Whether the stops link to Monitoring; false for a role that can't open it. */
  canMonitor?: boolean;
  /** Whether a driver's name links to their page; false without drivers read. */
  canOpenDrivers?: boolean;
  /** Whether the empty board offers the planning page; false for a role
   *  that can't open it (finance, the investor). */
  canPlan?: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // The marker ticks on its own so the rail is never stale on screen; until the
  // first tick it uses the minute the snapshot was taken.
  const [tick, setTick] = useState<number | null>(null);
  useEffect(() => {
    const timer = setInterval(
      () => setTick(new Date().getHours() * 60 + new Date().getMinutes()),
      60_000,
    );
    return () => clearInterval(timer);
  }, []);
  const nowMinute = tick ?? data?.nowMinute ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-3 p-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-9 w-44 shrink-0" />
            <Skeleton className="h-7 flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.lanes.length === 0) {
    return (
      <EmptyState
        icon={Truck}
        title="Belum ada armada berangkat hari ini"
        description="Rencana distribusi yang dikonfirmasi akan menerbitkan surat jalan dan mengisi papan ini."
        action={
          canPlan ? (
            <Button asChild size="sm">
              <Link to="/distribution">Buka perencanaan distribusi</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  const { dayStart, dayEnd, hasSchedule } = data;
  const { shown: lanes, hidden, folds, hiddenByStage } = splitLanes(data.lanes, expanded);
  const span = Math.max(60, dayEnd - dayStart);
  const pct = (minute: number) =>
    ((Math.min(dayEnd, Math.max(dayStart, minute)) - dayStart) / span) * 100;

  const hours: number[] = [];
  if (hasSchedule) {
    for (let h = Math.ceil(dayStart / 60) * 60; h <= dayEnd; h += 120) hours.push(h);
  }

  // The "now" marker and the late-detection it feeds both mean nothing
  // against a layout position that isn't a real clock time.
  const nowVisible = hasSchedule && nowMinute >= dayStart && nowMinute <= dayEnd;

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[46rem]">
          {/* Hour ruler */}
          <div className="flex border-b border-line">
            {/* Sticky: the rail scrolls sideways on a phone, and without this the
                driver names scroll away and leave unlabelled colour blocks. It
                needs its own background or the timeline shows through. */}
            <div className="sticky left-0 z-10 w-32 shrink-0 border-r border-line bg-panel px-3 py-2 sm:w-52 sm:px-5">
              <span className="label text-2xs text-ink-muted">Armada</span>
            </div>
            <div className="relative flex-1 py-2 pr-5">
              {!hasSchedule && (
                <span className="text-2xs text-ink-muted">Urutan kunjungan →</span>
              )}
              {hours.map((h) => {
                const at = pct(h);
                return (
                  <span
                    key={h}
                    className={cn(
                      "data absolute top-2 text-2xs text-ink-muted",
                      // Keep the first and last labels inside the track.
                      at <= 1 ? "translate-x-0" : at >= 99 ? "-translate-x-full" : "-translate-x-1/2",
                    )}
                    style={{ left: `${at}%` }}
                  >
                    {minutesToClock(h)}
                  </span>
                );
              })}
              <span className="block h-4" />
            </div>
          </div>

          {/* Lanes */}
          <div className="relative">
            {lanes.map((lane, laneIndex) => (
              <div key={lane.driverId} className="flex border-b border-line last:border-b-0">
                <div className="sticky left-0 z-10 w-32 shrink-0 border-r border-line bg-panel px-3 py-2.5 sm:w-52 sm:px-5">
                  {canOpenDrivers ? (
                    <Link
                      to={`/drivers/${lane.driverId}`}
                      className="block truncate text-sm font-semibold text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
                    >
                      {lane.driver}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-semibold text-ink">{lane.driver}</p>
                  )}
                  <p className="data mt-0.5 truncate text-2xs text-ink-muted">
                    {lane.plat} · {formatNumber(lane.muatan)}/{formatNumber(lane.kapasitas)}
                  </p>
                </div>

                <div className="relative flex-1 py-2.5 pr-5">
                  {/* Two-hour gridlines, kept faint so the blocks carry the read. */}
                  {hours.map((h) => (
                    <span
                      key={h}
                      className="absolute inset-y-0 w-px bg-line"
                      style={{ left: `${pct(h)}%` }}
                      aria-hidden
                    />
                  ))}

                  {/* Stacked across lanes these segments read as one "now" line. */}
                  {nowVisible && (
                    <div
                      className="pointer-events-none absolute inset-y-0 z-20 w-px bg-signal"
                      style={{ left: `${pct(nowMinute)}%` }}
                      aria-hidden
                    >
                      {laneIndex === 0 && (
                        <span className="now-pulse absolute -left-[3px] -top-[3px] h-[7px] w-[7px] rounded-full bg-signal" />
                      )}
                    </div>
                  )}

                  <div className="relative h-7">
                    {lane.stops.map((stop) => (
                      <StopBlock
                        key={stop.id}
                        stop={stop}
                        left={pct(stop.startMinute)}
                        width={Math.max(4, pct(stop.endMinute) - pct(stop.startMinute))}
                        nowMinute={nowMinute}
                        hasSchedule={hasSchedule}
                        isHovered={hovered === stop.id}
                        onHover={setHovered}
                        canMonitor={canMonitor}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {folds && (
        <FoldRow
          hiddenCount={hidden.length}
          total={data.lanes.length}
          byStage={hiddenByStage}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
        />
      )}
    </div>
  );
}

/** The legend's own swatches, so the counts read as part of the same board. */
const STAGE_SWATCH: Record<StopStage, string> = {
  Selesai: "bg-pine",
  Proses: "bg-signal",
  Antrian: "bg-panel-raised ring-1 ring-inset ring-line-strong",
  Tertunda: "bg-rust",
};

/**
 * The trucks past the first six, counted by state, and the switch that draws
 * them. What is drawn plus what is counted is always the whole fleet.
 */
function FoldRow({
  hiddenCount,
  total,
  byStage,
  expanded,
  onToggle,
}: {
  hiddenCount: number;
  total: number;
  byStage: { stage: StopStage; count: number }[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const toggle = () => {
    onToggle();
    // Folding a long board from its bottom shrinks the page under the reader
    // and leaves them in the tiles below. Bring the row back to the bottom of
    // the view, so the six trucks it now folds under are above it.
    if (expanded) requestAnimationFrame(() => row.current?.scrollIntoView?.({ block: "end" }));
  };
  return (
    <div
      ref={row}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-line px-3 py-2.5 sm:px-5"
    >
      {expanded ? (
        <p className="text-xs text-ink-muted">Semua {formatNumber(total)} armada ditampilkan.</p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          <span className="font-semibold text-ink">+{formatNumber(hiddenCount)} armada lain</span>
          {byStage.map(({ stage, count }) => (
            <span key={stage} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-[2px]", STAGE_SWATCH[stage])} aria-hidden />
              {formatNumber(count)} {STAGE_WORD[stage]}
            </span>
          ))}
        </p>
      )}
      {/* -ml-3: aligned with the counts above when it wraps under them on a phone. */}
      <Button variant="ghost" size="sm" onClick={toggle} aria-expanded={expanded} className="-ml-3 sm:ml-0">
        {expanded ? `Tampilkan ${VISIBLE_LANES} saja` : `Tampilkan semua (${formatNumber(total)})`}
      </Button>
    </div>
  );
}

/**
 * Blocks are narrow, and every outlet here is a "Outlet"/"Toko"/"UD" — the
 * prefix costs the characters that would tell them apart.
 */
function shortName(nama: string): string {
  // The tenant's own word for the thing, plus the generic shop prefixes a
  // name might carry. Hardcoding "Pangkalan" here would strip nothing once
  // the console is pointed at another trade.
  const prefix = new RegExp(`^(${outletLabelTitle()}|Toko|UD|Mitra)\\s+`, "i");
  return nama.replace(prefix, "");
}

function StopBlock({
  stop,
  left,
  width,
  nowMinute,
  hasSchedule,
  isHovered,
  onHover,
  canMonitor,
}: {
  stop: DispatchStop;
  left: number;
  width: number;
  nowMinute: number;
  hasSchedule: boolean;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  canMonitor: boolean;
}) {
  // A queued stop whose window has already passed is running late — the one
  // thing on this screen worth interrupting someone for. Meaningless without
  // a real window to have passed.
  const late = hasSchedule && stop.stage === "Antrian" && nowMinute > stop.endMinute;

  const tone = late
    ? "bg-rust-soft text-rust-ink ring-1 ring-inset ring-rust"
    : {
        Selesai: "bg-pine text-white",
        Proses: "bg-signal text-[rgb(23_26_22)]",
        Antrian: "bg-panel-raised text-ink-muted ring-1 ring-inset ring-line-strong",
        Tertunda: "bg-rust text-white",
      }[stop.stage];

  const label = `${stop.kode} ke ${stop.outlet}, ${stop.stage}`;
  const blockClass = cn(
    "flex h-full items-center overflow-hidden rounded-sm px-2 text-2xs font-semibold transition-transform duration-150 hover:z-10 hover:scale-[1.02]",
    tone,
  );

  return (
    <div
      className="absolute inset-y-0"
      style={{ left: `${left}%`, width: `${width}%` }}
      onMouseEnter={() => onHover(stop.id)}
      onMouseLeave={() => onHover(null)}
    >
      {canMonitor ? (
        <Link
          to="/monitoring"
          aria-label={label}
          // The block itself shows only a truncated name, so on a touch device
          // the stop code, its window and its load were unreachable — hover is
          // the only thing that revealed them. Focus and a first tap now do too.
          onFocus={() => onHover(stop.id)}
          onBlur={() => onHover(null)}
          onClick={(e) => {
            if (window.matchMedia("(hover: none)").matches && !isHovered) {
              e.preventDefault();
              onHover(stop.id);
            }
          }}
          className={blockClass}
        >
          <span className="truncate">{shortName(stop.outlet)}</span>
        </Link>
      ) : (
        // A role that can't open Monitoring (finance) still reads the stop
        // here; a link would only lead to "di luar akses Anda" (R3-14).
        <button
          type="button"
          aria-label={label}
          onFocus={() => onHover(stop.id)}
          onBlur={() => onHover(null)}
          onClick={() => onHover(isHovered ? null : stop.id)}
          className={cn(blockClass, "w-full text-left")}
        >
          <span className="truncate">{shortName(stop.outlet)}</span>
        </button>
      )}

      {isHovered && (
        // max-w keeps it inside the scroller on a narrow track; left-0 alone
        // let a 224px card spill past the right edge and get clipped.
        <div className="absolute bottom-[calc(100%+6px)] left-0 z-30 w-56 max-w-[min(14rem,calc(100vw-2rem))] rounded-md border border-line bg-panel p-3 shadow-pop">
          <p className="data text-2xs text-ink-muted">{stop.kode}</p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-ink">
            {stop.outlet}
          </p>
          <p className="text-xs text-ink-muted">Kec. {stop.kecamatan}</p>
          <dl className="mt-2 space-y-1 border-t border-line pt-2 text-xs">
            {hasSchedule && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink-muted">Jadwal</dt>
                <dd className="data text-ink">
                  {minutesToClock(stop.startMinute)}–{minutesToClock(stop.endMinute)}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Muatan</dt>
              <dd className="data text-ink">
                {formatNumber(stop.realisasi)} / {formatNumber(stop.target)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Status</dt>
              <dd className={cn("font-semibold", late ? "text-rust-ink" : "text-ink")}>
                {late ? "Terlambat berangkat" : stop.stage}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
