/**
 * Laba Rugi, Neraca, Penjelasan Akun and a Buku Besar drill-down, generated
 * from the ledger via the phase-P2 statement engine. Financial-statements
 * plan, phase P2.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileDown, TriangleAlert, Upload } from "lucide-react";
import {
  downloadPackage,
  getBalanceSheet,
  getBalanceSheetNotes,
  getGeneralLedger,
  getProfitAndLoss,
} from "@/features/financialstatements/api/financialstatementsApi";
import { StatementTable } from "@/features/financialstatements/components/StatementTable";
import { KomparasiPanel } from "@/features/financialstatements/components/KomparasiPanel";
import { GeneralKeterangan } from "@/features/financialstatements/components/GeneralKeterangan";
import { notesToRows, statementToRows } from "@/features/financialstatements/lib/komparasiRows";
import { scopeKeyBS, scopeKeyPL } from "@/features/financialstatements/lib/compare";
import { listStatements } from "@/features/externalstatements/api/externalstatementsApi";
import { ImportStatementDialog } from "@/features/externalstatements/components/ImportStatementDialog";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { Field, SegmentedControl, SelectInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { formatDateId, formatRupiah } from "@/lib/format";
import { scopeKey } from "@/mocks/scope";

type Tab = "laba-rugi" | "neraca" | "penjelasan" | "komparasi" | "buku-besar";
type KomparasiView = "laba-rugi" | "penjelasan" | "neraca";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function yearOptions(): number[] {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2, current - 3, current - 4];
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Resolves the year/month picker into the two windows the engine needs:
 *  a P&L range and a Neraca as-of date. Clamped to today so a current,
 *  unfinished year never asks for a balance sheet dated in the future. */
function resolvePeriod(year: number, month: number | "semua"): { from: string; to: string; asOf: string } {
  const today = new Date().toISOString().slice(0, 10);
  let from: string;
  let to: string;
  if (month === "semua") {
    from = `${year}-01-01`;
    to = `${year}-12-31`;
  } else {
    const lastDay = new Date(year, month, 0).getDate();
    from = `${year}-${pad2(month)}-01`;
    to = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  }
  const clampedTo = to > today ? today : to;
  return { from, to: clampedTo, asOf: clampedTo };
}

