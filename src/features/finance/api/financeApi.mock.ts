import { scopedDb } from "@/mocks/scope";
import { ApiError, latency, mutate } from "@/mocks/db";
import { agingBucket, invoiceSisa, outletExposure, unallocated } from "@/mocks/ar";
import {
  accountBalances,
  createAccount as mocksCreateAccount,
  profitAndLoss,
  trialBalance,
  upgradeChart as mocksUpgradeChart,
} from "@/mocks/ledger";
import {
  allocatePayment,
  createCreditNote,
  createPayment,
  decidePayment,
  syncReceivables,
} from "@/mocks/rules";
import { isoDate, startOfToday } from "@/mocks/seed";
import type { AccountBalance } from "@/mocks/ledger";
import { AGING_BUCKETS } from "./contract";
import type {
  AgingReport,
  AgingRow,
  AllocationLine,
  ChartUpgradeResult,
  CreateAccountInput,
  CreditNoteInput,
  CreditNoteView,
  DateRange,
  FinanceApi,
  FundingResult,
  FundStopInput,
  InvoiceFilters,
  InvoiceView,
  JournalView,
  PaymentView,
  ProfitAndLossView,
  RecordPaymentInput,
  TrialBalanceView,
} from "./contract";

/* ── invoices ──────────────────────────────────────────────────────────── */

function toInvoiceView(id: string): InvoiceView | null {
  const db = scopedDb();
  const inv = db.invoices.find((i) => i.id === id);
  if (!inv) return null;
  const pkl = db.outlets.find((p) => p.id === inv.outletId);
  const delivery = db.deliveries.find((d) => d.id === inv.deliveryId);
  const today = isoDate(startOfToday());

  return {
    id: inv.id,
    nomor: inv.nomor,
    outletId: inv.outletId,
    outlet: pkl?.nama ?? "—",
    kecamatan: pkl?.kecamatan ?? "—",
    suratJalan: delivery?.kode ?? "—",
    tanggal: inv.tanggal,
    jatuhTempo: inv.jatuhTempo,
    umurHari: Math.floor(
      (new Date(today).getTime() - new Date(inv.jatuhTempo).getTime()) / 86_400_000,
    ),
    bucket: agingBucket(inv, today),
    jumlahUnit: inv.jumlahUnit,
    total: inv.total,
    terbayar: inv.terbayar,
    kredit: inv.kredit,
    sisa: invoiceSisa(inv),
    status: inv.status,
    termin: pkl?.termin ?? 0,
  };
}

