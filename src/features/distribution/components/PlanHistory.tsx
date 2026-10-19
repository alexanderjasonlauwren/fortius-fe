import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, History } from "lucide-react";
import { scopeKey } from "@/lib/scope";
import { formatDateTimeId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getPlanHistory, type PlanHistoryEvent } from "../api/distributionApi";

const EVENT_LABEL: Record<PlanHistoryEvent["event"], string> = {
  plan_updated: "Mengubah rencana",
  plan_confirmed: "Mengonfirmasi rencana",
  plan_cancelled: "Membatalkan rencana",
  crew_assigned: "Mengatur armada dan sopir",
  trip_closed: "Menutup trip",
};

/**
 * Who changed this plan, and when.
 *
 * Read from the audit trail the server keeps for every request, so it is the
 * same answer an auditor would get. Collapsed by default and fetched only when
 * opened: the planning screen is busy enough, and the question "who moved
 * this?" is asked after something went wrong, not on every visit. A refused
 * attempt is listed too -- "someone tried to confirm this and was turned
 * away" is often exactly what the dispatcher is trying to find out.
 */
export function PlanHistory({ planId }: { planId: string }) {
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: [...scopeKey(), "plan-history", planId],
    queryFn: () => getPlanHistory(planId),
    enabled: open,
    // The trail is written after the response, so a change just made may
    // land a moment later; reopening the section asks again.
    staleTime: 0,
  });

  return (
    <section className="rounded-md border border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-ink transition-colors hover:bg-panel-sunk"
      >
        <History className="h-3.5 w-3.5 text-ink-muted" />
        <span className="flex-1">Riwayat perubahan</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-ink-muted transition-transform", !open && "-rotate-90")} />
      </button>
      {open && (
        <div className="border-t border-line px-3 py-2">
          {history.isPending && <p className="text-xs text-ink-muted">Memuat riwayat…</p>}
          {history.isError && (
            <p className="text-xs text-rust-ink">{(history.error as Error).message}</p>
          )}
          {history.data?.length === 0 && (
            <p className="text-xs text-ink-muted">Belum ada perubahan tercatat.</p>
          )}
          {history.data && history.data.length > 0 && (
            <ol className="divide-y divide-line">
              {history.data.map((event, i) => (
                <li key={`${event.at}-${i}`} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-xs">
                  <span className="data text-2xs text-ink-muted">{formatDateTimeId(event.at)}</span>
                  <span className="font-medium text-ink">{event.user || "Sistem"}</span>
                  <span className={cn("text-ink", !event.succeeded && "text-ink-muted line-through")}>
                    {EVENT_LABEL[event.event]}
                  </span>
                  {!event.succeeded && (
                    <span className="text-2xs text-rust-ink">
                      ditolak{event.statusCode === 409 ? " — data sudah diubah orang lain" : ` (${event.statusCode})`}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
