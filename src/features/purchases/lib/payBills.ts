import { recordPurchasePayment } from "@/features/purchases/api/purchaseApi";

/** Pays each amount in turn; returns how many succeeded before any refusal. */
export async function payBillsInTurn(
  lines: { purchaseId: string; amount: number }[],
  common: { paidOn: string; bankAccountId?: string; bankReference?: string },
): Promise<number> {
  let done = 0;
  for (const line of lines) {
    try {
      await recordPurchasePayment({ purchaseId: line.purchaseId, amount: line.amount, ...common });
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      throw new Error(done > 0 ? `${done} tagihan sudah dibayar; berhenti di tagihan berikutnya: ${why}` : why);
    }
    done += 1;
  }
  return done;
}
