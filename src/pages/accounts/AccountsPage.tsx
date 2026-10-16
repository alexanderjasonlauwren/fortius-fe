/**
 * Daftar Akun: the chart of accounts as its own page, each account opening
 * its transactions -- Jurnal's model. Was the "Bagan akun" tab of Buku
 * Besar (accounting parity P6).
 */
import { ChartOfAccountsPanel } from "@/features/finance/components/ChartOfAccountsPanel";
import { PageHeader } from "@/components/common/PageHeader";

export function AccountsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Daftar Akun"
        description="Bagan akun dengan saldo berjalan. Klik nama akun untuk melihat transaksinya di Buku Besar."
      />
      <ChartOfAccountsPanel />
    </div>
  );
}
