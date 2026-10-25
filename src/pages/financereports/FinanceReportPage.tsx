/**
 * One report of the pack: its period (a preset range, or one date for an
 * as-of report), a branch where the report has one, the table, its tie-out
 * checks against the ledger, and xlsx / print. Accounting parity P5.
 */
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CircleCheck, FileDown, Printer, TriangleAlert } from "lucide-react";
import {
  downloadFinanceReport,
  getFinanceReport,
  getReportCatalogue,
  type ReportQuery,
} from "@/features/financereports/api/financereportsApi";
import { ReportTable } from "@/features/financereports/components/ReportTable";
import { getStock } from "@/features/inventory/api/inventoryApi";
import {
  PRESET_LABEL,
  periodFromParams,
  periodToParams,
  recallPeriod,
  rememberPeriod,
  resolveRange,
  type PeriodPreset,
  type PeriodState,
} from "@/features/financereports/lib/period";
import { reportPeriodLabel, reportPrintHtml } from "@/features/financereports/lib/render";
import { useScope } from "@/features/tenancy/useScope";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { Field, SegmentedControl, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { printDocument } from "@/lib/export";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function yearOptions(): number[] {
  const current = new Date().getFullYear();
  return [current + 1, current, current - 1, current - 2, current - 3];
}

const ALL = "semua";

export function FinanceReportPage() {
  const { key = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const { branches, branchId: scopeBranch, canSeeAll } = useScope();
  // The report's own branch filter starts on the console's branch and can
  // widen to every branch without switching the whole console.
  const [branch, setBranch] = useState<string>(() => scopeBranch ?? ALL);

  const catalogue = useQuery({ queryKey: [...scopeKey(), "finance-reports", "catalogue"], queryFn: getReportCatalogue });
  const def = catalogue.data?.find((d) => d.key === key);
  // A range report reopens on the period last used; an as-of report (aging,
  // assets) on today -- yesterday's aging is rarely what anyone wants.
  const period = periodFromParams(def?.periodKind === "as_of" ? params : recallPeriod(key, params));

  // A report about one product (Kartu Stok) picks it here, kept in the URL
  // so Persediaan and Ringkasan Persediaan can link straight to it.
  const needsProduct = def?.params.includes("product") ?? false;
  const productId = params.get("product_id") ?? "";
  const products = useQuery({
    queryKey: [...scopeKey(), "inventory", "stock"],
    queryFn: getStock,
    enabled: needsProduct,
  });

  const range = resolveRange(period);
  const query: ReportQuery = def?.periodKind === "as_of" ? { asOf: period.date } : { from: range.from, to: range.to };
  if (def?.branched && branch !== ALL) query.branchId = branch;
  if (needsProduct && productId) query.productId = productId;

  const report = useQuery({
    queryKey: [...scopeKey(), "finance-reports", key, query],
    queryFn: () => getFinanceReport(key, query),
    enabled: !!def && (!needsProduct || !!productId),
  });

  const exportMutation = useDeskMutation({
    mutationFn: () => downloadFinanceReport(key, query),
    errorTitle: "Unduh laporan gagal",
    success: "Laporan diunduh",
  });

  function update(next: Partial<PeriodState>) {
    const state = { ...period, ...next };
    rememberPeriod(key, state);
    setParams(periodToParams(state, new URLSearchParams(params)), { replace: true });
  }

  const branchLabel = branch === ALL ? "Semua cabang" : branches.find((b) => b.id === branch)?.nama;

  if (catalogue.isSuccess && !def) {
    return (
      <div className="space-y-4">
        <Link to="/laporan" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Laporan
        </Link>
        <p className="text-sm text-ink-muted">Laporan &ldquo;{key}&rdquo; tidak ditemukan.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link to="/laporan" className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Laporan
      </Link>
      <PageHeader
        eyebrow="Laporan"
        title={def?.title ?? "Laporan"}
        description={def?.description}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!report.data}
              onClick={() => report.data && printDocument(report.data.title, reportPrintHtml(report.data, def?.branched ? branchLabel : undefined))}
            >
              <Printer className="h-4 w-4" />
              Cetak / PDF
            </Button>
            <CanAccess permission={PERMISSIONS.FINANCE_REPORTS_EXPORT}>
              <Button variant="outline" disabled={!def || (needsProduct && !productId) || exportMutation.isPending} onClick={() => exportMutation.mutate(undefined as never)}>
                <FileDown className="h-4 w-4" />
                Unduh Excel
              </Button>
            </CanAccess>
          </div>
        }
      />

      <Panel>
        <div className="flex flex-wrap items-end gap-4 p-4">
          {def?.periodKind === "as_of" ? (
            <Field label="Per tanggal" htmlFor="rp-asof">
              <TextInput id="rp-asof" type="date" value={period.date} onChange={(e) => e.target.value && update({ date: e.target.value })} />
            </Field>
          ) : (
            <>
              <Field label="Periode" htmlFor="rp-preset">
                <SegmentedControl<PeriodPreset>
                  value={period.preset}
                  onChange={(preset) => update({ preset })}
                  options={(Object.keys(PRESET_LABEL) as PeriodPreset[]).map((p) => ({ value: p, label: PRESET_LABEL[p] }))}
                />
              </Field>
              {(period.preset === "harian" || period.preset === "mingguan") && (
                <Field label={period.preset === "harian" ? "Tanggal" : "Minggu yang memuat"} htmlFor="rp-date">
                  <TextInput id="rp-date" type="date" value={period.date} onChange={(e) => e.target.value && update({ date: e.target.value })} />
                </Field>
              )}
              {(period.preset === "bulanan" || period.preset === "tahunan") && (
                <Field label="Tahun" htmlFor="rp-year">
                  <SelectInput id="rp-year" value={period.year} onChange={(e) => update({ year: Number(e.target.value) })}>
                    {yearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
                  </SelectInput>
                </Field>
              )}
              {period.preset === "bulanan" && (
                <Field label="Bulan" htmlFor="rp-month">
                  <SelectInput id="rp-month" value={period.month} onChange={(e) => update({ month: Number(e.target.value) })}>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </SelectInput>
                </Field>
              )}
              {period.preset === "custom" && (
                <>
                  <Field label="Dari" htmlFor="rp-from">
                    <TextInput id="rp-from" type="date" value={period.from} onChange={(e) => e.target.value && update({ from: e.target.value })} />
                  </Field>
                  <Field label="Sampai" htmlFor="rp-to">
                    <TextInput id="rp-to" type="date" value={period.to} onChange={(e) => e.target.value && update({ to: e.target.value })} />
                  </Field>
                </>
              )}
            </>
          )}
          {needsProduct && (
            <Field label="Produk" htmlFor="rp-product">
              <SelectInput
                id="rp-product"
                value={productId}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  next.set("product_id", e.target.value);
                  setParams(next, { replace: true });
                }}
              >
                <option value="">— Pilih produk —</option>
                {(products.data ?? []).map((p) => (
                  <option key={p.productId} value={p.productId}>{p.code} {p.name}</option>
                ))}
              </SelectInput>
            </Field>
          )}
          {def?.branched && (branches.length > 1 || canSeeAll) && (
            <Field label="Cabang" htmlFor="rp-branch">
              <SelectInput id="rp-branch" value={branch} onChange={(e) => setBranch(e.target.value)}>
                {canSeeAll && <option value={ALL}>Semua cabang</option>}
                {branches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
              </SelectInput>
            </Field>
          )}
        </div>
      </Panel>

      {report.data && report.data.checks.length > 0 && (
        <div className="space-y-2">
          {report.data.checks.map((c) =>
            c.ok ? (
              <div key={c.label} className="flex items-center gap-2 rounded-md border border-line bg-panel-sunk p-2.5 text-xs text-ink-muted">
                <CircleCheck className="h-3.5 w-3.5 shrink-0 text-[#00B050]" />
                {c.label}: sesuai ({formatRupiah(c.expected)})
              </div>
            ) : (
              <div key={c.label} className="flex items-start gap-2 rounded-md border border-rust bg-rust/5 p-2.5 text-xs text-rust-ink">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <strong>{c.label}: tidak sesuai.</strong> Buku besar {formatRupiah(c.expected)}, laporan {formatRupiah(c.actual)}, selisih{" "}
                  {formatRupiah(c.expected - c.actual)}. Ada dokumen yang jurnalnya tidak cocok; telusuri dari baris laporan.
                </span>
              </div>
            ),
          )}
        </div>
      )}

      <Panel>
        <PanelHeader
          title={report.data?.company.legalName ?? def?.title ?? ""}
          hint={report.data ? `${reportPeriodLabel(report.data)}${def?.branched ? ` · ${branchLabel ?? ""}` : ""}` : undefined}
        />
        {needsProduct && !productId ? (
          <p className="p-4 text-sm text-ink-muted">Pilih produk untuk melihat kartu stoknya.</p>
        ) : report.isLoading || catalogue.isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : report.isError ? (
          <p className="p-4 text-sm text-rust-ink">Laporan gagal dimuat. Coba lagi, atau ubah periodenya.</p>
        ) : report.data ? (
          <ReportTable report={report.data} />
        ) : null}
        {report.data && report.data.notes.length > 0 && (
          <ul className="space-y-0.5 border-t border-line p-4 text-xs text-ink-muted">
            {report.data.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
      </Panel>
    </div>
  );
}