async function getInvoices(filters?: InvoiceFilters): Promise<InvoiceView[]> {
  await latency("read");
  syncReceivables();
  const db = scopedDb();

  return db.invoices
    .map((i) => toInvoiceView(i.id)!)
    .filter((inv) => {
      if (filters?.status === "Belum lunas") {
        if (inv.sisa <= 0 || inv.status === "Batal") return false;
      } else if (filters?.status && filters.status !== "Semua") {
        if (inv.status !== filters.status) return false;
      }
      if (filters?.outletId && filters.outletId !== "Semua") {
        if (inv.outletId !== filters.outletId) return false;
      }
      if (filters?.bucket && filters.bucket !== "Semua" && inv.bucket !== filters.bucket)
        return false;
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        return (
          inv.nomor.toLowerCase().includes(q) ||
          inv.outlet.toLowerCase().includes(q) ||
          inv.suratJalan.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

/* ── ageing ────────────────────────────────────────────────────────────── */

async function getAgingReport(): Promise<AgingReport> {
  await latency("read");
  syncReceivables();
  const db = scopedDb();
  const today = isoDate(startOfToday());

  const byOutlet = new Map<string, AgingRow>();
  const totals: Record<string, number> = Object.fromEntries(
    AGING_BUCKETS.map((b) => [b, 0]),
  );

  for (const inv of db.invoices) {
    const sisa = invoiceSisa(inv);
    if (inv.status === "Batal" || sisa <= 0) continue;

    const pkl = db.outlets.find((p) => p.id === inv.outletId);
    let row = byOutlet.get(inv.outletId);
    if (!row) {
      const exp = outletExposure(db, inv.outletId);
      row = {
        outletId: inv.outletId,
        outlet: pkl?.nama ?? "—",
        termin: pkl?.termin ?? 0,
        batasKredit: pkl?.batasKredit ?? 0,
        buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])),
        total: 0,
        jatuhTempo: 0,
        terblokir: exp.terblokir,
      };
      byOutlet.set(inv.outletId, row);
    }

    const bucket = agingBucket(inv, today);
    row.buckets[bucket] += sisa;
    row.total += sisa;
    if (bucket !== "Belum jatuh tempo") row.jatuhTempo += sisa;
    totals[bucket] += sisa;
  }

  const rows = [...byOutlet.values()].sort((a, b) => b.total - a.total);
  return {
    rows,
    totals,
    grandTotal: rows.reduce((s, r) => s + r.total, 0),
    jatuhTempoTotal: rows.reduce((s, r) => s + r.jatuhTempo, 0),
    outletMenunggak: rows.filter((r) => r.jatuhTempo > 0).length,
    buckets: AGING_BUCKETS,
  };
}

/* ── cash receipts ─────────────────────────────────────────────────────── */

async function getPayments(status?: string, search?: string): Promise<PaymentView[]> {
  await latency("read");
  const db = scopedDb();

  return db.payments
    .map((p) => {
      const pkl = db.outlets.find((x) => x.id === p.outletId);
      return {
        id: p.id,
        nomor: p.nomor,
        outletId: p.outletId,
        outlet: pkl?.nama ?? "—",
        tanggal: p.tanggal,
        jumlah: p.jumlah,
        belumDialokasikan: unallocated(p),
        bank: p.bank,
        noRekening: p.noRekening,
        status: p.status,
        alokasi: p.alokasi.map((a) => ({
          invoiceId: a.invoiceId,
          nomor: db.invoices.find((i) => i.id === a.invoiceId)?.nomor ?? "—",
          jumlah: a.jumlah,
        })),
        buktiTransfer: p.buktiTransfer,
        keterangan: p.keterangan,
        diverifikasiOleh: p.diverifikasiOleh,
      };
    })
    .filter((p) => {
      if (status && status !== "Semua" && p.status !== status) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.nomor.toLowerCase().includes(q) ||
          p.outlet.toLowerCase().includes(q) ||
          p.noRekening.includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
}

async function getOpenInvoices(outletId: string): Promise<InvoiceView[]> {
  await latency("read");
  return scopedDb()
    .invoices.filter(
      (i) => i.outletId === outletId && i.status !== "Batal" && invoiceSisa(i) > 0,
    )
    .map((i) => toInvoiceView(i.id)!)
    .sort((a, b) => a.jatuhTempo.localeCompare(b.jatuhTempo));
}

async function submitPayment(input: RecordPaymentInput): Promise<PaymentView> {
  await latency("write");
  const p = createPayment(input);
  return (await getPayments()).find((v) => v.id === p.id)!;
}

async function submitAllocation(
  paymentId: string,
  alokasi: AllocationLine[],
): Promise<PaymentView> {
  await latency("write");
  allocatePayment(paymentId, alokasi);
  return (await getPayments()).find((v) => v.id === paymentId)!;
}

/** Verify or reject a recorded receipt -- the state-machine step PaymentPage
 *  drives from its decision dialog. */
async function submitPaymentDecision(
  paymentId: string,
  action: "verify" | "reject",
  keterangan?: string,
): Promise<PaymentView> {
  await latency("write");
  decidePayment(paymentId, action, keterangan);
  return (await getPayments()).find((v) => v.id === paymentId)!;
}

async function submitCreditNote(input: CreditNoteInput): Promise<CreditNoteView> {
  await latency("write");
  return createCreditNote(input);
}

/* ── distribution funding ─────────────────────────────────────────────────
 *
 * Known gap, deliberately not papered over (same policy as the HTTP
 * adapter's own header comment): the mock has no notion of "this line is
 * funded by receipt X". `PaymentControlBoard`'s Lunas/Belum Lunas signal
 * comes from `outletExposure`'s credit standing (distributionApi.mock's
 * `getPaymentBoard`), a wholly different, pre-existing concept -- so acting
 * here cannot flip it, the way FundStop flips payment_state on the real API.
 *
 * What this DOES do honestly: track which receipt is assigned to which
 * outlet's stop, in module-local memory (not the persisted `db`, so it does
 * not survive a reload), so Alokasikan/Lepas round-trip sensibly within one
 * session and the console can show "funded by PAY-..." without inventing a
 * number. `fundedAmount`/`plannedAmount` on the mock board stay 0 for the
 * same reason as `hasUnpricedLine: true` there -- the mock has never priced
 * a plan line, so there is no honest rupiah figure to report.
 */
const mockStopFunding = new Map<string, { paymentId: string; distributionOrderId: string }>();

function stopFundingKey(outletId: string, distributionOrderId: string): string {
  return `${outletId}|${distributionOrderId}`;
}

async function getOutletReceipts(outletId: string): Promise<PaymentView[]> {
  return (await getPayments()).filter(
    (p) => p.outletId === outletId && p.status !== "Ditolak",
  );
}

async function fundDistributionStop(input: FundStopInput): Promise<FundingResult> {
  await latency("write");
  const payments = await getPayments();
  const payment = payments.find((p) => p.id === input.paymentId);
  if (!payment) throw new ApiError("Pembayaran tidak ditemukan.", 404);
  if (payment.outletId !== input.outletId) {
    throw new ApiError("Pembayaran ini milik pangkalan lain.", 409);
  }
  mockStopFunding.set(stopFundingKey(input.outletId, input.distributionOrderId), {
    paymentId: input.paymentId,
    distributionOrderId: input.distributionOrderId,
  });
  return {
    payment,
    distributionOrderId: input.distributionOrderId,
    outletId: input.outletId,
    linesAffected: 1,
    availableBalance: payment.belumDialokasikan,
  };
}

async function releaseDistributionStop(input: FundStopInput): Promise<FundingResult> {
  await latency("write");
  const key = stopFundingKey(input.outletId, input.distributionOrderId);
  const funded = mockStopFunding.get(key);
  if (!funded || funded.paymentId !== input.paymentId) {
    throw new ApiError("Titik ini tidak dialokasikan ke pembayaran tersebut.", 404);
  }
  mockStopFunding.delete(key);
  const payment = (await getPayments()).find((p) => p.id === input.paymentId)!;
  return {
    payment,
    distributionOrderId: input.distributionOrderId,
    outletId: input.outletId,
    linesAffected: 1,
    availableBalance: payment.belumDialokasikan,
  };
}

/* ── general ledger ────────────────────────────────────────────────────── */

async function getJournals(range?: DateRange): Promise<JournalView[]> {
  await latency("read");
  const db = scopedDb();
  const byId = new Map(db.accounts.map((a) => [a.id, a]));

  return db.journals
    .filter((j) => {
      if (range?.from && j.tanggal < range.from) return false;
      if (range?.to && j.tanggal > range.to) return false;
      return true;
    })
    .map((j) => ({
      id: j.id,
      nomor: j.nomor,
      tanggal: j.tanggal,
      keterangan: j.keterangan,
      status: j.status,
      total: j.lines.reduce((s, l) => s + l.debit, 0),
      lines: j.lines.map((l) => ({
        akun: byId.get(l.akunId),
        debit: l.debit,
        kredit: l.kredit,
        memo: l.memo,
      })),
    }));
}

async function getTrialBalance(range: { from: string; to: string }): Promise<TrialBalanceView> {
  await latency("read");
  return trialBalance(scopedDb(), range);
}

async function getProfitAndLoss(
  range: { from: string; to: string },
): Promise<ProfitAndLossView> {
  await latency("read");
  return profitAndLoss(scopedDb(), range);
}

async function getChartOfAccounts(): Promise<AccountBalance[]> {
  await latency("read");
  return accountBalances(scopedDb());
}

async function createAccount(input: CreateAccountInput): Promise<void> {
  await latency("write");
  mutate((db) => {
    mocksCreateAccount(db, {
      kode: input.kode,
      nama: input.nama,
      tipe: input.tipe,
      indukId: input.indukId,
      deskripsi: input.deskripsi,
    });
  });
}

async function upgradeChart(dryRun = true): Promise<ChartUpgradeResult> {
  await latency("write");
  const result = mutate((db) => mocksUpgradeChart(db, dryRun));
  return {
    dryRun,
    akunDitambahkan: result.akunDitambahkan,
    layoutDitambahkan: [],
    konflik: result.konflik,
  };
}

export const financeApiMock: FinanceApi = {
  getInvoices,
  getAgingReport,
  getPayments,
  getOpenInvoices,
  submitPayment,
  submitAllocation,
  submitPaymentDecision,
  getOutletReceipts,
  fundDistributionStop,
  releaseDistributionStop,
  submitCreditNote,
  getJournals,
  getTrialBalance,
  getProfitAndLoss,
  createAccount,
  upgradeChart,
  getChartOfAccounts,
};
