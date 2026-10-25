/**
 * Persetujuan (client answer 5, 2026-10-18): every void and every refund of
 * an overpaid receipt waits here for a second person. The approver reads the
 * reason, opens the evidence, and approves -- the void or the refund posts in
 * that moment -- or rejects with a reason. Nobody approves their own
 * request, and nothing is approved without evidence; the backend holds both
 * rules, and this page only says so before the click.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, ExternalLink } from "lucide-react";
import {
  decideRefund, decideVoid, DOCUMENT_TYPE_LABEL, listRefunds, listVoidRequests, STATUS_LABEL,
  type Refund, type RequestStatus, type VoidRequest,
} from "@/features/approvals/api/approvalsApi";
import { AttachmentsPanel } from "@/features/attachments/components/AttachmentsPanel";
import { useAuthStore } from "@/features/auth/store/authStore";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Field, SegmentedControl, TextareaInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatDateId, formatDateTimeId, formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";
import type { StatusVariant } from "@/lib/status";

type Tab = "void" | "refund";
type Filter = RequestStatus | "all";

const STATUS_VARIANT: Record<RequestStatus, StatusVariant> = {
  pending: "warning", approved: "success", rejected: "danger", cancelled: "draft",
};

/** Where the voided document is worked on. */
function documentLink(r: VoidRequest): string {
  switch (r.documentType) {
    case "invoice": return `/receivables/${r.documentId}`;
    case "purchase": return `/purchases/${r.documentId}`;
    case "purchase_payment": return `/purchases/${r.parentId}`;
    case "expense": return "/expenses";
    case "cash_voucher": return "/cash-bank";
    case "depreciation_run": return "/assets?tab=penyusutan";
    case "payment": return "/payments";
    case "credit_note": return "/receivables?tab=nota-kredit";
  }
}

type Selected = { kind: "void"; row: VoidRequest } | { kind: "refund"; row: Refund };

