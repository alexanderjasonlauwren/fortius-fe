import type { UserRole } from "@/types/auth";

export const ROLE_SUMMARY: Record<UserRole, string> = {
  admin: "Akses penuh, termasuk pengaturan sistem dan manajemen pengguna.",
  manager: "Menyetujui pesanan, mengonfirmasi rencana, dan membaca semua laporan.",
  finance: "Memverifikasi pembayaran, meninjau kwitansi, dan mengunduh laporan keuangan.",
  staff: "Menyusun rencana distribusi dan memperbarui status pengiriman.",
  viewer: "Hanya membaca. Tidak dapat mengubah data apa pun.",
  driver: "Akses lapangan: melihat rute dan memperbarui status pengiriman miliknya.",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manajer",
  finance: "Keuangan",
  staff: "Staf Operasional",
  viewer: "Peninjau",
  driver: "Sopir",
};
