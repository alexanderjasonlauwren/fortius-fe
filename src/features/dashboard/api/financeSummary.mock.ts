import { scopedDb } from "@/mocks/scope";
import { latency } from "@/mocks/db";
import { financeApiMock } from "@/features/finance/api/financeApi.mock";
import type { FinanceSummaryApi } from "./financeSummary.contract";

export const financeSummaryMock: FinanceSummaryApi = {
  async getVerifiedCash(window) {
    await latency("read");
    const amount = scopedDb().payments
      .filter((row) => row.status === "Terverifikasi" && row.tanggal >= window.from && row.tanggal <= window.to)
      .reduce((sum, row) => sum + row.jumlah, 0);
    return { complete: true, amount };
  },
  async getMonthlyReceivables(window) {
    await latency("read");
    const amount = scopedDb().invoices
      .filter((row) => row.status !== "Batal" && row.tanggal >= window.from && row.tanggal <= window.to)
      .reduce((sum, row) => sum + Math.max(0, row.total - row.terbayar - row.kredit), 0);
    return { complete: true, amount };
  },
  async getGrossMargin(window) {
    const result = await financeApiMock.getProfitAndLoss(window);
    return { complete: true, amount: result.labaKotor };
  },
};
