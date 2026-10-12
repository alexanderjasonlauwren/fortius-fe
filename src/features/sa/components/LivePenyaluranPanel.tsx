import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader } from "@/components/common/Panel";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { scopeKey } from "@/mocks/scope";
import { formatNumber } from "@/lib/format";
import { applySIM3LON, getLivePenyaluranCandidates, getSIM3LONReconciliation, syncLivePenyaluran } from "../api/saApi";
import { buildSIM3LONApplyReview } from "../hooks/useSIM3LONImport";

function currentJakartaMonth(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}`;
}

export function LivePenyaluranPanel() {
  const [period, setPeriod] = useState(currentJakartaMonth);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    success: "Kandidat Penyaluran diterapkan ke SA Base",
    errorTitle: "Kandidat Penyaluran belum dapat diterapkan",
    onDone: () => setSelectedId(null),
  });
  const selected = candidates.data?.find((candidate) => candidate.id === selectedId);
  const pending = sync.isPending || apply.isPending;

  return (
    <Panel>
      <PanelHeader title="Penyaluran langsung ke SA" hint="XLSX tetap tersedia sebagai fallback penuh" />
      <PanelBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs font-medium text-ink" htmlFor="sim3lon-live-period">
            <span>Periode</span>
            <input id="sim3lon-live-period" type="month" value={period}
              onChange={(event) => { setPeriod(event.target.value); setSelectedId(null); }}
              className="block rounded-sm border border-line bg-panel px-3 py-2 text-sm text-ink" />
          </label>
          <Button size="sm" onClick={() => sync.mutate(period)} disabled={!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || pending}>
            {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {sync.isPending ? "Menarik Penyaluran…" : "Sinkronkan sekarang"}
          </Button>
        </div>
        <p className="text-xs text-ink-muted">
          Sinkronisasi menyimpan bukti sumber lebih dulu. Perubahan aman dapat diterapkan otomatis setelah kalibrasi server; perubahan historis, Fakultatif, dan rencana berjalan perlu ditinjau.
        </p>
        {candidates.isPending && <p className="text-xs text-ink-muted">Memuat kandidat…</p>}
        {candidates.isError && <p className="text-xs text-rust-ink">{(candidates.error as Error).message}</p>}
        {candidates.data?.length === 0 && <p className="text-xs text-ink-muted">Belum ada kandidat untuk periode ini.</p>}
        {candidates.data && candidates.data.length > 0 && (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {candidates.data.map((candidate) => (
              <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-line px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-ink">{new Date(candidate.fetchedAt).toLocaleString("id-ID")} · {formatNumber(candidate.outletCount)} pangkalan</p>
                  <p className="text-2xs text-ink-muted">{candidate.appliedToSA ? "Diterapkan ke SA" : candidate.status === "applied" ? "Diganti oleh sumber lebih baru" : "Tersimpan, belum diterapkan"} · sha256 {candidate.checksum.slice(0, 12)}…</p>
                  {candidate.reviewReason && <p className="text-2xs text-signal-ink">{candidate.reviewReason}</p>}
                </div>
                {candidate.status === "parsed" && (
                  <Button size="sm" variant="outline" onClick={() => setSelectedId(candidate.id)}>
                    Tinjau
                  </Button>
                )}
              </div>
            ))}
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
                    Terima dan terapkan ke SA Base
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
