import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import {
  activateSA,
  deleteSA,
  getSAList,
  getSupplierOptions,
  printSA,
  uploadSA,
} from "../api/saApi";
import type { SAFilterParams, UploadSAPayload } from "../types";
import { unitLabel } from "@/lib/lexicon";

export function useScheduleAgreement() {
  const [filters, setFilters] = useState<SAFilterParams>({});

  const saList = useQuery({
    queryKey: [...scopeKey(), "sa-list", filters],
    queryFn: () => getSAList(filters),
  });

  const supplierOptions = useQuery({
    queryKey: [...scopeKey(), "supplier-options"],
    queryFn: getSupplierOptions,
  });

  const uploadMutation = useDeskMutation({
    mutationFn: (payload: UploadSAPayload) => uploadSA(payload),
    errorTitle: "Unggah SA gagal",
    success: (sa) => ({
      title: `${sa.nomorSA} diunggah`,
      description: `${sa.totalKuota.toLocaleString("id-ID")} ${unitLabel()} tercatat sebagai draf. Aktifkan agar bisa dipakai untuk perencanaan.`,
    }),
  });

  const activateMutation = useDeskMutation({
    mutationFn: (saId: string) => activateSA(saId),
    errorTitle: "Aktivasi gagal",
    success: (sa) => ({
      title: `${sa.nomorSA} aktif`,
      description: "Kuota siap ditarik oleh rencana distribusi.",
    }),
  });

  const deleteMutation = useDeskMutation({
    mutationFn: (saId: string) => deleteSA(saId),
    errorTitle: "Hapus SA gagal",
    success: "SA dihapus",
  });

  const printMutation = useDeskMutation({
    mutationFn: (saId: string) => printSA(saId),
    errorTitle: "Cetak gagal",
  });

  return {
    saList: saList.data ?? [],
    isLoading: saList.isLoading,
    isError: saList.isError,
    error: saList.error as Error | null,
    refetch: saList.refetch,
    supplierOptions: supplierOptions.data ?? [],
    filters,
    setFilters,
    uploadMutation,
    activateMutation,
    deleteMutation,
    printMutation,
  };
}
