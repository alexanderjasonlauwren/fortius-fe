import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import {
  getMonitoringSnapshot,
  printSuratJalan,
  setDeliveryStatus,
} from "../api/monitoringApi";
import { unitLabel } from "@/lib/lexicon";

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
    // right almost everywhere and nearly free against the mock, but this
    // screen polls every thirty seconds and draws a map whose rounds are
    // road-snapped through a router: one "Berangkat" press re-ran every one
    // of those requests, and against a real router that is N calls per click.
    invalidate: [[...scopeKey(), "monitoring-snapshot"]],
    errorTitle: "Gagal memperbarui surat jalan",
    // No invoice claim here: the service has no billing module behind this
    // board yet, and a toast promising one would be a promise the system
    // does not keep. Dropped from both builds rather than made conditional
    // on the data source, so the demo does not train anyone to expect it.
    success: (delivery) => ({
      title: `${delivery.kode} → ${delivery.status}`,
      description:
        delivery.status === "Selesai"
          ? `Realisasi ${delivery.realisasi.toLocaleString("id-ID")} ${unitLabel()} tercatat.`
          : undefined,
    }),
  });

  const printMutation = useDeskMutation({
    mutationFn: (deliveryId: string) => printSuratJalan(deliveryId),
    errorTitle: "Cetak surat jalan gagal",
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
  };
}
