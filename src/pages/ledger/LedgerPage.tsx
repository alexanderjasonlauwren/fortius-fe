import { scopeKey } from "@/lib/scope";
import { AttachmentsButton } from "@/features/attachments/components/AttachmentsButton";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { BookOpen, CheckCircle2, Copy, Plus, TriangleAlert, Undo2 } from "lucide-react";
import { leafAccounts } from "@/features/finance/lib/accounts";
import {
  getChartOfAccounts,
  getJournals,
  getTrialBalance,
  type JournalView,
} from "@/features/finance/api/financeApi";
import { JOURNAL_SOURCE_LABEL, journalSourceHref } from "@/features/finance/lib/journalSource";
import { ManualJournalDialog } from "@/features/finance/components/ManualJournalDialog";
import { ReverseJournalDialog } from "@/features/finance/components/ReverseJournalDialog";
import { defaultRange } from "@/features/transactions/api/transactionApi";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateId, formatRupiah, formatRupiahShort } from "@/lib/format";

type Tab = "jurnal" | "neraca-saldo";

/**
 * Where the old Buku Besar tabs went (accounting parity P6): Laba rugi was a
 * second copy of Laporan Keuangan's, Bagan akun is Daftar Akun and Tutup
 * Buku its own page. A bookmark to one of them still lands somewhere real.
 */
const MOVED_TABS: Record<string, string> = {
  "laba-rugi": "/financial-statements?tab=laba-rugi",
  bagan: "/accounts",
  "tutup-buku": "/fiscal-years",
};

export function LedgerPage() {
  const [params] = useSearchParams();
  const requested = params.get("tab");
  const [tab, setTab] = useState<Tab>(requested === "neraca-saldo" ? "neraca-saldo" : "jurnal");
  const [range, setRange] = useState(defaultRange);

  if (requested && MOVED_TABS[requested]) return <Navigate to={MOVED_TABS[requested]} replace />;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Jurnal Umum"
        description="Setiap tagihan, penerimaan, pembelian, biaya, dan voucher memposting jurnal berpasangan ke sini. Neraca saldo dihitung dari jurnal yang sama."
        actions={
          (
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
            ]}
          />
        }
      />

      {tab === "jurnal" && <JournalSection range={range} />}
      {tab === "neraca-saldo" && <TrialBalanceSection range={range} />}
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
