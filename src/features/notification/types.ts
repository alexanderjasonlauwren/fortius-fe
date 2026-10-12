import type {
  NotifChannel,
  NotificationSettings,
  ReminderRule,
  ReminderRuleKey,
} from "@/types/domain";
import { outletLabel } from "@/lib/lexicon";

export type { NotifChannel, NotificationSettings, ReminderRule, ReminderRuleKey };

export type NotificationType = "Pengingat" | "Alert" | "Sistem";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  /** ISO datetime — formatted relative to now at the point of display. */
  timestamp: string;
  isRead: boolean;
  /** Where "Buka" takes the reader. */
  href?: string;
  /** The rule that raised it, so the reader can go and change it. */
  rule?: ReminderRuleKey;
}

/** Describes each rule for the settings panel: what it watches and its unit. */
export interface RuleMeta {
  key: ReminderRuleKey;
  label: string;
  description: string;
  /** Label for the threshold field; omit when the rule has no threshold. */
  ambangLabel?: string;
  ambangSatuan?: string;
  ambangMin?: number;
  ambangMax?: number;
}

export const RULE_META: RuleMeta[] = [
  {
    key: "saExpiry",
    label: "Agreement mendekati kedaluwarsa",
    description:
      "Kuota yang tidak dijadwalkan akan hangus saat periode SA berakhir.",
    ambangLabel: "Peringatkan sebelum berakhir",
    ambangSatuan: "hari",
    ambangMin: 1,
    ambangMax: 30,
  },
  {
    key: "quotaLow",
    label: "Kuota SA hampir habis",
    description: "Sisa kuota tidak lagi cukup untuk rencana berikutnya.",
    ambangLabel: "Picu saat terpakai mencapai",
    ambangSatuan: "%",
    ambangMin: 50,
    ambangMax: 100,
  },
  {
    key: "stockLow",
    label: "Stok di bawah minimum",
    description: "Stok gudang turun di bawah ambang yang ditetapkan produk.",
    ambangLabel: "Picu di bawah",
    ambangSatuan: "% dari stok minimum",
    ambangMin: 10,
    ambangMax: 200,
  },
  {
    key: "paymentPending",
    label: "Pembayaran menunggu verifikasi",
    description: "Tagihan terbit yang belum diputuskan tim keuangan.",
    ambangLabel: "Ingatkan setelah",
    ambangSatuan: "hari",
    ambangMin: 1,
    ambangMax: 14,
  },
  {
    key: "deliveryDelay",
    label: "Keterlambatan pengiriman",
    description: "Surat jalan belum berangkat melewati jam yang dijadwalkan.",
    ambangLabel: "Toleransi keterlambatan",
    ambangSatuan: "menit",
    ambangMin: 15,
    ambangMax: 240,
  },
  {
    key: "planUnconfirmed",
    label: "Rencana besok belum dikonfirmasi",
    description: "Armada tidak dapat berangkat sebelum rencana dikonfirmasi.",
    ambangLabel: "Ingatkan pada pukul",
    ambangSatuan: "(jam, 0–23)",
    ambangMin: 0,
    ambangMax: 23,
  },
  {
    key: "orderPending",
    label: "Pesanan menumpuk",
    description: `Pesanan ${outletLabel()} yang belum disetujui menumpuk di antrian.`,
    ambangLabel: "Picu saat lebih dari",
    ambangSatuan: "pesanan",
    ambangMin: 1,
    ambangMax: 50,
  },
];

export const CHANNEL_LABEL: Record<NotifChannel, string> = {
  app: "Dalam aplikasi",
  whatsapp: "WhatsApp",
  email: "Email",
};
