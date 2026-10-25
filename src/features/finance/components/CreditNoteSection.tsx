/**
 * "Nota kredit": every credit note, with the two things a bookkeeper does
 * to one after issuing it -- apply it to its invoice (which is what reduces
 * the receivable) or cancel it. Accounting parity P3.
 */
import { useState } from "react";
import { RequestVoidDialog } from "@/features/approvals/components/RequestVoidDialog";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, StickyNote, XCircle } from "lucide-react";
import {
  applyCreditNote,
  cancelCreditNote,
  CREDIT_NOTE_REASONS,
  getCreditNotes,
  type CreditNoteView,
} from "@/features/finance/api/financeApi";
import { getOutletList } from "@/features/outlet/api/outletApi";
import { AttachmentsButton } from "@/features/attachments/components/AttachmentsButton";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Field, SearchInput, SegmentedControl, TextareaInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { getStatusVariant, spineFor } from "@/lib/status";
import { formatDateId, formatRupiah } from "@/lib/format";
import { outletLabel } from "@/lib/lexicon";
import { scopeKey } from "@/lib/scope";

type StatusFilter = CreditNoteView["status"] | "Semua";

export function CreditNoteSection() {
  const [status, setStatus] = useState<StatusFilter>("Terbit");
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState<CreditNoteView | null>(null);
  // An applied credit note reversed its revenue in the ledger: undoing it
  // is a void, asked for and approved (client answer 5).
  const [voiding, setVoiding] = useState<CreditNoteView | null>(null);
  const [reason, setReason] = useState("");

  const notes = useQuery({
    queryKey: [...scopeKey(), "credit-notes", status, search],
    queryFn: () => getCreditNotes({ status, search }),
  });
  const outlets = useQuery({ queryKey: [...scopeKey(), "outlets", "names"], queryFn: () => getOutletList() });
  const outletName = new Map((outlets.data ?? []).map((o) => [o.id, o.nama]));

  const apply = useDeskMutation({
    mutationFn: (row: CreditNoteView) => applyCreditNote(row.id, row.version),
    errorTitle: "Nota kredit gagal diterapkan",
    success: (row) => ({ title: `${row.nomor} diterapkan`, description: "Sisa tagihannya berkurang." }),
  });
  const cancel = useDeskMutation({
    mutationFn: () => cancelCreditNote(cancelling!.id, cancelling!.version, reason.trim()),
    errorTitle: "Nota kredit gagal dibatalkan",
    success: (row) => ({ title: `${row.nomor} dibatalkan` }),
    onDone: () => { setCancelling(null); setReason(""); },
  });

  const columns: Column<CreditNoteView>[] = [
    {
      key: "nomor",
      header: "Nota kredit",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{row.nomor}</span>
          <span className="data block text-2xs text-ink-muted">{formatDateId(row.tanggal)}</span>
        </>
      ),
      sortValue: (row) => row.tanggal,
    },
    {
      key: "outlet",
      header: outletLabel(),
      render: (row) => <span className="text-sm text-ink">{outletName.get(row.outletId) ?? "—"}</span>,
    },
    {
      key: "tagihan",
      header: "Tagihan",
      render: (row) =>
        row.invoiceId ? (
          <Link to={`/receivables/${row.invoiceId}`} className="data text-xs text-ink underline-offset-2 hover:underline">
            {row.invoiceNomor ?? "Lihat tagihan"}
          </Link>
        ) : (
          <span className="text-2xs text-ink-muted">Kredit di akun</span>
        ),
    },
    {
      key: "alasan",
      header: "Alasan",
      render: (row) => (
        <>
          <span className="block text-xs font-medium text-ink">
            {CREDIT_NOTE_REASONS[row.kodeAlasan as keyof typeof CREDIT_NOTE_REASONS] ?? row.kodeAlasan}
          </span>
          <span className="block max-w-xs truncate text-2xs text-ink-muted" title={row.alasan}>{row.alasan}</span>
        </>
      ),
    },
    {
      key: "jumlah",
      header: "Nilai",
      align: "right",
      render: (row) => <span className="data text-sm text-ink">{formatRupiah(row.jumlah)}</span>,
      sortValue: (row) => row.jumlah,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge variant={getStatusVariant(row.status)} label={row.status} />,
    },
    {
      key: "aksi",
      header: "",
      align: "right",
      width: "1%",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {row.status === "Terbit" && row.invoiceId && (
            <CanAccess permission={PERMISSIONS.CREDIT_NOTES_APPROVE}>
              <Button size="xs" variant="outline" disabled={apply.isPending} onClick={() => apply.mutate(row)}>
                <CheckCircle2 className="h-3 w-3" /> Terapkan
              </Button>
            </CanAccess>
          )}
          {row.status === "Terbit" && (
            <CanAccess permission={PERMISSIONS.CREDIT_NOTES_UPDATE}>
              <Button size="xs" variant="ghost" onClick={() => setCancelling(row)}>
                <XCircle className="h-3 w-3" /> Batalkan
              </Button>
            </CanAccess>
          )}
          {row.status === "Terpakai" && (
            <CanAccess permissions={[PERMISSIONS.CREDIT_NOTES_UPDATE, PERMISSIONS.VOID_REQUESTS_CREATE]} requireAll>
              <Button size="xs" variant="ghost" onClick={() => setVoiding(row)}>
                <XCircle className="h-3 w-3" /> Ajukan pembatalan
              </Button>
            </CanAccess>
          )}
          <AttachmentsButton ownerType="credit_note" ownerId={row.id} label={row.nomor} />
        </div>
      ),
    },
  ];

  return (
    <>
      <Panel>
        <PanelHeader
          title="Nota kredit"
          hint="Terbitkan dari tagihannya; diterapkan barulah mengurangi piutang."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Nomor atau keterangan" className="w-56" />
              <SegmentedControl
                value={status}
                onChange={setStatus}
                options={[
                  { value: "Terbit" as const, label: "Belum diterapkan" },
                  { value: "Terpakai" as const, label: "Diterapkan" },
                  { value: "Batal" as const, label: "Batal" },
                  { value: "Semua" as const, label: "Semua" },
                ]}
              />
            </div>
          }
        />
        <DataTable
          columns={columns}
          data={notes.data ?? []}
          isLoading={notes.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) => spineFor(row.status)}
          pageSize={15}
          emptyIcon={StickyNote}
          emptyMessage="Tidak ada nota kredit"
          emptyDescription="Nota kredit diterbitkan dari tagihan yang perlu dikurangi."
          dense
        />
      </Panel>

      <Dialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Batalkan {cancelling?.nomor}?</DialogTitle>
            <DialogDescription>
              Nota kredit yang belum diterapkan dibatalkan tanpa mengubah tagihannya.
            </DialogDescription>
          </DialogHeader>
          <Field label="Alasan pembatalan" htmlFor="cn-cancel-reason" required>
            <TextareaInput id="cn-cancel-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)}>Kembali</Button>
            <Button variant="destructive" disabled={reason.trim().length < 2 || cancel.isPending}
              onClick={() => cancel.mutate(undefined as never)}>
              Batalkan nota kredit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RequestVoidDialog
        target={voiding ? {
          documentType: "credit_note", documentId: voiding.id, version: voiding.version, label: voiding.nomor,
          effect: "Jurnal nota kredit ini dibalik dan piutang tagihannya terbuka kembali.",
        } : null}
        onClose={() => setVoiding(null)}
      />
    </>
  );
}
