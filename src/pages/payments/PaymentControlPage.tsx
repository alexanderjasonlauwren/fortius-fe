import { PageHeader } from "@/components/common/PageHeader";
import { PaymentControlBoard } from "@/features/distribution/components/PaymentControlBoard";

export function PaymentControlPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasi harian"
        title="Alokasi Dana Pengiriman"
        description="Periksa dana yang sudah terverifikasi untuk setiap titik sebelum armada berangkat, dan alokasikan atau lepas dana per pangkalan."
      />
      <PaymentControlBoard />
    </div>
  );
}
