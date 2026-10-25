/**
 * Lampiran: the evidence behind one finance document, and the place to add
 * it. One component for every document type (accounting parity P2) -- each
 * form mounts it with its own owner, so attaching a nota works the same on
 * an expense as on a purchase or a journal.
 */
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { scopeKey } from "@/lib/scope";
import { formatDateTimeId, formatNumber } from "@/lib/format";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { useToast } from "@/hooks/useToast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/common/Panel";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_PERMISSIONS,
  attachmentDownloadUrl,
  deleteAttachment,
  listAttachments,
  uploadAttachment,
  type Attachment,
  type AttachmentOwnerType,
} from "../api/attachmentApi";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${formatNumber(Math.round((bytes / (1024 * 1024)) * 10) / 10)} MB`;
  return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

export interface AttachmentsPanelProps {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  /** Shows the files without add or remove -- the evidence of a decided
   *  void or refund request, which the database keeps as it was. */
  readOnly?: boolean;
}

export function AttachmentsPanel({ ownerType, ownerId, readOnly = false }: AttachmentsPanelProps) {
  const { toast } = useToast();
  const mayManage = useAuthStore((s) => s.hasPermission(ATTACHMENT_PERMISSIONS[ownerType].manage));
  const canManage = mayManage && !readOnly;
  const input = useRef<HTMLInputElement>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const queryKey = [...scopeKey(), "attachments", ownerType, ownerId];

  const files = useQuery({ queryKey, queryFn: () => listAttachments(ownerType, ownerId) });

  const add = useDeskMutation({
    mutationFn: (file: File) => uploadAttachment(ownerType, ownerId, file),
    success: (row) => ({ title: "Lampiran ditambahkan", description: row.namaFile }),
    errorTitle: "Lampiran gagal diunggah",
    invalidate: [queryKey],
  });
  const remove = useDeskMutation({
    mutationFn: (row: Attachment) => deleteAttachment(ownerType, ownerId, row.id),
    success: (_, row) => ({ title: "Lampiran dilepas", description: row.namaFile }),
    errorTitle: "Lampiran gagal dilepas",
    invalidate: [queryKey],
  });

  function pick(file: File | undefined) {
    if (!file) return;
    if (file.size > ATTACHMENT_MAX_BYTES) {
      toast({ title: "Lampiran terlalu besar", description: "Maksimal 10 MB per file.", tone: "error" });
      return;
    }
    add.mutate(file);
  }

  async function open(row: Attachment) {
    // Opened before the await so the browser treats it as the click's own
    // window rather than a pop-up.
    const tab = window.open("", "_blank");
    setOpening(row.id);
    try {
      const url = await attachmentDownloadUrl(ownerType, ownerId, row.id);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch (error) {
      tab?.close();
      toast({
        title: "Lampiran tidak dapat dibuka",
        description: error instanceof Error ? error.message : String(error),
        tone: "error",
      });
    } finally {
      setOpening(null);
    }
  }

  const rows = files.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="label flex items-center gap-1.5 text-2xs text-ink-muted">
          <Paperclip className="h-3.5 w-3.5" /> Lampiran
        </p>
        {canManage && (
          <>
            <input
              ref={input}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              aria-label="Pilih file lampiran"
              onChange={(e) => {
                pick(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button
              type="button" size="xs" variant="outline"
              disabled={add.isPending}
              onClick={() => input.current?.click()}
            >
              <Upload /> {add.isPending ? "Mengunggah…" : "Tambah lampiran"}
            </Button>
          </>
        )}
      </div>

      {files.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : files.isError ? (
        <p className="text-xs text-rust-ink">Lampiran tidak dapat dimuat.</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-ink-muted">
          Belum ada lampiran. Unggah nota, bukti transfer, atau tagihan vendor (PDF, JPG, PNG, Excel; maks. 10 MB).
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-ink-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink" title={row.namaFile}>{row.namaFile}</p>
                <p className="data text-2xs text-ink-muted">
                  {formatSize(row.ukuran)} · {formatDateTimeId(row.diunggah)}
                </p>
              </div>
              <Button
                type="button" variant="ghost" size="icon-xs"
                aria-label={`Buka ${row.namaFile}`}
                disabled={opening === row.id}
                onClick={() => void open(row)}
              >
                <Download />
              </Button>
              {canManage && (
                <Button
                  type="button" variant="ghost" size="icon-xs"
                  aria-label={`Lepas ${row.namaFile}`}
                  className="hover:bg-rust-soft hover:text-rust-ink"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(row)}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
