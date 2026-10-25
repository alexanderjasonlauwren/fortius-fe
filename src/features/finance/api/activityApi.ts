/**
 * A finance document's "Riwayat": what was applied against it and every
 * journal it posted (`GET /activity/{owner_type}/{owner_id}`, accounting
 * parity P3). Readable by whoever may read the document itself.
 */
import { getOne } from "@/lib/api";

export type ActivityOwnerType = "invoice" | "payment" | "credit_note" | "purchase" | "expense" | "cash_voucher";

export interface ActivitySettlement {
  jenis: "receipt" | "credit_note" | "invoice" | "purchase_payment";
  id: string;
  nomor: string;
  tanggal: string;
  status: string;
  jumlah: number;
}

export interface ActivityJournal {
  id: string;
  nomor: string;
  tanggal: string;
  keterangan: string;
  dibalik: boolean;
  pembalik: boolean;
  jumlah: number;
}

export interface DocumentActivity {
  penyelesaian: ActivitySettlement[];
  jurnal: ActivityJournal[];
}

interface ActivityResponse {
  settlements: { kind: ActivitySettlement["jenis"]; id: string; number: string; date: string; status: string; amount: number }[];
  journals: { id: string; number: string; date: string; description: string; status: string; is_reversal: boolean; amount: number }[];
}

export async function getActivity(type: ActivityOwnerType, id: string): Promise<DocumentActivity> {
  const row = await getOne<ActivityResponse>(`/activity/${type}/${id}`);
  return {
    penyelesaian: row.settlements.map((s) => ({
      jenis: s.kind, id: s.id, nomor: s.number, tanggal: s.date.slice(0, 10), status: s.status, jumlah: s.amount,
    })),
    jurnal: row.journals.map((j) => ({
      id: j.id, nomor: j.number, tanggal: j.date.slice(0, 10), keterangan: j.description,
      dibalik: j.status === "reversed", pembalik: j.is_reversal, jumlah: j.amount,
    })),
  };
}
