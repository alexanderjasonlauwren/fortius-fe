/**
 * Laporan: the report catalogue, grouped the way Jurnal groups it. The
 * statements themselves (Laba Rugi, Neraca, Penjelasan Akun, Komparasi,
 * Buku Besar) stay on Laporan Keuangan and are linked from Ikhtisar Bisnis
 * rather than rebuilt here. Accounting parity P5.
 */
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  getReportCatalogue,
  type ReportCategory,
} from "@/features/financereports/api/financereportsApi";
import { useAuthStore } from "@/features/auth/store/authStore";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { scopeKey } from "@/lib/scope";

interface Entry {
  title: string;
  description: string;
  href: string;
}

const STATEMENTS: Entry[] = [
  { title: "Laba Rugi", description: "Pendapatan, HPP, biaya, dan laba bersih untuk satu periode.", href: "/financial-statements?tab=laba-rugi" },
  { title: "Neraca", description: "Aset, kewajiban, dan ekuitas per tanggal.", href: "/financial-statements?tab=neraca" },
  { title: "Penjelasan Akun", description: "Rincian setiap pos Neraca per akun.", href: "/financial-statements?tab=penjelasan" },
  { title: "Komparasi", description: "Laporan sistem dibandingkan dengan laporan yang diimpor atau periode lain.", href: "/financial-statements?tab=komparasi" },
  { title: "Buku Besar", description: "Mutasi dan saldo berjalan satu akun.", href: "/financial-statements?tab=buku-besar" },
];

export function FinanceReportsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canStatements = hasPermission(PERMISSIONS.FINANCIAL_STATEMENTS_VIEW);
  const catalogue = useQuery({ queryKey: [...scopeKey(), "finance-reports", "catalogue"], queryFn: getReportCatalogue });

  const groups = CATEGORY_ORDER.map((category) => {
    const entries: Entry[] = (catalogue.data ?? [])
      .filter((d) => d.category === category)
      .map((d) => ({ title: d.title, description: d.description, href: `/laporan/${d.key}` }));
    return { category, entries: category === "ikhtisar" && canStatements ? [...STATEMENTS, ...entries] : entries };
  }).filter((g) => g.entries.length > 0);

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
        <div className="grid gap-5 md:grid-cols-2">
          {groups.map((g) => (
            <Panel key={g.category}>
              <PanelHeader title={CATEGORY_LABEL[g.category as ReportCategory]} />
              <ul className="divide-y divide-line">
                {g.entries.map((e) => (
                  <li key={e.href}>
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
      )}
    </div>
  );
}
