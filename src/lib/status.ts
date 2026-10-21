/**
 * Status vocabulary for the whole console.
 *
 * Four states carry every domain: settled (pine), in progress (amber),
 * blocked (rust), and not yet committed (grey). Everything that shows state —
 * badges, table row spines, map pins, chart marks — resolves through here, so a
 * status looks the same wherever it appears.
 *
 * Kept apart from the badge component so fast refresh works on both.
 */

export type StatusVariant =
  | "success"
  | "warning"
  | "danger"
  | "draft"
  | "info"
  | "process";

/** Bare colour for spines, dots, and map pins. */
export const statusColorClass: Record<StatusVariant, string> = {
  success: "text-pine",
  warning: "text-signal",
  process: "text-signal",
  danger: "text-rust",
  draft: "text-draft",
  info: "text-ink-muted",
};

/** Hex equivalents, for canvas/SVG contexts that cannot use classes. */
export const STATUS_HEX: Record<StatusVariant, string> = {
  success: "#2E6A55",
  warning: "#E0A32E",
  process: "#E0A32E",
  danger: "#B03F27",
  draft: "#8A8F84",
  info: "#676B62",
};

const STATUS_MAP: Record<string, StatusVariant> = {
  // settled
  Selesai: "success",
  Aktif: "success",
  Terkonfirmasi: "success",
  Terverifikasi: "success",
  Tervalidasi: "success",
  Lunas: "success",
  Tercapai: "success",

  // in progress
  Proses: "process",
  "Dalam Proses": "process",
  "Dalam Pengiriman": "process",
  "Dalam Perjalanan": "process",
  "Bongkar Muat": "process",
  Perjalanan: "process",
  Loading: "warning",
  Antrian: "warning",
  Limit: "warning",
  Menunggu: "warning",
  "Menunggu Verifikasi": "warning",
  "Menunggu Diperiksa": "warning",
  // Expenses awaiting sign-off (and bills/receipts the same way).
  "Menunggu persetujuan": "warning",
  Pending: "warning",
  Baru: "warning",
  Disetujui: "process",
  Dijadwalkan: "process",
  Diserahkan: "process",
  "Sedang Ditinjau": "process",
  // Kas & Bank (gap-closing phase, Phase B): a posted voucher/journal, and
  // a bank statement line already linked to one.
  Diposting: "success",
  Cocok: "success",
  "Belum Dicocokkan": "warning",

  // blocked
  Tertunda: "danger",
  Ditolak: "danger",
  "Belum Lunas": "danger",
  Belum: "danger",
  Nonaktif: "danger",
  Ditangguhkan: "danger",
  Terlambat: "danger",

  // uncommitted
  Draf: "draft",
  Batal: "draft",
  Dibatalkan: "draft",
  // An expense withdrawn by whoever filed it, before any decision.
  Ditarik: "draft",
  Diabaikan: "draft",
  Standby: "draft",
  Cuti: "draft",
  Diundang: "draft",

  Info: "info",
};

export function getStatusVariant(status: string): StatusVariant {
  if (STATUS_MAP[status]) return STATUS_MAP[status];
  const match = Object.keys(STATUS_MAP).find(
    (key) => key.toLowerCase() === status?.toLowerCase(),
  );
  return match ? STATUS_MAP[match] : "draft";
}

/** Convenience for the docket spine on a table row or list item. */
export function spineFor(status: string): string {
  return statusColorClass[getStatusVariant(status)];
}
