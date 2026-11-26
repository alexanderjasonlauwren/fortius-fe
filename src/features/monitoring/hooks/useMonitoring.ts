import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import {
  bookReturn,
  closeRun,
  getMonitoringSnapshot,
  printSuratJalan,
  redeliver,
  setDeliveryStatus,
} from "../api/monitoringApi";
import { unitLabel } from "@/lib/lexicon";
import { formatDateId, formatNumber } from "@/lib/format";

function todayStr() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function useMonitoring() {
  const [dateRange, setDateRange] = useState({ from: todayStr(), to: todayStr() });
  const [driverFilter, setDriverFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("Semua");

  const snapshot = useQuery({
    queryKey: [...scopeKey(), "monitoring-snapshot", dateRange],
    queryFn: () => getMonitoringSnapshot(dateRange),
    // The board is the one screen people leave open, so it refreshes itself.
    refetchInterval: 30_000,
  });

  const statusMutation = useDeskMutation({
    mutationFn: setDeliveryStatus,
    // Just this board, not every query in the console. The default sweep is
    // right almost everywhere, but this
    // screen polls every thirty seconds and draws a map whose rounds are
    // road-snapped through a router: one "Berangkat" press re-ran every one
    // of those requests, and against a real router that is N calls per click.
    invalidate: [[...scopeKey(), "monitoring-snapshot"]],
    errorTitle: "Gagal memperbarui surat jalan",
    // No invoice claim here: completing a drop does not raise one (the
    // invoice is raised at dispatch), so the toast promises nothing.
    success: (delivery) => ({
      title: `${delivery.kode} → ${delivery.status}`,
      description:
        delivery.status === "Selesai"
          ? `Realisasi ${formatNumber(delivery.realisasi)} ${unitLabel()} tercatat.`
          : undefined,
    }),
  });

  const printMutation = useDeskMutation({
    mutationFn: (deliveryId: string) => printSuratJalan(deliveryId),
    errorTitle: "Cetak surat jalan gagal",
  });

  // Closing a run corrects invoices, credit notes, deposits and stock, so it
  // keeps the default sweep: the finance screens must not show the
  // pre-close figures.
  const closeRunMutation = useDeskMutation({
    mutationFn: closeRun,
    errorTitle: "Rit gagal ditutup",
  });

  const bookReturnMutation = useDeskMutation({
    mutationFn: bookReturn,
    errorTitle: "Koreksi tagihan gagal",
    success: (result) => ({
      title: result.sudahDibukukan
        ? "Koreksi tagihan sudah tercatat"
        : `Nota kredit ${result.notaKredit ?? ""} terbit`,
    }),
  });

  // A new plan line, so the planning screens refresh too: the default sweep.
  const redeliverMutation = useDeskMutation({
    mutationFn: redeliver,
    errorTitle: "Kirim ulang gagal",
    success: (result) => ({
      title: `${formatNumber(result.jumlah)} ${unitLabel()} dijadwalkan ulang`,
      description: `${result.rencanaBaru ? "Rencana baru" : "Masuk ke rencana"} ${result.rencana}, ${formatDateId(result.tanggal)}. Konfirmasi rencananya agar dapat dikirim.`,
    }),
  });

  const rows = (snapshot.data?.rows ?? []).filter((r) => {
    if (driverFilter && r.driverId !== driverFilter) return false;
    if (statusFilter !== "Semua" && r.status !== statusFilter) return false;
    return true;
  });

  return {
    driverCards: snapshot.data?.drivers ?? [],
    monitoringTable: rows,
    allRows: snapshot.data?.rows ?? [],
    assignments: snapshot.data?.assignments ?? [],
    runs: snapshot.data?.runs ?? [],
    totals: snapshot.data?.totals,
    lastSyncAt: snapshot.data?.lastSyncAt,
    isLoading: snapshot.isLoading,
    isFetching: snapshot.isFetching,
    isError: snapshot.isError,
    error: snapshot.error as Error | null,
    refetch: snapshot.refetch,
    dateRange,
    setDateRange,
    driverFilter,
    setDriverFilter,
    statusFilter,
    setStatusFilter,
    statusMutation,
    printMutation,
    closeRunMutation,
    bookReturnMutation,
    redeliverMutation,
  };
}
