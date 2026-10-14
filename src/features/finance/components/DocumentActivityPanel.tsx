/**
 * "Riwayat": what was applied against a document and the journals it
 * posted -- the audit trail beside every finance detail page.
 */
import { Link } from "react-router-dom";
import { History } from "lucide-react";
import type { DocumentActivity } from "@/features/finance/api/activityApi";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { formatDateId, formatRupiah } from "@/lib/format";

const KIND_LABEL = {
  receipt: "Penerimaan",
  credit_note: "Nota kredit",
  invoice: "Tagihan",
  purchase_payment: "Pembayaran",
} as const;

const KIND_HREF: Partial<Record<keyof typeof KIND_LABEL, (id: string) => string>> = {
  invoice: (id) => `/receivables/${id}`,
  receipt: () => "/payments",
};

export function DocumentActivityPanel({ activity, isLoading }: { activity?: DocumentActivity; isLoading?: boolean }) {
  return (
    <Panel>
      <PanelHeader title="Riwayat" hint="Yang diterapkan ke dokumen ini, dan jurnalnya" />
      <PanelBody className="space-y-4">
        {isLoading || !activity ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            {activity.penyelesaian.length > 0 && (
              <ul className="space-y-2">
                {activity.penyelesaian.map((s) => {
                  const href = KIND_HREF[s.jenis]?.(s.id);
                  return (
                    <li key={`${s.jenis}-${s.id}`} className="flex items-baseline justify-between gap-3 text-sm">
                      <span>
                        <span className="text-ink-muted">{KIND_LABEL[s.jenis]} </span>
                        {href ? (
                          <Link to={href} className="data text-ink underline-offset-2 hover:underline">{s.nomor}</Link>
                        ) : (
                          <span className="data text-ink">{s.nomor}</span>
                        )}
                        <span className="block text-2xs text-ink-muted">{formatDateId(s.tanggal)} · {s.status}</span>
                      </span>
                      <span className="data shrink-0 whitespace-nowrap text-ink">{formatRupiah(s.jumlah)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {activity.jurnal.length === 0 ? (
              <p className="flex items-center gap-2 text-xs text-ink-muted">
                <History className="h-3.5 w-3.5" /> Belum ada jurnal untuk dokumen ini.
              </p>
            ) : (
              <ul className="space-y-2 border-t border-line pt-3">
                {activity.jurnal.map((j) => (
                  <li key={j.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      <span className={j.dibalik ? "data text-ink-muted line-through" : "data text-ink"}>{j.nomor}</span>
                      {j.pembalik && <span className="ml-1.5 text-2xs text-rust-ink">pembalik</span>}
                      <span className="block text-2xs text-ink-muted">{formatDateId(j.tanggal)} · {j.keterangan}</span>
                    </span>
                    <span className="data shrink-0 whitespace-nowrap text-ink">{formatRupiah(j.jumlah)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </PanelBody>
    </Panel>
  );
}
