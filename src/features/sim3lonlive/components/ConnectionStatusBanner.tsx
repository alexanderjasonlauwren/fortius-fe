import { RefreshCw, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  wilayah: string;
  period: string;
  syncedAt: string;
  syncing: boolean;
  onSync: () => void;
}

function formatSyncedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The proof, made visible: a live-connection banner naming the wilayah and period
 * the data came from and when it was last pulled from SIM3LON.
 */
export function ConnectionStatusBanner({
  wilayah,
  period,
  syncedAt,
  syncing,
  onSync,
}: Props) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-md border border-line bg-panel px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Wifi className="size-4 text-emerald-500" />
            Terhubung ke SIM3LON
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            {wilayah} · periode {period} · terakhir sinkron {formatSyncedAt(syncedAt)}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onSync}
        disabled={syncing}
        className="sm:shrink-0"
      >
        <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
        {syncing ? "Menyinkronkan…" : "Sinkronkan sekarang"}
      </Button>
    </div>
  );
}
