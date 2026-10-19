import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/common/Field";
import { Panel, PanelBody, PanelHeader } from "@/components/common/Panel";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { scopeKey } from "@/lib/scope";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { applySIM3LON, getLivePenyaluranCandidates, getSIM3LONReconciliation, syncLivePenyaluran } from "../api/saApi";
import { buildSIM3LONApplyReview } from "../hooks/useSIM3LONImport";
import { currentJakartaMonth } from "../lib/period";
import type { SIM3LONLiveCandidate } from "../types";

export function LivePenyaluranPanel() {
  const [period, setPeriod] = useState(currentJakartaMonth);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const candidates = useQuery({
    queryKey: [...scopeKey(), "sim3lon-live-sa-candidates", period],
    queryFn: () => getLivePenyaluranCandidates(period),
  });
  const review = useQuery({
    queryKey: [...scopeKey(), "sim3lon-live-sa-review", selectedId],
    queryFn: () => getSIM3LONReconciliation(selectedId!),
    enabled: selectedId !== null,
  });
  const sync = useDeskMutation({
    mutationFn: syncLivePenyaluran,
    errorTitle: "Penyaluran langsung gagal ditarik",
    onDone: (candidate) => setSelectedId(candidate.status === "parsed" ? candidate.id : null),
  });
  const apply = useDeskMutation({
    mutationFn: ({ id }: { id: string }) => applySIM3LON(id, buildSIM3LONApplyReview(review.data!)),
    success: "Penyaluran diterapkan ke SA",
    errorTitle: "Kandidat Penyaluran belum dapat diterapkan",
    onDone: () => setSelectedId(null),
  });
  const selected = candidates.data?.find((candidate) => candidate.id === selectedId);
  // Newest first regardless of the server's order: the latest fetch is the one
  // that says what the SA holds now, and older ones are history.
  const [latest, ...older] = [...(candidates.data ?? [])].sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  const pending = sync.isPending || apply.isPending;

  return (
    <Panel>
      <PanelHeader title="Penyaluran langsung ke SA" hint="XLSX tetap tersedia sebagai fallback penuh" />
      <PanelBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs font-medium text-ink" htmlFor="sim3lon-live-period">
            <span>Periode</span>
            <TextInput id="sim3lon-live-period" type="month" value={period} className="w-44"
              onChange={(event) => { setPeriod(event.target.value); setSelectedId(null); setHistoryOpen(false); }} />
          </label>
          <Button size="sm" onClick={() => sync.mutate(period)} disabled={!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || pending}>
            {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {sync.isPending ? "Menarik Penyaluran…" : "Sinkronkan sekarang"}
          </Button>
        </div>
        <p className="text-xs text-ink-muted">
          Penyaluran SIM3LON adalah sumber kebenaran SA. Setiap sinkronisasi menyimpan bukti sumber, lalu memperbarui alokasi pangkalan, kuota Base dan Fakultatif, serta target harian sebulan penuh. Bila penerapan otomatis dimatikan di server, tinjau dan terapkan kandidat di bawah.
        </p>
        {candidates.isPending && <p className="text-xs text-ink-muted">Memuat kandidat…</p>}
        {candidates.isError && <p className="text-xs text-rust-ink">{(candidates.error as Error).message}</p>}
        {candidates.data?.length === 0 && <p className="text-xs text-ink-muted">Belum ada kandidat untuk periode ini.</p>}
        {latest && (
          <div className="rounded-sm border border-line">
            <CandidateRow candidate={latest} onReview={setSelectedId}>
              {older.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHistoryOpen((open) => !open)}
                  aria-expanded={historyOpen}
                  aria-controls="sim3lon-live-history"
                  className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-2xs text-ink-muted transition-colors hover:bg-panel-raised hover:text-ink"
                >
                  {formatNumber(older.length)} sebelumnya
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform duration-200", historyOpen ? "rotate-0" : "-rotate-90")}
                  />
                </button>
              )}
            </CandidateRow>
            {historyOpen && older.length > 0 && (
              <div id="sim3lon-live-history" className="max-h-64 divide-y divide-line overflow-y-auto border-t border-line bg-panel-sunk">
                {older.map((candidate) => (
                  <CandidateRow key={candidate.id} candidate={candidate} onReview={setSelectedId} />
                ))}
              </div>
            )}
          </div>
        )}
        {selectedId && (
          <div className="space-y-3 rounded-sm border border-line bg-panel-sunk p-3">
            <p className="text-xs font-semibold text-ink">Tinjauan kandidat {selectedId.slice(0, 8)}</p>
            {review.isPending && <p className="text-xs text-ink-muted">Memeriksa dampak terhadap rencana…</p>}
            {review.isError && <p className="text-xs text-rust-ink">{(review.error as Error).message}</p>}
            {review.data && (
              <>
                <p className="text-xs text-ink-muted">{formatNumber(review.data.changes.filter((change) => change.classification !== "unchanged").length)} perubahan harian · {formatNumber(review.data.blockers.length)} penghambat</p>
                {review.data.blockers.length > 0 && (
                  <ul className="space-y-1 text-xs text-rust-ink">
                    {review.data.blockers.map((blocker, index) => (
                      <li key={`${blocker.code}-${index}`} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{blocker.message}</li>
                    ))}
                  </ul>
                )}
                {review.data.reviewReady && selected?.status === "parsed" && (
                  <Button size="sm" onClick={() => apply.mutate({ id: selectedId })} disabled={pending}>
                    {apply.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Terapkan ke SA
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

function CandidateRow({ candidate, onReview, children }: {
  candidate: SIM3LONLiveCandidate;
  onReview: (id: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div>
        <p className="text-xs font-semibold text-ink">{new Date(candidate.fetchedAt).toLocaleString("id-ID")} · {formatNumber(candidate.outletCount)} pangkalan</p>
        <p className="text-2xs text-ink-muted">{candidate.appliedToSA ? "Diterapkan ke SA" : candidate.status === "applied" ? "Diganti oleh sumber lebih baru" : "Tersimpan, belum diterapkan"} · sha256 {candidate.checksum.slice(0, 12)}…</p>
        {candidate.reviewReason && <p className="text-2xs text-signal-ink">{candidate.reviewReason}</p>}
      </div>
      <div className="flex items-center gap-2">
        {candidate.status === "parsed" && (
          <Button size="sm" variant="outline" onClick={() => onReview(candidate.id)}>
            Tinjau
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}
