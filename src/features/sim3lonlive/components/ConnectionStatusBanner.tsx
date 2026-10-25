import { RefreshCw } from "lucide-react";
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
  if (!iso) return "tidak tercatat";
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
 * Names the wilayah and period the data came from and when it was last pulled.
 * The page shows a stored pull, not a live link, so there is no "connected"
 * light: the sync time is the honest freshness signal.
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
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">
          Sinkron terakhir {formatSyncedAt(syncedAt)}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {wilayah} · periode {period}
        </p>
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