export function FinancialStatementsPage() {
  const [tab, setTab] = useState<Tab>("laba-rugi");
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState<number | "semua">("semua");
  const period = resolvePeriod(year, month);

  const [glAccount, setGlAccount] = useState<{ id: string; code: string } | null>(null);

  const [komparasiView, setKomparasiView] = useState<KomparasiView>("laba-rugi");
  const komparasiExternalKind = komparasiView === "laba-rugi" ? "profit_loss" : "balance_sheet";
  const [compareSource, setCompareSource] = useState<string>("");
  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();

  const pl = useQuery({
    queryKey: [...scopeKey(), "financial-statements", "pl", period.from, period.to],
    queryFn: () => getProfitAndLoss({ from: period.from, to: period.to }),
  });
  const bs = useQuery({
    queryKey: [...scopeKey(), "financial-statements", "bs", period.asOf],
    queryFn: () => getBalanceSheet({ asOf: period.asOf }),
  });
  const notes = useQuery({
    queryKey: [...scopeKey(), "financial-statements", "notes", period.asOf],
    queryFn: () => getBalanceSheetNotes({ asOf: period.asOf }),
    enabled: tab === "penjelasan",
  });
  const gl = useQuery({
    queryKey: [...scopeKey(), "financial-statements", "gl", glAccount?.id, period.from, period.to],
    queryFn: () => getGeneralLedger({ accountId: glAccount!.id, from: period.from, to: period.to }),
    enabled: tab === "buku-besar" && !!glAccount,
  });

  const externalStatements = useQuery({
    queryKey: [...scopeKey(), "financial-statements", "external-statements", komparasiExternalKind],
    queryFn: () => listStatements(komparasiExternalKind),
    enabled: tab === "komparasi",
  });
  const komparasiPL = useQuery({
    queryKey: [...scopeKey(), "financial-statements", "komparasi-pl", period.from, period.to, compareSource],
    queryFn: () => getProfitAndLoss({ from: period.from, to: period.to, compare: compareSource }),
    enabled: tab === "komparasi" && komparasiView === "laba-rugi" && !!compareSource,
  });
  const komparasiBS = useQuery({
    queryKey: [...scopeKey(), "financial-statements", "komparasi-bs", period.asOf, compareSource],
    queryFn: () => getBalanceSheet({ asOf: period.asOf, compare: compareSource }),
    enabled: tab === "komparasi" && komparasiView === "neraca" && !!compareSource,
  });
  const komparasiNotes = useQuery({
    queryKey: [...scopeKey(), "financial-statements", "komparasi-notes", period.asOf, compareSource],
    queryFn: () => getBalanceSheetNotes({ asOf: period.asOf, compare: compareSource }),
    enabled: tab === "komparasi" && komparasiView === "penjelasan" && !!compareSource,
  });

  const exportMutation = useDeskMutation({
    mutationFn: () =>
      downloadPackage(
        month === "semua"
          ? { fiscalYear: year }
          : { dateFrom: period.from, dateTo: period.to, asOf: period.asOf },
      ),
    errorTitle: "Unduh laporan gagal",
    success: "Laporan keuangan diunduh",
  });

  function openInGeneralLedger(accountId: string, code: string) {
    setGlAccount({ id: accountId, code });
    setTab("buku-besar");
  }

  const warnings = tab === "neraca" ? bs.data?.warnings : tab === "laba-rugi" ? pl.data?.warnings : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Laporan Keuangan"
        description="Laba Rugi, Neraca, dan Penjelasan Akun, dihasilkan langsung dari buku besar -- bukan angka terpisah yang bisa berbeda dari jurnal."
        meta={
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "laba-rugi" as const, label: "Laba Rugi" },
              { value: "neraca" as const, label: "Neraca" },
              { value: "penjelasan" as const, label: "Penjelasan Akun" },
              { value: "komparasi" as const, label: "Komparasi" },
              { value: "buku-besar" as const, label: "Buku Besar" },
            ]}
          />
        }
        actions={
          <Button
            variant="outline"
            onClick={() => exportMutation.mutate(undefined as never)}
            disabled={exportMutation.isPending}
          >
            <FileDown className="h-4 w-4" />
            Unduh Excel
          </Button>
        }
      />

      <Panel>
        <div className="flex flex-wrap items-end gap-4 p-4">
          <Field label="Tahun buku" htmlFor="fs-year">
            <SelectInput id="fs-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {yearOptions().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Bulan" htmlFor="fs-month">
            <SelectInput
              id="fs-month"
              value={month}
              onChange={(e) => setMonth(e.target.value === "semua" ? "semua" : Number(e.target.value))}
            >
              <option value="semua">Sepanjang tahun</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </Panel>

      {warnings && warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-rust bg-rust/5 p-3 text-xs text-rust-ink">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p className="mb-1 font-semibold">{warnings.length} peringatan integritas data:</p>
            <ul className="space-y-0.5">
              {warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === "laba-rugi" && (
        <Panel>
          <PanelHeader
            title="Laporan Laba Rugi"
            hint={`Periode ${formatDateId(period.from)} - ${formatDateId(period.to)}`}
          />
          {pl.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <StatementTable lines={pl.data?.lines ?? []} onAccountClick={openInGeneralLedger} />
          )}
        </Panel>
      )}

      {tab === "neraca" && (
        <Panel>
          <PanelHeader title="Neraca" hint={`Per ${formatDateId(period.asOf)}`} />
          {bs.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <StatementTable lines={bs.data?.lines ?? []} onAccountClick={openInGeneralLedger} />
          )}
        </Panel>
      )}

      {tab === "penjelasan" && (
        <Panel>
          <PanelHeader title="Penjelasan Akun Neraca" hint={`Per ${formatDateId(period.asOf)}`} />
          {notes.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <div className="divide-y divide-line">
              {(notes.data?.notes ?? []).map((n) => (
                <div key={n.noteNumber} className="p-4">
                  <p className="mb-2 text-sm font-semibold text-ink">
                    {n.noteNumber}. {n.label}
                  </p>
                  {n.leaves.length === 0 ? (
                    <p className="text-xs text-ink-muted">Tidak ada saldo pada periode ini.</p>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <tbody>
                        {n.leaves.map((leaf) => (
                          <tr key={leaf.code}>
                            <td className="py-1 text-ink-muted">{leaf.name}</td>
                            <td className="data py-1 text-right text-ink">{formatRupiah(leaf.amount)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-line font-semibold">
                          <td className="py-1 text-ink">Total</td>
                          <td className="data py-1 text-right text-ink">{formatRupiah(n.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                  <GeneralKeterangan
                    layoutLineCode={n.lineCode}
                    scopeKey={scopeKeyBS(period.asOf)}
                    value={n.keterangan}
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}

      {tab === "komparasi" && (
        <Panel>
          <PanelHeader
            title="Komparasi"
            hint="Dibandingkan dengan laporan yang diimpor, periode sebelumnya, atau tahun sebelumnya."
            actions={
              <CanAccess permission={PERMISSIONS.EXTERNAL_STATEMENTS_CREATE}>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <Upload className="h-3.5 w-3.5" />
                  Impor laporan pembanding
                </Button>
              </CanAccess>
            }
          />
          <div className="flex flex-wrap items-end gap-4 border-b border-line p-4">
            <Field label="Jenis laporan" htmlFor="komparasi-view">
              <SegmentedControl
                value={komparasiView}
                onChange={(v) => { setKomparasiView(v); setCompareSource(""); }}
                options={[
                  { value: "laba-rugi" as const, label: "Laba Rugi" },
                  { value: "penjelasan" as const, label: "Penjelasan Akun" },
                  { value: "neraca" as const, label: "Neraca" },
                ]}
              />
            </Field>
            <Field label="Bandingkan dengan" htmlFor="komparasi-source">
              <SelectInput id="komparasi-source" value={compareSource} onChange={(e) => setCompareSource(e.target.value)}>
                <option value="">— Pilih —</option>
                {(externalStatements.data ?? []).map((s) => (
                  <option key={s.id} value={`external:${s.id}`}>{s.label}</option>
                ))}
                <option value="prior_period">Periode sebelumnya</option>
                <option value="prior_year">Tahun sebelumnya</option>
              </SelectInput>
            </Field>
          </div>

          {!compareSource ? (
            <p className="p-4 text-sm text-ink-muted">
              Pilih laporan pembanding di atas untuk melihat selisihnya dengan sistem.
            </p>
          ) : komparasiView === "laba-rugi" ? (
            komparasiPL.isLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : komparasiPL.data ? (
              <KomparasiPanel
                rows={statementToRows(komparasiPL.data)}
                extras={komparasiPL.data.extraCompareLines ?? []}
                compareLabel={komparasiPL.data.compare?.label ?? "Pembanding"}
                scopeKey={scopeKeyPL(period.from, period.to)}
                externalStatementId={compareSource.startsWith("external:") ? compareSource.slice("external:".length) : undefined}
              />
            ) : null
          ) : komparasiView === "neraca" ? (
            komparasiBS.isLoading ? (
              <Skeleton className="h-96 w-full" />
            ) : komparasiBS.data ? (
              <KomparasiPanel
                rows={statementToRows(komparasiBS.data)}
                extras={komparasiBS.data.extraCompareLines ?? []}
                compareLabel={komparasiBS.data.compare?.label ?? "Pembanding"}
                scopeKey={scopeKeyBS(period.asOf)}
                externalStatementId={compareSource.startsWith("external:") ? compareSource.slice("external:".length) : undefined}
              />
            ) : null
          ) : komparasiNotes.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : komparasiNotes.data ? (
            <KomparasiPanel
              rows={notesToRows(komparasiNotes.data)}
              extras={komparasiNotes.data.extraCompareLines ?? []}
              compareLabel={komparasiNotes.data.compare?.label ?? "Pembanding"}
              scopeKey={scopeKeyBS(period.asOf)}
              externalStatementId={compareSource.startsWith("external:") ? compareSource.slice("external:".length) : undefined}
            />
          ) : null}
        </Panel>
      )}

      <ImportStatementDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        kind={komparasiExternalKind}
        defaultPeriodFrom={period.from}
        defaultPeriodTo={period.to}
        defaultAsOf={period.asOf}
        onImported={(id) => {
          setCompareSource(`external:${id}`);
          queryClient.invalidateQueries({ queryKey: [...scopeKey(), "financial-statements", "external-statements"] });
        }}
      />

      {tab === "buku-besar" && (
        <Panel>
          <PanelHeader
            title="Buku Besar"
            hint={glAccount ? `Akun ${glAccount.code}, periode ${formatDateId(period.from)} - ${formatDateId(period.to)}` : "Pilih akun dari Laba Rugi atau Neraca"}
          />
          {!glAccount ? (
            <p className="p-4 text-sm text-ink-muted">
              Klik salah satu akun pada tab Laba Rugi atau Neraca untuk melihat rinciannya di sini.
            </p>
          ) : gl.isLoading ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <div className="overflow-x-auto p-4">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line">
                    <th className="pb-2 text-ink-muted">Tanggal</th>
                    <th className="pb-2 text-ink-muted">No. Jurnal</th>
                    <th className="pb-2 text-ink-muted">Keterangan</th>
                    <th className="pb-2 text-right text-ink-muted">Debit</th>
                    <th className="pb-2 text-right text-ink-muted">Kredit</th>
                    <th className="pb-2 text-right text-ink-muted">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-line bg-panel-sunk">
                    <td colSpan={5} className="py-1.5 text-ink-muted">Saldo awal</td>
                    <td className="data py-1.5 text-right text-ink">{formatRupiah(gl.data?.openingBalance ?? 0)}</td>
                  </tr>
                  {(gl.data?.lines ?? []).map((l) => (
                    <tr key={l.journalId + l.date} className="border-b border-line">
                      <td className="py-1.5 text-ink">{formatDateId(l.date)}</td>
                      <td className="data py-1.5 text-ink-muted">{l.journalNumber}</td>
                      <td className="py-1.5 text-ink-muted">{l.description}</td>
                      <td className="data py-1.5 text-right text-ink">{l.debit ? formatRupiah(l.debit) : ""}</td>
                      <td className="data py-1.5 text-right text-ink">{l.credit ? formatRupiah(l.credit) : ""}</td>
                      <td className="data py-1.5 text-right font-semibold text-ink">{formatRupiah(l.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
