import { scopeKey } from "@/lib/scope";
import { AttachmentsButton } from "@/features/attachments/components/AttachmentsButton";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, CheckCircle2, Copy, Plus, TriangleAlert, Undo2 } from "lucide-react";
import { leafAccounts } from "@/features/finance/lib/accounts";
import {
  getChartOfAccounts,
  getJournals,
  getProfitAndLoss,
  getTrialBalance,
  upgradeChart,
  type ChartUpgradeResult,
  type JournalView,
} from "@/features/finance/api/financeApi";
import { JOURNAL_SOURCE_LABEL, journalSourceHref } from "@/features/finance/lib/journalSource";
import { ManualJournalDialog } from "@/features/finance/components/ManualJournalDialog";
import { ReverseJournalDialog } from "@/features/finance/components/ReverseJournalDialog";
import { FiscalYearSection } from "@/features/fiscalyears/components/FiscalYearSection";
import { defaultRange } from "@/features/transactions/api/transactionApi";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import {
  Panel,
  PanelBody,
  PanelHeader,
  Skeleton,
} from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { Field, SearchInput, SegmentedControl, SelectInput, TextInput } from "@/components/common/Field";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateId, formatRupiah, formatRupiahShort } from "@/lib/format";

type Tab = "jurnal" | "neraca-saldo" | "laba-rugi" | "bagan" | "tutup-buku";

export function LedgerPage() {
  const [tab, setTab] = useState<Tab>("jurnal");
  const [range, setRange] = useState(defaultRange);
  // Distinct from JOURNALS_VIEW, which only gates the page itself: confirmed
  // live that finance_officer holds finance.read.journals but not
  // finance.read.accounts (only tenant_admin does), so the chart-of-accounts
  // tab needs its own gate or that role sees a permanently empty table.
  const canViewAccounts = useAuthStore((s) => s.hasPermission(PERMISSIONS.ACCOUNTS_VIEW));
  const canViewFiscalYears = useAuthStore((s) => s.hasPermission(PERMISSIONS.FISCAL_YEARS_VIEW));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Buku Besar"
        description="Setiap tagihan, penerimaan, dan nota kredit memposting jurnal berpasangan ke sini. Laporan di bawah dihitung dari jurnal, bukan dari tabel operasional."
        actions={
          tab !== "tutup-buku" && (
            <div className="flex items-end gap-2">
              <Field label="Dari" htmlFor="l-from">
                <TextInput
                  id="l-from"
                  type="date"
                  mono
                  className="py-1.5 text-xs"
                  value={range.from}
                  max={range.to}
                  onChange={(e) => setRange({ ...range, from: e.target.value })}
                />
              </Field>
              <Field label="Sampai" htmlFor="l-to">
                <TextInput
                  id="l-to"
                  type="date"
                  mono
                  className="py-1.5 text-xs"
                  value={range.to}
                  min={range.from}
                  onChange={(e) => setRange({ ...range, to: e.target.value })}
                />
              </Field>
            </div>
          )
        }
        meta={
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "jurnal" as const, label: "Jurnal" },
              { value: "neraca-saldo" as const, label: "Neraca saldo" },
              { value: "laba-rugi" as const, label: "Laba rugi" },
              ...(canViewAccounts
                ? [{ value: "bagan" as const, label: "Bagan akun" }]
                : []),
              ...(canViewFiscalYears
                ? [{ value: "tutup-buku" as const, label: "Tutup Buku" }]
                : []),
            ]}
          />
        }
      />

      {tab === "jurnal" && <JournalSection range={range} />}
      {tab === "neraca-saldo" && <TrialBalanceSection range={range} />}
      {tab === "laba-rugi" && <ProfitLossSection range={range} />}
      {tab === "bagan" && canViewAccounts && <ChartSection />}
      {tab === "tutup-buku" && canViewFiscalYears && <FiscalYearSection />}
    </div>
  );
}

/* ── journals ──────────────────────────────────────────────────────────── */

