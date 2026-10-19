/**
 * Files attached to a finance document -- the nota behind an expense, the
 * vendor's bill behind a purchase, the slip behind a receipt.
 *
 * Every call names the owner: `/attachments/{owner_type}/{owner_id}`. The
 * backend authorises against the owner's own permissions, and an
 * attachment is only reachable through the document it belongs to.
 */
import { apiClient, getOne, send, upload } from "@/lib/api";
import { PERMISSIONS, type Permission } from "@/features/rbac/permissions";

export type AttachmentOwnerType =
  | "invoice"
  | "credit_note"
  | "payment"
  | "purchase"
  | "expense"
  | "cash_voucher"
  | "journal"
  | "asset"
  | "void_request"
  | "payment_refund"
  | "delivery";

/** Who may see and who may add or remove the files on each kind of
 *  document -- the owner's own read and create permissions, mirroring the
 *  backend's controller/attachment/routes.go. */
export const ATTACHMENT_PERMISSIONS: Record<AttachmentOwnerType, { view: Permission; manage: Permission }> = {
  invoice: { view: PERMISSIONS.INVOICES_VIEW, manage: PERMISSIONS.INVOICES_CREATE },
  credit_note: { view: PERMISSIONS.CREDIT_NOTES_VIEW, manage: PERMISSIONS.CREDIT_NOTES_CREATE },
  payment: { view: PERMISSIONS.PAYMENTS_VIEW, manage: PERMISSIONS.PAYMENTS_CREATE },
  purchase: { view: PERMISSIONS.PURCHASES_VIEW, manage: PERMISSIONS.PURCHASES_CREATE },
  expense: { view: PERMISSIONS.EXPENSES_VIEW, manage: PERMISSIONS.EXPENSES_CREATE },
  cash_voucher: { view: PERMISSIONS.CASH_VOUCHERS_VIEW, manage: PERMISSIONS.CASH_VOUCHERS_CREATE },
  journal: { view: PERMISSIONS.JOURNALS_VIEW, manage: PERMISSIONS.JOURNALS_CREATE },
  asset: { view: PERMISSIONS.ASSETS_VIEW, manage: PERMISSIONS.ASSETS_CREATE },
  void_request: { view: PERMISSIONS.VOID_REQUESTS_VIEW, manage: PERMISSIONS.VOID_REQUESTS_CREATE },
  payment_refund: { view: PERMISSIONS.PAYMENT_REFUNDS_VIEW, manage: PERMISSIONS.PAYMENT_REFUNDS_CREATE },
  // A photo taken at the drop: the delivery module's own proof permissions.
  delivery: { view: PERMISSIONS.DELIVERY_PROOFS_VIEW, manage: PERMISSIONS.DELIVERY_PROOFS_CREATE },
};

/** What the backend accepts (core/storage contenttype.go, finance_attachment). */
export const ATTACHMENT_ACCEPT = "application/pdf,image/jpeg,image/png,image/webp,.xlsx,.xls";
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** A delivery's file is a photo (core/storage contenttype.go, delivery_proof). */
export const DELIVERY_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

export interface Attachment {
  id: string;
  namaFile: string;
  jenis: string;
  ukuran: number;
  diunggah: string;
}

interface AttachmentResponse {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

function toAttachment(row: AttachmentResponse): Attachment {
  return {
    id: row.id,
    namaFile: row.file_name,
    jenis: row.mime_type,
    ukuran: row.size_bytes,
    diunggah: row.created_at,
  };
}

const ownerPath = (type: AttachmentOwnerType, ownerId: string) => `/attachments/${type}/${ownerId}`;

export async function listAttachments(type: AttachmentOwnerType, ownerId: string): Promise<Attachment[]> {
  const rows = await getOne<AttachmentResponse[]>(ownerPath(type, ownerId));
  return (rows ?? []).map(toAttachment);
}

export async function uploadAttachment(type: AttachmentOwnerType, ownerId: string, file: File): Promise<Attachment> {
  return toAttachment(await upload<AttachmentResponse>(ownerPath(type, ownerId), file));
}

export async function deleteAttachment(type: AttachmentOwnerType, ownerId: string, attachmentId: string): Promise<void> {
  await send("delete", `${ownerPath(type, ownerId)}/${attachmentId}`);
}

/**
 * A short-lived link to the file's bytes. In development the backend
 * answers with a path on itself (`/internal/files?...`), which is resolved
 * against the API's origin; in production it is the bucket's own absolute
 * URL, which `new URL` leaves as it is.
 */
export async function attachmentDownloadUrl(
  type: AttachmentOwnerType, ownerId: string, attachmentId: string,
): Promise<string> {
  const { url } = await getOne<{ url: string }>(`${ownerPath(type, ownerId)}/${attachmentId}/download`);
  return new URL(url, apiClient.defaults.baseURL).href;
}
