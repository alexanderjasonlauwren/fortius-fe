/**
 * A payment recorded from a bukti transfer: what the proof fills into the
 * Catat penerimaan form, and what about it the cashier must see before
 * recording. The cashier still checks every value against the photo -- these
 * only save the typing.
 */
import type { ReceiptExtraction } from "@/features/ocr/api/ocrApi";
import type { BankNameEntity } from "@/types/domain";

export interface ProofPrefill {
  outletId?: string;
  jumlah?: number;
  tanggal?: string;
  referensi?: string;
  bank?: BankNameEntity;
  noRekening?: string;
}

/**
 * The form values a proof supplies. The pangkalan only when it is one the
 * form can pick (the engine matched its ID Pangkalan to this agency's outlet);
 * the bank only when it is one the form lists; the sender's account only when
 * it was read in full -- a masked one ("xxxx1234") is not a number to store.
 */
export function prefillFromProof(
  proof: ReceiptExtraction,
  banks: readonly BankNameEntity[],
  outletIds: ReadonlySet<string>,
): ProofPrefill {
  const readBank = proof.transfer?.bank?.trim().toLowerCase();
  const account = proof.transfer?.senderAccount?.replace(/[\s-]/g, "");
  const outletId = proof.transfer?.outlet?.id;
  return {
    outletId: outletId && outletIds.has(outletId) ? outletId : undefined,
    jumlah: proof.totalAmount,
    tanggal: proof.txnDate,
    referensi: proof.referenceNo,
    bank: readBank ? banks.find((b) => b.toLowerCase() === readBank) : undefined,
    noRekening: account && /^\d{6,}$/.test(account) ? account : undefined,
  };
}

export type ProofNoticeTone = "danger" | "warn";

export interface ProofNotice {
  tone: ProofNoticeTone;
  text: string;
}

/** What the cashier must know about a proof before recording from it. */
export function proofNotices(proof: ReceiptExtraction): ProofNotice[] {
  const notices: ProofNotice[] = [];
  if (proof.paymentNumber) {
    notices.push({ tone: "danger", text: `Bukti ini sudah dicatat sebagai ${proof.paymentNumber}.` });
  }
  if (proof.duplicateOf) {
    notices.push({
      tone: "danger",
      text: "Nomor referensinya sama dengan bukti yang sudah pernah diunggah. Kemungkinan transfer yang sama dikirim dua kali.",
    });
  }
  if (proof.documentType === "expense_receipt") {
    notices.push({ tone: "danger", text: "Ini terbaca sebagai struk, bukan bukti transfer." });
  }
  if (proof.processStatus === "failed") {
    notices.push({
      tone: "warn",
      text: `${proof.processError ?? "Mesin OCR tidak bisa membaca bukti ini."} Isi formulir dari fotonya.`,
    });
  }
  const customerId = proof.transfer?.customerId;
  if (customerId && !proof.transfer?.outlet) {
    notices.push({
      tone: "warn",
      text: `ID Pangkalan ${customerId} tidak cocok dengan pangkalan agen ini. Pastikan transfernya memang untuk agen ini.`,
    });
  }
  return notices;
}

/** A proof the form can record from: read (or unreadable), and not used yet. */
export function isRecordable(proof: ReceiptExtraction): boolean {
  return (proof.processStatus === "ready" || proof.processStatus === "failed")
    && !proof.archived && proof.documentType !== "expense_receipt";
}