function JournalSection({ range }: { range: { from: string; to: string } }) {
  const [search, setSearch] = useState("");
  const [accountId, setAccountId] = useState("");
  const journals = useQuery({
    queryKey: [...scopeKey(), "journals", range, search, accountId],
    queryFn: () => getJournals(range, { search, accountId: accountId || undefined }),
  });
  const accounts = useQuery({ queryKey: [...scopeKey(), "manual-journal", "accounts"], queryFn: getChartOfAccounts });
  // The dialog is open for a fresh entry ("new") or a copy of a journal.
  const [journalDialog, setJournalDialog] = useState<"new" | JournalView | null>(null);
  const [reverseTarget, setReverseTarget] = useState<JournalView | null>(null);

  const rows = journals.data ?? [];
  const filtered = !!search || !!accountId;

  return (
    <Panel>
      <PanelHeader
        title="Jurnal umum"
        hint={`${rows.length} entri pada periode ini · entri yang sudah diposting tidak dapat diubah, hanya dibalik`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Nomor atau keterangan" className="w-48" />
            <SelectInput aria-label="Akun" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-56">
              <option value="">Semua akun</option>
              {leafAccounts(accounts.data ?? []).map((a) => (
                <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} — {a.akun.nama}</option>
              ))}
            </SelectInput>
            <CanAccess permission={PERMISSIONS.JOURNALS_CREATE}>
              <Button size="sm" onClick={() => setJournalDialog("new")}>
                <Plus className="h-3.5 w-3.5" />
                Jurnal baru
              </Button>
            </CanAccess>
          </div>
        }
      />
      {journals.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={filtered ? "Tidak ada jurnal yang cocok" : "Belum ada jurnal pada periode ini"}
          description={filtered ? "Ubah pencarian atau akun." : "Jurnal terbentuk otomatis saat tagihan terbit, kas diterima, atau nota kredit diterbitkan."}
        />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((j) => (
            <li key={j.id} className="px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="flex items-center gap-2">
                  <span className="data text-xs font-semibold text-ink">
                    {j.nomor}
                  </span>
                  {j.status === "Dibatalkan" && (
                    <StatusBadge variant="draft" label="Dibalik" />
                  )}
                  <AttachmentsButton ownerType="journal" ownerId={j.id} label={j.nomor} />
                  {j.sourceType === "manual" && (
                    <CanAccess permission={PERMISSIONS.JOURNALS_CREATE}>
                      <Button variant="ghost" size="icon-xs" aria-label={`Duplikat ${j.nomor}`} onClick={() => setJournalDialog(j)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </CanAccess>
                  )}
                  {j.status === "Diposting" && (j.sourceType === "manual" || j.sourceType === "openingBalance") && (
                    <CanAccess permission={PERMISSIONS.JOURNALS_CREATE}>
                      <Button
                        variant="ghost" size="icon-xs" aria-label={`Balik ${j.nomor}`}
                        className="hover:bg-rust-soft hover:text-rust-ink"
                        onClick={() => setReverseTarget(j)}
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </Button>
                    </CanAccess>
                  )}
                </p>
                <p className="data text-2xs text-ink-muted">
                  {formatDateId(j.tanggal)}{j.branchName ? ` · ${j.branchName}` : ""}
                </p>
              </div>
              <p className="mt-0.5 text-sm text-ink">{j.keterangan}</p>
              <JournalSource journal={j} />

              {/* Three columns of mono amounts with no break opportunity in a
                  digit-grouped number: without a scroller this overflows the
                  page, unlike the two tables further down this file. */}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[22rem] text-left">
                  <thead>
                    <tr>
                      <th className="label pb-1 text-2xs text-ink-muted">
                        Akun
                      </th>
                      <th className="label pb-1 text-right text-2xs text-ink-muted">
                        Debit
                      </th>
                      <th className="label pb-1 text-right text-2xs text-ink-muted">
                        Kredit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {j.lines.map((l, i) => (
                      <tr key={i} className="border-t border-line">
                        <td className="py-1.5 text-xs text-ink">
                          <span className="data text-ink-muted">
                            {l.akun?.kode}
                          </span>{" "}
                          {l.akun?.nama}
                          {l.memo && <span className="block text-2xs text-ink-muted">{l.memo}</span>}
                        </td>
                        <td className="data py-1.5 text-right text-xs text-ink">
                          {l.debit > 0 ? formatRupiah(l.debit) : "—"}
                        </td>
                        <td className="data py-1.5 text-right text-xs text-ink">
                          {l.kredit > 0 ? formatRupiah(l.kredit) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ManualJournalDialog
        // A fresh mount per target, so a duplicate starts from its journal.
        key={journalDialog === "new" ? "new" : journalDialog ? journalDialog.id : "closed"}
        open={!!journalDialog}
        template={journalDialog === "new" ? null : journalDialog}
        onClose={() => setJournalDialog(null)}
        onPosted={() => void journals.refetch()}
      />
      <ReverseJournalDialog
        journal={reverseTarget}
        onClose={() => setReverseTarget(null)}
        onReversed={() => void journals.refetch()}
      />
    </Panel>
  );
}

/** What posted this journal, linked to where that document is worked on. */
function JournalSource({ journal }: { journal: JournalView }) {
  if (journal.sourceType === "manual") return null;
  const label = JOURNAL_SOURCE_LABEL[journal.sourceType];
  const href = journalSourceHref(journal.sourceType, journal.sourceId);
  const text = journal.sourceNumber ? `${label} · ${journal.sourceNumber}` : label;
  return (
    <p className="mt-1 text-2xs text-ink-muted">
      Sumber:{" "}
      {href ? (
        <Link to={href} className="data font-medium text-ink underline-offset-2 hover:underline">
          {text}
        </Link>
      ) : (
        <span className="data font-medium text-ink">{text}</span>
      )}
    </p>
  );
}

/* ── trial balance ─────────────────────────────────────────────────────── */

function TrialBalanceSection({
  range,
}: {
  range: { from: string; to: string };
}) {
  const tb = useQuery({
    queryKey: [...scopeKey(), "trial-balance", range],
    queryFn: () => getTrialBalance(range),
  });

  if (tb.isLoading || !tb.data) return <Skeleton className="h-96 w-full" />;
  const { rows, totals, seimbang } = tb.data;
  const selisih = Math.abs(totals.saldoAkhirDebit - totals.saldoAkhirKredit);
  const amount = (n: number) => (n > 0 ? formatRupiah(n) : "—");
  const head = "label px-3 py-2 text-right text-2xs text-ink-muted";
  const cell = "data px-3 py-2 text-right text-sm text-ink";

  return (
    <>
      <Panel spine={seimbang ? "text-pine" : "text-rust"}>
        <PanelBody className="flex flex-wrap items-center gap-3">
          {seimbang ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-pine-ink" />
          ) : (
            <TriangleAlert className="h-4 w-4 shrink-0 text-rust-ink" />
          )}
          <p className="flex-1 text-sm text-ink">
            {seimbang ? (
              <>
                <span className="font-semibold">Buku besar seimbang.</span>{" "}
                <span className="text-ink-muted">
                  Saldo awal, mutasi, dan saldo akhir sama di sisi debit dan
                  kredit, jadi laporan dapat dipercaya.
                </span>
              </>
            ) : (
              <>
                <span className="font-semibold">Buku besar tidak seimbang.</span>{" "}
                <span className="text-ink-muted">Selisih saldo akhir {formatRupiah(selisih)}.</span>
              </>
            )}
          </p>
          <span className="data text-xs text-ink-muted">
            Mutasi D {formatRupiahShort(totals.debit)} · K {formatRupiahShort(totals.kredit)}
          </span>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Neraca saldo"
          hint="Saldo awal sebelum “Dari”, mutasi dalam periode, saldo akhir per “Sampai” · pendapatan dan beban dihitung sejak 1 Januari"
        />
        {rows.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="Belum ada saldo atau mutasi"
            description="Akun muncul di sini setelah ada jurnal sebelum atau dalam periode ini."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left">
              <thead>
                <tr className="bg-panel-sunk">
                  <th rowSpan={2} className="label border-b border-line px-5 py-2 text-2xs text-ink-muted">
                    Akun
                  </th>
                  <th colSpan={2} className="label px-3 pt-2 text-center text-2xs text-ink-muted">Saldo awal</th>
                  <th colSpan={2} className="label px-3 pt-2 text-center text-2xs text-ink-muted">Mutasi</th>
                  <th colSpan={2} className="label px-3 pt-2 text-center text-2xs text-ink-muted">Saldo akhir</th>
                </tr>
                <tr className="border-b border-line bg-panel-sunk">
                  {["Debit", "Kredit", "Debit", "Kredit", "Debit", "Kredit"].map((label, i) => (
                    <th key={i} className={head}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.akun.id} className="border-b border-line">
                    <td className="px-5 py-2 text-sm text-ink">
                      <span className="data text-xs text-ink-muted">{r.akun.kode}</span> {r.akun.nama}
                    </td>
                    <td className={cell}>{amount(r.saldoAwalDebit)}</td>
                    <td className={cell}>{amount(r.saldoAwalKredit)}</td>
                    <td className={cell}>{amount(r.debit)}</td>
                    <td className={cell}>{amount(r.kredit)}</td>
                    <td className={cn(cell, "font-semibold")}>{amount(r.saldoAkhirDebit)}</td>
                    <td className={cn(cell, "font-semibold")}>{amount(r.saldoAkhirKredit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-ink">
                <tr>
                  <td className="px-5 py-3 text-xs font-semibold text-ink">Total</td>
                  {[
                    totals.saldoAwalDebit, totals.saldoAwalKredit, totals.debit,
                    totals.kredit, totals.saldoAkhirDebit, totals.saldoAkhirKredit,
                  ].map((n, i) => (
                    <td key={i} className="data px-3 py-3 text-right text-xs font-semibold text-ink">
                      {formatRupiah(n)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ── profit and loss ───────────────────────────────────────────────────── */

function ProfitLossSection({ range }: { range: { from: string; to: string } }) {
  const pl = useQuery({
    queryKey: [...scopeKey(), "profit-loss", range],
    queryFn: () => getProfitAndLoss(range),
  });

  if (pl.isLoading || !pl.data) return <Skeleton className="h-96 w-full" />;
  const p = pl.data;
  const marginPct =
    p.totalPendapatan === 0 ? 0 : (p.labaKotor / p.totalPendapatan) * 100;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          label="Pendapatan bersih"
          value={formatRupiahShort(p.totalPendapatan)}
        />
        <Figure
          label="Laba kotor"
          value={formatRupiahShort(p.labaKotor)}
          hint={`Margin ${marginPct.toFixed(1)}%`}
          tone="pine"
        />
        <Figure label="Total beban" value={formatRupiahShort(p.totalBeban)} />
        <Figure
          label="Laba bersih"
          value={formatRupiahShort(p.labaBersih)}
          tone={p.labaBersih >= 0 ? "pine" : "rust"}
        />
      </div>

      <Panel>
        <PanelHeader
          title="Laporan laba rugi"
          hint="Dihitung dari jurnal periode ini"
        />
        <div className="divide-y divide-line">
          <Section
            title="Pendapatan"
            rows={p.pendapatan}
            total={p.totalPendapatan}
          />
          <Section title="Beban" rows={p.beban} total={p.totalBeban} />
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-sm font-semibold text-ink">Laba bersih</span>
            <span
              className={cn(
                "data text-lg font-semibold",
                p.labaBersih >= 0 ? "text-pine-ink" : "text-rust-ink",
              )}
            >
              {formatRupiah(p.labaBersih)}
            </span>
          </div>
        </div>
      </Panel>
    </>
  );
}

function Section({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { akun: { id: string; kode: string; nama: string }; saldo: number }[];
  total: number;
}) {
  const visible = rows.filter((r) => r.saldo !== 0);
  return (
    <div className="px-5 py-4">
      <p className="label mb-2 text-2xs text-ink-muted">{title}</p>
      {visible.length === 0 ? (
        <p className="text-xs text-ink-muted">
          Belum ada mutasi pada periode ini.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map((r) => (
            <li key={r.akun.id} className="flex justify-between gap-4 text-sm">
              <span className="text-ink-muted">
                <span className="data text-2xs">{r.akun.kode}</span>{" "}
                {r.akun.nama}
              </span>
              <span className="data text-ink">{formatRupiah(r.saldo)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 flex justify-between gap-4 border-t border-line pt-2.5 text-sm font-semibold">
        <span className="text-ink">Total {title.toLowerCase()}</span>
        <span className="data text-ink">{formatRupiah(total)}</span>
      </div>
    </div>
  );
}

/* ── chart of accounts ─────────────────────────────────────────────────── */

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

function ChartSection() {
  const chart = useQuery({
    queryKey: [...scopeKey(), "chart-of-accounts"],
    queryFn: getChartOfAccounts,
  });
  const canManageAccounts = useAuthStore((s) => s.hasPermission(PERMISSIONS.ACCOUNTS_CREATE));
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
                    {r.akun.nama}
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

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "pine" | "rust";
}) {
  const spine = { pine: "spine text-pine", rust: "spine text-rust" };
  return (
    <div
      className={cn(
        "rounded-md border border-line bg-panel p-4",
        tone && spine[tone],
      )}
    >
      <p className="label text-2xs text-ink-muted">{label}</p>
      <p className="data mt-1.5 truncate text-figure font-semibold text-ink">{value}</p>
      {hint && <p className="mt-2 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
