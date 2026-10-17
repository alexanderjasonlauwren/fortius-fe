/**
 * Persediaan (accounting parity P7, client requirement §8.1): each product's
 * stock and what it cost, at the moving average a sale is costed at; the stock
 * counts that corrected it; and the two ways to state what is physically
 * there -- opening stock and a stock count. Each product opens its kartu stok.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, PackagePlus } from "lucide-react";
import { getStock, listStockCounts } from "@/features/inventory/api/inventoryApi";
import { StockCountDialog } from "@/features/inventory/components/StockCountDialog";
import { OpeningStockDialog } from "@/features/inventory/components/OpeningStockDialog";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { SegmentedControl } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateId, formatNumber, formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

type Tab = "stok" | "opname";

export function InventoryPage() {
  const [tab, setTab] = useState<Tab>("stok");
  const [counting, setCounting] = useState(false);
  const [opening, setOpening] = useState(false);
  const stock = useQuery({ queryKey: [...scopeKey(), "inventory", "stock"], queryFn: getStock });
  const counts = useQuery({ queryKey: [...scopeKey(), "inventory", "counts"], queryFn: listStockCounts, enabled: tab === "opname" });

  const rows = stock.data ?? [];
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const unopened = rows.some((r) => !r.opened);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Persediaan"
        description="Jumlah dan nilai stok per produk dengan harga rata-rata bergerak -- harga yang dipakai untuk HPP setiap penjualan."
        meta={
          <SegmentedControl<Tab>
            value={tab}
            onChange={setTab}
            options={[{ value: "stok", label: "Stok" }, { value: "opname", label: "Riwayat opname" }]}
          />
        }
        actions={
          <CanAccess permission={PERMISSIONS.INVENTORY_CREATE}>
            <div className="flex gap-2">
              {unopened && (
                <Button variant="outline" onClick={() => setOpening(true)}>
                  <PackagePlus className="h-4 w-4" /> Saldo awal
                </Button>
              )}
              <Button onClick={() => setCounting(true)}>
                <ClipboardCheck className="h-4 w-4" /> Stok opname
              </Button>
            </div>
          </CanAccess>
        }
      />

      {tab === "stok" && (
        <Panel>
          <PanelHeader title="Stok per produk" hint={`Nilai persediaan ${formatRupiah(total)}`} />
          {stock.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-2xs uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-2 text-left font-semibold">Produk</th>
                    <th className="px-4 py-2 text-right font-semibold">Kuantitas</th>
                    <th className="px-4 py-2 text-right font-semibold">Harga rata-rata</th>
                    <th className="px-4 py-2 text-right font-semibold">Nilai</th>
                    <th className="px-4 py-2 text-right font-semibold">Mutasi terakhir</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.productId} className="border-b border-line">
                      <td className="px-4 py-2">
                        <Link to={`/laporan/stock_card?product_id=${r.productId}`} className="text-ink hover:underline">
                          <span className="data text-xs text-ink-muted">{r.code}</span> {r.name}
                        </Link>
                        {!r.opened && <span className="ml-2 text-2xs text-ink-muted">belum ada stok</span>}
                        {r.kind === "container" && <span className="ml-2 text-2xs text-ink-muted">jumlah saja</span>}
                      </td>
                      <td className={cn("data px-4 py-2 text-right", r.quantity < 0 ? "text-rust-ink" : "text-ink")}>
                        {formatNumber(r.quantity)}
                      </td>
                      <td className="data px-4 py-2 text-right text-ink-muted">{r.average ? formatRupiah(r.average) : "—"}</td>
                      <td className="data px-4 py-2 text-right text-ink">{r.amount ? formatRupiah(r.amount) : "—"}</td>
                      <td className="px-4 py-2 text-right text-xs text-ink-muted">{r.lastMovement ? formatDateId(r.lastMovement) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.some((r) => r.quantity < 0) && (
                <p className="border-t border-line p-4 text-xs text-rust-ink">
                  Stok negatif: penjualan tercatat sebelum pembelian atau saldo awalnya. Catat pembelian yang belum masuk, atau koreksi
                  lewat stok opname.
                </p>
              )}
            </div>
          )}
        </Panel>
      )}

      {tab === "opname" && (
        <Panel>
          <PanelHeader title="Riwayat stok opname" hint="Selisih dinilai dengan harga rata-rata pada tanggal opname" />
          {counts.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (counts.data ?? []).length === 0 ? (
            <p className="p-6 text-center text-sm text-ink-muted">Belum ada stok opname.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(counts.data ?? []).map((c) => (
                <li key={c.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      <span className="data">{c.number}</span> · {formatDateId(c.date)}
                      {c.countedBy && <span className="font-normal text-ink-muted"> · {c.countedBy}</span>}
                    </p>
                    <p className={cn("data text-sm", c.totalAmount < 0 ? "text-rust-ink" : "text-ink")}>
                      {c.totalAmount === 0 ? "Tanpa selisih" : `Selisih ${formatRupiah(c.totalAmount)}`}
                    </p>
                  </div>
                  {c.notes && <p className="mt-1 text-xs text-ink-muted">{c.notes}</p>}
                  <table className="mt-2 w-full text-xs">
                    <tbody>
                      {c.lines.map((l) => (
                        <tr key={l.productId} className="border-t border-line">
                          <td className="py-1 text-ink">{l.code} {l.name}</td>
                          <td className="data py-1 text-right text-ink-muted">buku {formatNumber(l.systemQuantity)}</td>
                          <td className="data py-1 text-right text-ink-muted">hitung {formatNumber(l.countedQuantity)}</td>
                          <td className={cn("data py-1 text-right", l.difference < 0 ? "text-rust-ink" : "text-ink")}>
                            {l.difference > 0 ? "+" : ""}{formatNumber(l.difference)}
                          </td>
                          <td className="data py-1 text-right text-ink">{l.amount ? formatRupiah(l.amount) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <StockCountDialog key={counting ? "count-open" : "count-closed"} open={counting} stock={rows} onClose={() => setCounting(false)} />
      <OpeningStockDialog key={opening ? "open-open" : "open-closed"} open={opening} stock={rows} onClose={() => setOpening(false)} />
    </div>
  );
}
