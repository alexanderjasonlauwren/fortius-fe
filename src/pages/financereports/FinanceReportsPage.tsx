/**
 * Laporan: the report catalogue, grouped the way Jurnal groups it, with the
 * most-opened reports first. The statements themselves (Laba Rugi, Neraca,
 * Penjelasan Akun, Komparasi, Buku Besar) stay on Laporan Keuangan and are
 * linked from Ikhtisar Bisnis rather than rebuilt here. Accounting parity
 * P5, regrouped in P6.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  getReportCatalogue,
} from "@/features/financereports/api/financereportsApi";
import { favourites, hubEntries, type HubEntry } from "@/features/financereports/lib/catalogue";
import { useAuthStore } from "@/features/auth/store/authStore";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { scopeKey } from "@/lib/scope";

export function FinanceReportsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const catalogue = useQuery({ queryKey: [...scopeKey(), "finance-reports", "catalogue"], queryFn: getReportCatalogue });

  const entries = hubEntries(catalogue.data ?? [], hasPermission);
  const pinned = favourites(entries);
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    entries: entries.filter((e) => e.category === category),
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Laporan"
        description="Laporan dari buku besar dan dokumen transaksi. Setiap angka bisa ditelusuri ke dokumen sumbernya, dan laporan yang punya padanan di buku besar dicocokkan dengannya."
      />
      {catalogue.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          {pinned.length > 0 && (
            <div>
              <p className="label mb-2 text-2xs text-ink-muted">Laporan utama</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {pinned.map((e) => (
                  <Link key={e.key} to={e.href} className="rounded-md border border-line bg-panel p-3 transition-colors hover:border-line-strong hover:bg-panel-sunk">
                    <p className="text-sm font-semibold text-ink">{e.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{e.description}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-5 md:grid-cols-2">
            {groups.map((g) => (
              <Panel key={g.category}>
                <PanelHeader title={CATEGORY_LABEL[g.category]} />
                <ul className="divide-y divide-line">
                  {g.entries.map((e: HubEntry) => (
                    <li key={e.key}>
                      <Link to={e.href} className="flex items-center gap-3 px-4 py-3 hover:bg-panel-sunk">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ink">{e.title}</p>
                          <p className="text-xs text-ink-muted">{e.description}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
