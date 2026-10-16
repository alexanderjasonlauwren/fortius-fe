/**
 * Tutup Buku: closing and reopening a fiscal year. Was a tab of Buku Besar
 * (accounting parity P6); the monthly lock joins it in P7.
 */
import { FiscalYearSection } from "@/features/fiscalyears/components/FiscalYearSection";
import { PageHeader } from "@/components/common/PageHeader";

export function FiscalYearsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Tutup Buku"
        description="Menutup tahun buku memindahkan laba rugi tahun itu ke Laba Ditahan; tahun yang sudah ditutup bisa dibuka kembali."
      />
      <FiscalYearSection />
    </div>
  );
}
