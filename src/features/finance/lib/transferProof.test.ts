import { describe, expect, it } from "vitest";
import type { ReceiptExtraction } from "@/features/ocr/api/ocrApi";
import type { BankNameEntity } from "@/types/domain";
import { isRecordable, prefillFromProof, proofNotices } from "./transferProof";

const BANKS: BankNameEntity[] = ["BCA", "BNI", "Mandiri", "BRI", "BSI"];
const OUTLET = "o-1";

function proof(over: Partial<ReceiptExtraction> = {}): ReceiptExtraction {
  return {
    id: "x-1", hasFile: true, createdAt: "2026-11-10T07:00:00Z", status: "pending",
    processStatus: "ready", documentType: "bank_transfer", reviewReasons: [], confidence: {}, evidence: {},
    archived: false, totalAmount: 640_000, txnDate: "2026-11-08", referenceNo: "202611080930112233445566778",
    transfer: { bank: "BNI", customerId: "4507009999999001", outlet: { id: OUTLET, name: "Pangkalan Contoh" } },
    ...over,
  };
}

describe("prefilling a payment from a bukti transfer", () => {
  it("fills the amount, date, reference, bank and the matched pangkalan", () => {
    expect(prefillFromProof(proof(), BANKS, new Set([OUTLET]))).toEqual({
      outletId: OUTLET, jumlah: 640_000, tanggal: "2026-11-08",
      referensi: "202611080930112233445566778", bank: "BNI", noRekening: undefined,
    });
  });

  it("matches the bank whatever case the engine read it in", () => {
    const p = proof({ transfer: { bank: "MANDIRI " } });
    expect(prefillFromProof(p, BANKS, new Set()).bank).toBe("Mandiri");
  });

  // The form can only pick an outlet it lists; a bank it does not list is
  // left for the cashier rather than guessed.
  it("leaves out a pangkalan or bank the form cannot pick", () => {
    const p = proof({ transfer: { bank: "Bank Jateng", outlet: { id: "elsewhere", name: "?" } } });
    const filled = prefillFromProof(p, BANKS, new Set([OUTLET]));
    expect(filled.outletId).toBeUndefined();
    expect(filled.bank).toBeUndefined();
  });

  it("takes the sender's account only when it was read in full", () => {
    expect(prefillFromProof(proof({ transfer: { senderAccount: "0123-456 789" } }), BANKS, new Set()).noRekening)
      .toBe("0123456789");
    expect(prefillFromProof(proof({ transfer: { senderAccount: "xxxx1234" } }), BANKS, new Set()).noRekening)
      .toBeUndefined();
  });
});

describe("what the cashier is told about a proof", () => {
  const texts = (p: ReceiptExtraction) => proofNotices(p).map((n) => n.text);

  it("says nothing about a clean, matched transfer", () => {
    expect(proofNotices(proof())).toEqual([]);
  });

  it("warns of a second upload of the same transfer, and of one already recorded", () => {
    expect(proofNotices(proof({ duplicateOf: "x-0" }))[0].tone).toBe("danger");
    expect(texts(proof({ paymentNumber: "PAY-SLT-1" }))).toContain("Bukti ini sudah dicatat sebagai PAY-SLT-1.");
  });

  // An unmatched ID Pangkalan is also what a transfer paid to another agent
  // looks like.
  it("flags an ID Pangkalan that is not one of this agency's", () => {
    const notices = proofNotices(proof({ transfer: { customerId: "4507000000000000" } }));
    expect(notices).toHaveLength(1);
    expect(notices[0].tone).toBe("warn");
    expect(notices[0].text).toContain("4507000000000000");
  });

  it("asks for the values by hand when the engine could not read the photo", () => {
    const p = proof({ processStatus: "failed", processError: "Foto tidak terbaca.", transfer: undefined });
    expect(texts(p)).toEqual(["Foto tidak terbaca. Isi formulir dari fotonya."]);
  });
});

describe("which proofs a payment can be recorded from", () => {
  it("waits while the engine reads, and refuses one already used or not a transfer", () => {
    expect(isRecordable(proof())).toBe(true);
    expect(isRecordable(proof({ processStatus: "failed" }))).toBe(true);
    expect(isRecordable(proof({ processStatus: "processing" }))).toBe(false);
    expect(isRecordable(proof({ archived: true }))).toBe(false);
    expect(isRecordable(proof({ documentType: "expense_receipt" }))).toBe(false);
  });
});
