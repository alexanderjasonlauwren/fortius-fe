/**
 * One voucher as the bookkeeper checks it: its lines with their memos, who
 * it was with, its reference, its evidence -- and what can be done with it
 * from here (accounting parity P3).
 */
import { useQuery } from "@tanstack/react-query";
import { Copy, Pencil, Send, Trash2, X } from "lucide-react";
import { getCashVoucher, type CashVoucher } from "@/features/cashvouchers/api/cashVoucherApi";
import { Skeleton } from "@/components/common/Panel";
import { scopeKey } from "@/lib/scope";
import { VOUCHER_STATUS_LABEL, VOUCHER_TYPE_LABEL, voucherParty } from "@/features/cashvouchers/lib/labels";
import { AttachmentsPanel } from "@/features/attachments/components/AttachmentsPanel";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStatusVariant } from "@/lib/status";
import { formatDateId, formatRupiah } from "@/lib/format";

interface Props {
  voucher: CashVoucher | null;
  onClose: () => void;
  onEdit: (v: CashVoucher) => void;
  onPost: (v: CashVoucher) => void;
  onDelete: (v: CashVoucher) => void;
  onDuplicate: (v: CashVoucher) => void;
  onVoid: (v: CashVoucher) => void;
  posting: boolean;
}

export function VoucherDetailDialog({ voucher: summary, onClose, onEdit, onPost, onDelete, onDuplicate, onVoid, posting }: Props) {
  // The list carries no lines; the voucher itself does. Edit and duplicate
  // are handed the full voucher, so they start from its lines too.
  const full = useQuery({
    queryKey: [...scopeKey(), "cash-bank", "voucher", summary?.id],
    queryFn: () => getCashVoucher(summary!.id),
    enabled: !!summary,
  });
  if (!summary) return null;
  const v = full.data ?? summary;
  const loaded = !!full.data;
  const party = voucherParty(v);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="data">{v.voucherNumber}</span>
            <StatusBadge label={VOUCHER_STATUS_LABEL[v.status]} variant={getStatusVariant(VOUCHER_STATUS_LABEL[v.status])} />
          </DialogTitle>
          <DialogDescription>
            {VOUCHER_TYPE_LABEL[v.voucherType]} · {formatDateId(v.voucherDate)} · {v.branchName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Meta label={v.voucherType === "transfer" ? "Dari → ke" : "Akun kas/bank"}
              value={`${v.bankAccountLabel}${v.counterBankAccountLabel ? ` → ${v.counterBankAccountLabel}` : ""}`} />
            <Meta label="No. referensi" value={v.referenceNumber ?? "—"} mono />
            <Meta label={v.supplierName ? "Vendor" : v.outletName ? "Pangkalan" : "Pihak terkait"} value={party ?? "—"} />
          </dl>

          {v.voucherType !== "transfer" && !loaded && <Skeleton className="h-20 w-full" />}
          {v.voucherType !== "transfer" && loaded && (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="label py-2 text-2xs text-ink-muted">Akun</th>
                  <th className="label py-2 text-2xs text-ink-muted">Keterangan</th>
                  <th className="label py-2 text-right text-2xs text-ink-muted">Nilai</th>
                </tr>
              </thead>
              <tbody>
                {v.lines.map((l, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className="py-2 text-sm text-ink"><span className="data text-xs">{l.accountCode}</span> {l.accountName}</td>
                    <td className="py-2 text-xs text-ink-muted">{l.memo ?? "—"}</td>
                    <td className="data py-2 text-right text-sm text-ink">{formatRupiah(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-right text-sm">
            Total <span className="data ml-2 font-semibold text-ink">{formatRupiah(v.totalAmount)}</span>
          </p>
          {v.description && <p className="text-sm text-ink-muted">{v.description}</p>}
          {v.status === "void" && v.voidReason && (
            <p className="text-sm text-rust-ink">Dibatalkan: {v.voidReason}</p>
          )}
          <AttachmentsPanel ownerType="cash_voucher" ownerId={v.id} />
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <CanAccess permission={PERMISSIONS.CASH_VOUCHERS_CREATE}>
            <Button type="button" variant="outline" size="sm" disabled={!loaded} onClick={() => onDuplicate(v)}>
              <Copy className="h-3.5 w-3.5" /> Duplikat
            </Button>
          </CanAccess>
          <div className="flex flex-wrap gap-2">
            {v.status === "draft" && (
              <>
                <CanAccess permission={PERMISSIONS.CASH_VOUCHERS_UPDATE}>
                  <Button type="button" variant="ghost" size="sm" className="text-rust-ink" onClick={() => onDelete(v)}>
                    <Trash2 className="h-3.5 w-3.5" /> Hapus draft
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={!loaded} onClick={() => onEdit(v)}>
                    <Pencil className="h-3.5 w-3.5" /> Ubah
                  </Button>
                </CanAccess>
                <CanAccess permission={PERMISSIONS.CASH_VOUCHERS_APPROVE}>
                  <Button type="button" size="sm" disabled={posting} onClick={() => onPost(v)}>
                    <Send className="h-3.5 w-3.5" /> Posting
                  </Button>
                </CanAccess>
              </>
            )}
            {v.status === "posted" && (
              <CanAccess permissions={[PERMISSIONS.CASH_VOUCHERS_APPROVE, PERMISSIONS.VOID_REQUESTS_CREATE]} requireAll>
                <Button type="button" variant="ghost" size="sm" className="text-rust-ink" onClick={() => onVoid(v)}>
                  <X className="h-3.5 w-3.5" /> Ajukan pembatalan
                </Button>
              </CanAccess>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="label text-2xs text-ink-muted">{label}</dt>
      <dd className={mono ? "data mt-0.5 text-ink" : "mt-0.5 text-ink"}>{value}</dd>
    </div>
  );
}
