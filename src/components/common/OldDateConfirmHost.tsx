import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { answerOldDate, useOldDateConfirmation } from "@/lib/oldDateConfirmation";

/** Renders the old-date question once, for the whole console. */
export function OldDateConfirmHost() {
  const pending = useOldDateConfirmation((state) => state.pending);
  return (
    <ConfirmDialog
      isOpen={!!pending}
      title="Tanggal ini sudah lama"
      message={pending?.message ?? ""}
      details="Periksa tahunnya. Bila tanggalnya memang benar, simpan tetap dengan tanggal ini."
      confirmLabel="Ya, tanggalnya benar"
      cancelLabel="Ubah tanggal"
      onConfirm={() => answerOldDate(true)}
      onCancel={() => answerOldDate(false)}
    />
  );
}
