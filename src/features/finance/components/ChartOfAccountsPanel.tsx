/**
 * The chart of accounts: every account with its running balance, each one
 * opening its own Buku Besar, and the chart-v2/v3 upgrade. Lifted out of the
 * old Buku Besar page's "Bagan akun" tab into Daftar Akun (accounting parity
 * P6).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getChartOfAccounts, upgradeChart, type ChartUpgradeResult } from "@/features/finance/api/financeApi";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

/**
 * How many ancestors `kode` has, walking `induk` up to a root -- purely for
 * indentation. `seen` guards against a cyclical chart (should never happen,
 * but an infinite loop in a render function is worse than a flat row).
 */
function accountDepth(
  kode: string | undefined,
  byKode: Map<string, string | undefined>,
  seen: Set<string> = new Set(),
): number {
  if (!kode || seen.has(kode)) return 0;
  seen.add(kode);
  const parent = byKode.get(kode);
  return parent ? 1 + accountDepth(parent, byKode, seen) : 0;
}

export function ChartOfAccountsPanel() {
  const chart = useQuery({
    queryKey: [...scopeKey(), "chart-of-accounts"],
    queryFn: getChartOfAccounts,
  });
  const canManageAccounts = useAuthStore((s) => s.hasPermission(PERMISSIONS.ACCOUNTS_CREATE));
  // Each account opens its own transactions, as Jurnal's Daftar Akun does.
  const canOpenLedger = useAuthStore((s) => s.hasPermission(PERMISSIONS.FINANCIAL_STATEMENTS_VIEW));
  const [preview, setPreview] = useState<ChartUpgradeResult | null>(null);

  const previewMutation = useDeskMutation({
    mutationFn: () => upgradeChart(true),
    errorTitle: "Pratinjau pembaruan bagan akun gagal",
    onDone: (result) => setPreview(result),
  });
  const applyMutation = useDeskMutation({
    mutationFn: () => upgradeChart(false),
    errorTitle: "Pembaruan bagan akun gagal",
    success: (result) => ({
      title: "Bagan akun diperbarui",
      description: `${result.akunDitambahkan.length} akun dan ${result.layoutDitambahkan.length} laporan ditambahkan.`,
    }),
    onDone: () => setPreview(null),
  });

  if (chart.isLoading) return <Skeleton className="h-96 w-full" />;

  const indukByKode = new Map((chart.data ?? []).map((r) => [r.akun.kode, r.akun.induk]));

  return (
    <>
      <Panel>
        <PanelHeader
          title="Bagan akun"
          hint="Akun bertanda sistem dipakai aturan pemostingan dan tidak dapat dihapus"
          actions={
            canManageAccounts && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => previewMutation.mutate(undefined as never)}
                disabled={previewMutation.isPending}
              >
                Perbarui bagan akun
              </Button>
            )
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line bg-panel-sunk">
                <th className="label px-5 py-2.5 text-2xs text-ink-muted">
                  Kode
                </th>
                <th className="label px-5 py-2.5 text-2xs text-ink-muted">
                  Nama akun
                </th>
                <th className="label px-5 py-2.5 text-2xs text-ink-muted">
                  Tipe
                </th>
                <th className="label px-5 py-2.5 text-2xs text-ink-muted">
                  Saldo normal
                </th>
                <th className="label px-5 py-2.5 text-right text-2xs text-ink-muted">
                  Saldo berjalan
                </th>
              </tr>
            </thead>
            <tbody>
              {(chart.data ?? []).map((r) => (
                <tr key={r.akun.id} className="border-b border-line">
                  <td className="data px-5 py-2.5 text-xs text-ink-muted">
                    {r.akun.kode}
                  </td>
                  <td
                    className="px-5 py-2.5 text-sm text-ink"
                    style={{ paddingLeft: `${1.25 + accountDepth(r.akun.kode, indukByKode) * 1.25}rem` }}
                  >
                    {canOpenLedger ? (
                      <Link
                        to={`/financial-statements?tab=buku-besar&account=${r.akun.id}`}
                        className="hover:underline"
                        title="Lihat transaksi akun ini di Buku Besar"
                      >
                        {r.akun.nama}
                      </Link>
                    ) : (
                      r.akun.nama
                    )}
                    {r.akun.sistem && (
                      <span className="ml-2 rounded-sm bg-panel-raised px-1.5 py-0.5 text-2xs text-ink-muted">
                        sistem
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 text-xs text-ink-muted">
                    {r.akun.tipe}
                  </td>
                  <td className="px-5 py-2.5 text-xs capitalize text-ink-muted">
                    {r.akun.saldoNormal}
                  </td>
                  <td className="data px-5 py-2.5 text-right text-sm text-ink">
                    {formatRupiah(r.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Perbarui bagan akun</DialogTitle>
            <DialogDescription>
              Menambahkan akun dan laporan standar yang belum ada. Akun dan
              laporan yang sudah ada tidak diubah.
            </DialogDescription>
          </DialogHeader>

          {preview && (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-semibold text-ink">
                  {preview.akunDitambahkan.length}
                </span>{" "}
                akun dan{" "}
                <span className="font-semibold text-ink">
                  {preview.layoutDitambahkan.length}
                </span>{" "}
                laporan akan ditambahkan.
              </p>
              {preview.akunDitambahkan.length > 0 && (
                <p className="data text-xs text-ink-muted">
                  {preview.akunDitambahkan.join(", ")}
                </p>
              )}
              {preview.konflik.length > 0 && (
                <div className="rounded-md border border-rust bg-rust/5 p-3 text-xs text-rust-ink">
                  <p className="mb-1 font-semibold">
                    {preview.konflik.length} kode bentrok, tidak akan diubah:
                  </p>
                  <ul className="space-y-0.5">
                    {preview.konflik.map((k) => (
                      <li key={k.kode}>
                        <span className="data">{k.kode}</span> — {k.alasan}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.akunDitambahkan.length === 0 &&
                preview.layoutDitambahkan.length === 0 && (
                  <p className="text-ink-muted">
                    Bagan akun dan laporan sudah sesuai standar terkini.
                  </p>
                )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Batal
            </Button>
            <Button
              disabled={
                !preview ||
                (preview.akunDitambahkan.length === 0 && preview.layoutDitambahkan.length === 0) ||
                applyMutation.isPending
              }
              onClick={() => applyMutation.mutate(undefined as never)}
            >
              Terapkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

