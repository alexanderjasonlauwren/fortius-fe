import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api";
import { useToast } from "@/hooks/useToast";
import type { ToastOptions } from "@/components/ui/toast-context";

/**
 * Every write in the console goes through here.
 *
 * Because all feature APIs read one shared store, a successful write can
 * invalidate everything: verifying a payment changes the finance page, the
 * dashboard's pending count, and the notification bell at once. It also gives
 * every action the same confirmation and failure voice.
 *
 * # Why invalidating everything is still the default
 *
 * It is correct and it is nearly free against the mock, where a refetch is a
 * read of an in-memory store. Narrowing it globally would be a silent
 * regression across twenty screens that rely on the broad sweep -- a payment
 * verified on one page would stop updating the bell on another, and nobody
 * would notice until someone complained about a stale number.
 *
 * `invalidate` is the opt-out, for the one screen where the sweep is
 * genuinely expensive: the monitoring board polls every thirty seconds and
 * draws a Leaflet map whose rounds are road-snapped through a router, so one
 * "Berangkat" press re-runs every one of those requests. Pass the keys that
 * actually changed there, and leave the default everywhere else.
 */
export function useDeskMutation<TArgs, TResult>({
  mutationFn,
  success,
  errorTitle = "Tindakan gagal",
  onDone,
  onFail,
  invalidate,
}: {
  mutationFn: (args: TArgs) => Promise<TResult>;
  /** Confirmation copy. Use the past tense of the button that triggered it. */
  success?: string | ((result: TResult, args: TArgs) => ToastOptions);
  errorTitle?: string;
  onDone?: (result: TResult, args: TArgs) => void;
  onFail?: (error: Error, args: TArgs) => void;
  /**
   * The query keys this write actually affects. Omitted, everything is
   * invalidated -- see the note above before narrowing anything.
   */
  invalidate?: readonly unknown[][];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<TResult, Error, TArgs>({
    mutationFn,
    onSuccess: (result, args) => {
      if (invalidate) {
        for (const queryKey of invalidate) {
          void queryClient.invalidateQueries({ queryKey });
        }
      } else {
        void queryClient.invalidateQueries();
      }
      if (typeof success === "string") {
        toast({ title: success, tone: "success" });
      } else if (success) {
        toast({ tone: "success", ...success(result, args) });
      }
      onDone?.(result, args);
    },
    onError: (error, args) => {
      toast({
        title: errorTitle,
        description: describeFailure(error),
        tone: "error",
      });
      onFail?.(error, args);
    },
  });
}

/**
 * Refusals every form can meet, said the way the person at the desk needs to
 * hear them -- the server's own message is written for a developer. Keyed by
 * the stable code, never the message (accounting parity P7).
 */
const FRIENDLY: Record<string, string> = {
  PERIOD_CLOSED:
    "Periode ini sudah ditutup. Gunakan tanggal di bulan yang masih terbuka, atau minta tim keuangan membukanya kembali di Tutup Buku.",
  PERIOD_IN_REVIEW:
    "Periode ini sedang ditinjau. Sampai selesai, hanya tim keuangan yang bisa mencatat transaksi di bulan ini.",
  USE_STOCK_COUNT: "Akun ini memegang stok produk. Koreksi lewat stok opname per produk di menu Persediaan.",
  VOID_APPROVAL_REQUIRED: "Pembatalan dokumen yang sudah dijurnal harus diajukan dan disetujui. Gunakan Ajukan pembatalan.",
  OWN_REQUEST: "Pengajuan Anda sendiri harus disetujui orang lain.",
  EVIDENCE_REQUIRED: "Lampirkan bukti (mis. mutasi rekening) sebelum pengajuan ini disetujui.",
  VOID_ALREADY_REQUESTED: "Dokumen ini sudah punya pengajuan pembatalan yang menunggu persetujuan.",
  REQUEST_DECIDED: "Pengajuan ini sudah diputuskan orang lain. Muat ulang halaman.",
  REFUND_EXCEEDS_AVAILABLE: "Jumlah melebihi sisa penerimaan yang belum dialokasikan atau dikembalikan.",
  PAYMENT_NOT_VERIFIED: "Hanya penerimaan yang sudah diverifikasi yang bisa dikembalikan.",
  PAYMENT_REFUNDED:
    "Penerimaan ini punya pengembalian dana yang diajukan atau disetujui. Selesaikan pengembalian itu dulu.",
  CONTAINER_NOT_TRADED: "Tabung kosong hanya dihitung jumlahnya; tidak dibeli atau dijual.",
};

/**
 * What to put under the error title.
 *
 * A 422 from the service says "The request failed validation" and carries the
 * fields that failed in `details` — which `ApiError` already parses and nothing
 * was reading. So the console showed a sentence the operator could not act on:
 * a missing outlet code and a malformed phone number were the same message,
 * with nothing to say which field to look at.
 *
 * The field names are the wire's (`code`, `phone`), not the form's. Translating
 * them here would need a map per form that drifts the first time a field is
 * renamed; naming the field the server named is worse copy and better help.
 */
export function describeFailure(error: Error): string {
  if (error instanceof ApiError && FRIENDLY[error.code]) {
    return FRIENDLY[error.code];
  }
  if (!(error instanceof ApiError) || error.violations.length === 0) {
    return error.message;
  }
  const fields = error.violations
    .map((v) => (v.message ? `${v.field}: ${v.message}` : v.field))
    .join(" · ");
  return `${error.message}: ${fields}`;
}