export function ApprovalsPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const seesRefunds = hasPermission(PERMISSIONS.PAYMENT_REFUNDS_VIEW);
  const [tab, setTab] = useState<Tab>("void");
  const [filter, setFilter] = useState<Filter>("pending");
  const [selected, setSelected] = useState<Selected | null>(null);
  const status = filter === "all" ? undefined : filter;

  const voids = useQuery({
    queryKey: [...scopeKey(), "void-requests", filter],
    queryFn: () => listVoidRequests({ status }),
    enabled: tab === "void",
  });
  const refunds = useQuery({
    queryKey: [...scopeKey(), "payment-refunds", filter],
    queryFn: () => listRefunds({ status }),
    enabled: tab === "refund" && seesRefunds,
  });

  const statusCell = (s: RequestStatus) => <StatusBadge label={STATUS_LABEL[s]} variant={STATUS_VARIANT[s]} />;
  const asked = (r: { requestedBy?: string; requestedAt: string; requestedByMe: boolean }) => (
    <>
      <span className="block text-xs text-ink">{r.requestedByMe ? "Anda" : r.requestedBy ?? "—"}</span>
      <span className="data block text-2xs text-ink-muted">{formatDateTimeId(r.requestedAt)}</span>
    </>
  );

  const voidColumns: Column<VoidRequest>[] = [
    {
      key: "doc", header: "Dokumen",
      render: (r) => (
        <>
          <span className="data block text-xs text-ink">{r.documentNumber}</span>
          <span className="block text-2xs text-ink-muted">{DOCUMENT_TYPE_LABEL[r.documentType]}</span>
        </>
      ),
    },
    { key: "reason", header: "Alasan", render: (r) => <span className="line-clamp-2 max-w-sm text-xs text-ink">{r.reason}</span> },
    { key: "asked", header: "Diajukan", render: asked, sortValue: (r) => r.requestedAt },
    { key: "evidence", header: "Bukti", align: "right", render: (r) => <span className="data text-xs">{r.evidenceCount}</span> },
    { key: "status", header: "Status", render: (r) => statusCell(r.status) },
    {
      key: "open", header: "", align: "right", width: "1%",
      render: (r) => <Button size="xs" variant="outline" onClick={() => setSelected({ kind: "void", row: r })}>Buka</Button>,
    },
  ];

  const refundColumns: Column<Refund>[] = [
    {
      key: "doc", header: "Pengembalian",
      render: (r) => (
        <>
          <span className="data block text-xs text-ink">{r.refundNumber}</span>
          <span className="block text-2xs text-ink-muted">{r.outletName} · {r.paymentNumber}</span>
        </>
      ),
    },
    { key: "amount", header: "Jumlah", align: "right", render: (r) => <span className="data text-sm text-ink">{formatRupiah(r.amount)}</span>, sortValue: (r) => r.amount },
    { key: "reason", header: "Alasan", render: (r) => <span className="line-clamp-2 max-w-xs text-xs text-ink">{r.reason}</span> },
    { key: "asked", header: "Diajukan", render: asked, sortValue: (r) => r.requestedAt },
    { key: "evidence", header: "Bukti", align: "right", render: (r) => <span className="data text-xs">{r.evidenceCount}</span> },
    { key: "status", header: "Status", render: (r) => statusCell(r.status) },
    {
      key: "open", header: "", align: "right", width: "1%",
      render: (r) => <Button size="xs" variant="outline" onClick={() => setSelected({ kind: "refund", row: r })}>Buka</Button>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Persetujuan"
        description="Pembatalan dokumen dan pengembalian dana menunggu persetujuan orang kedua. Disetujui berarti langsung dijurnal; ditolak berarti dokumen tidak berubah."
        meta={
          <div className="flex flex-wrap items-center gap-2">
            {seesRefunds && (
              <SegmentedControl<Tab> value={tab} onChange={setTab}
                options={[{ value: "void", label: "Pembatalan" }, { value: "refund", label: "Pengembalian dana" }]} />
            )}
            <SegmentedControl<Filter> value={filter} onChange={setFilter}
              options={[
                { value: "pending", label: "Menunggu" }, { value: "approved", label: "Disetujui" },
                { value: "rejected", label: "Ditolak" }, { value: "all", label: "Semua" },
              ]} />
          </div>
        }
      />
      <Panel>
        {tab === "void" ? (
          <DataTable columns={voidColumns} data={voids.data ?? []} isLoading={voids.isLoading}
            rowKey={(r) => r.id} pageSize={20} emptyIcon={ClipboardCheck}
            emptyMessage="Tidak ada pengajuan pembatalan"
            emptyDescription="Pembatalan diajukan dari halaman dokumennya dengan tombol Ajukan pembatalan." dense />
        ) : (
          <DataTable columns={refundColumns} data={refunds.data ?? []} isLoading={refunds.isLoading}
            rowKey={(r) => r.id} pageSize={20} emptyIcon={ClipboardCheck}
            emptyMessage="Tidak ada pengembalian dana"
            emptyDescription="Pengembalian diajukan dari Penerimaan Kas untuk penerimaan yang masuk ganda." dense />
        )}
      </Panel>
      <DecisionDialog selected={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DecisionDialog({ selected, onClose }: { selected: Selected | null; onClose: () => void }) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const [note, setNote] = useState("");
  const row = selected?.row;
  const isVoid = selected?.kind === "void";
  const mayDecide = hasPermission(isVoid ? PERMISSIONS.VOID_REQUESTS_APPROVE : PERMISSIONS.PAYMENT_REFUNDS_APPROVE);
  const pending = row?.status === "pending";

  const decide = useDeskMutation({
    mutationFn: async (action: "approve" | "reject" | "cancel"): Promise<void> => {
      const input = { version: row!.version, note };
      if (isVoid) await decideVoid(row!.id, action, input);
      else await decideRefund(row!.id, action, input);
    },
    errorTitle: "Keputusan tidak tersimpan",
    success: (_, action) => ({
      title: action === "approve" ? "Disetujui" : action === "reject" ? "Ditolak" : "Pengajuan ditarik",
      description: action === "approve"
        ? (isVoid ? "Dokumen dibatalkan dan jurnalnya dibalik." : "Dana keluar dari Hutang Titipan; lakukan transfer kembali ke pangkalan.")
        : undefined,
    }),
    onDone: () => { setNote(""); onClose(); },
  });

  if (!row) return null;
  const blocked = row.requestedByMe
    ? "Pengajuan Anda sendiri harus disetujui orang lain."
    : row.evidenceCount === 0
      ? "Belum ada bukti. Pengaju perlu melampirkan bukti sebelum disetujui."
      : null;

  return (
    <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setNote(""); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {selected!.kind === "void"
              ? `Pembatalan ${selected!.row.documentNumber}`
              : `Pengembalian ${selected!.row.refundNumber} · ${formatRupiah(selected!.row.amount)}`}
          </DialogTitle>
          <DialogDescription>
            {selected!.kind === "void"
              ? <>{DOCUMENT_TYPE_LABEL[selected!.row.documentType]} · <Link className="inline-flex items-center gap-1 underline-offset-2 hover:underline" to={documentLink(selected!.row)} onClick={onClose}>buka dokumen <ExternalLink className="h-3 w-3" /></Link></>
              : <>{selected!.row.outletName} · penerimaan {selected!.row.paymentNumber} · tanggal {formatDateId(selected!.row.refundDate)}{selected!.row.bankAccountName ? ` · dari ${selected!.row.bankAccountName}` : ""}</>}
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="label text-2xs text-ink-muted">Alasan</dt>
            <dd className="mt-0.5 whitespace-pre-line text-ink">{row.reason}</dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="label text-2xs text-ink-muted">Diajukan</dt>
              <dd className="mt-0.5 text-ink">{row.requestedByMe ? "Anda" : row.requestedBy ?? "—"} · {formatDateTimeId(row.requestedAt)}</dd>
            </div>
            <div>
              <dt className="label text-2xs text-ink-muted">Status</dt>
              <dd className="mt-0.5 text-ink">
                {STATUS_LABEL[row.status]}
                {row.decidedBy && ` · ${row.decidedBy}`}
                {row.decidedAt && ` · ${formatDateTimeId(row.decidedAt)}`}
              </dd>
            </div>
          </div>
          {row.decisionNote && (
            <div>
              <dt className="label text-2xs text-ink-muted">Catatan keputusan</dt>
              <dd className="mt-0.5 text-ink">{row.decisionNote}</dd>
            </div>
          )}
        </dl>

        <AttachmentsPanel ownerType={isVoid ? "void_request" : "payment_refund"} ownerId={row.id} readOnly={!pending} />

        {pending && (mayDecide || row.requestedByMe) && (
          <Field label="Catatan" htmlFor="decision-note" hint="Wajib saat menolak.">
            <TextareaInput id="decision-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        )}
        {pending && mayDecide && blocked && <p className="text-xs text-rust-ink">{blocked}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={decide.isPending}>Tutup</Button>
          {pending && row.requestedByMe && (
            <Button variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate("cancel")}>Tarik pengajuan</Button>
          )}
          {pending && mayDecide && (
            <>
              <Button variant="destructive" disabled={decide.isPending || note.trim().length === 0}
                onClick={() => decide.mutate("reject")}>Tolak</Button>
              <Button disabled={decide.isPending || !!blocked} onClick={() => decide.mutate("approve")}>
                Setujui
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
