import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import { Meter, Skeleton } from "@/components/common/Panel";
import { cn, getInitials } from "@/lib/utils";
import { fleetColor } from "@/lib/chart";
import { useTheme } from "@/hooks/useTheme";
import { formatNumber } from "@/lib/format";
import { unitLabel } from "@/lib/lexicon";
import type { DriverCard } from "../types";

interface DriverCardRowProps {
  cards: DriverCard[];
  isLoading: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Previewing a round on the map costs nothing and commits nothing. */
  onHover?: (id: string | null) => void;
}

export function DriverCardRow({
  cards,
  isLoading,
  selectedId,
  onSelect,
  onHover,
}: DriverCardRowProps) {
  const { isDark } = useTheme();
  const unit = unitLabel();

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="w-60 shrink-0 space-y-3 rounded-md border border-line bg-panel p-4"
          >
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-line-strong bg-panel-sunk px-5 py-6 text-center text-sm text-ink-muted">
        Tidak ada armada yang bertugas pada rentang tanggal ini.
      </p>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {cards.map((card) => {
        const active = selectedId === card.id;
        // Same swatch and initials as the truck's marker on the map, so a card
        // and its route are matched by more than colour alone.
        const color = fleetColor(card.slot, isDark);
        return (
          <div
            key={card.id}
            // Hover previews the round on the map; the map frames it and dims
            // the rest, then releases when the pointer leaves. Selection is
            // still a deliberate click.
            onMouseEnter={() => onHover?.(card.id)}
            onMouseLeave={() => onHover?.(null)}
            className={cn(
              "spine w-60 shrink-0 rounded-md border bg-panel p-4 transition-colors",
              spineFor(card.status),
              active ? "border-ink" : "border-line hover:border-line-strong",
            )}
          >
            <button
              type="button"
              // Clicking a truck filters the map and the table to it; clicking
              // the selected one clears the filter.
              onClick={() => onSelect?.(active ? null : card.id)}
              aria-pressed={active}
              className="w-full text-left"
            >
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-2xs font-semibold text-white"
                  style={{ background: color }}
                >
                  <span className="data">{getInitials(card.name)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold leading-tight text-ink">
                    {card.name}
                  </span>
                  <span className="data block truncate text-2xs text-ink-muted">
                    {card.plat}
                  </span>
                </span>
              </div>

              <StatusBadge
                variant={getStatusVariant(card.status)}
                label={card.status}
              />

              <p className="mt-3 text-xs text-ink-muted">
                {card.tujuanOutlet ? (
                  <>
                    Menuju <span className="text-ink">{card.tujuanOutlet}</span>
                    {card.eta && (
                      <>
                        {" · ETA "}
                        <span className="data">{card.eta}</span>
                      </>
                    )}
                  </>
                ) : card.status === "Selesai" ? (
                  "Semua pemberhentian selesai"
                ) : (
                  card.lokasi ?? "Menunggu penugasan"
                )}
              </p>

              <span className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 text-2xs text-ink-muted">
                <span>Muatan rit</span>
                <span className="text-right text-ink">
                  <span className="data">{formatNumber(card.muatan)}</span> {unit}
                </span>
                <span>Kapasitas truk</span>
                {card.kapasitas > 0 ? (
                  <span className="text-right text-ink">
                    <span className="data">{formatNumber(card.kapasitas)}</span> {unit}
                  </span>
                ) : (
                  <span className="text-right">Belum tercatat</span>
                )}
              </span>

              <div className="mt-3">
                <div className="mb-1.5 text-2xs text-ink-muted">
                  <span className="data text-ink">{card.selesai}</span>/
                  <span className="data">{card.total}</span> singgah selesai
                </div>
                <Meter
                  value={card.selesai}
                  max={card.total || 1}
                  tone={card.selesai === card.total ? "pine" : "signal"}
                  label={`${card.name}: ${card.selesai} dari ${card.total} pemberhentian`}
                />
              </div>
            </button>

            <Link
              to={`/drivers/${card.id}`}
              className="mt-3 inline-flex items-center gap-1 text-2xs font-semibold text-ink-muted transition-colors hover:text-ink"
            >
              Detail armada
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        );
      })}
    </div>
  );
}
