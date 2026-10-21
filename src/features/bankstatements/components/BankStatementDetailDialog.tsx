/**
 * One imported statement's lines: auto-match, then classify whatever is
 * left by hand -- post to an account, link an existing document, or
 * ignore. Financial-statements plan's gap-closing phase, Phase B.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Wand2 } from "lucide-react";
import { getChartOfAccounts } from "@/features/finance/api/financeApi";
import { leafAccounts } from "@/features/finance/lib/accounts";
import {
  autoMatch,
  classifyLine,
  getImport,
  type BankStatementLine,
} from "@/features/bankstatements/api/bankStatementApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SelectInput } from "@/components/common/Field";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Skeleton } from "@/components/common/Panel";
import { getStatusVariant } from "@/lib/status";
import { formatDateId, formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

const LINE_STATUS_LABEL: Record<BankStatementLine["status"], string> = {
  unmatched: "Belum Dicocokkan",
  matched: "Cocok",
  posted: "Diposting",
  ignored: "Diabaikan",
};

const SOURCE_TYPE_LABEL: Record<string, string> = {
  payment: "Pembayaran",
  purchase: "Pembelian",
  transportation_claim: "Klaim transportasi",
  expense: "Pengeluaran",
  cash_voucher: "Voucher kas",
};

interface BankStatementDetailDialogProps {
  importId: string | null;
  onClose: () => void;
}

function ClassifyRow({ line, importId }: { line: BankStatementLine; importId: string }) {
  const [accountId, setAccountId] = useState("");
  const accounts = useQuery({ queryKey: [...scopeKey(), "cash-bank", "chart-of-accounts"], queryFn: getChartOfAccounts });

  const classify = useDeskMutation({
    mutationFn: (input: { accountId?: string; ignore?: boolean }) => classifyLine({ lineId: line.id, ...input }),
    success: "Baris diklasifikasikan",
    errorTitle: "Klasifikasi gagal",
    invalidate: [[...scopeKey(), "cash-bank", "bank-statement-import", importId]],
  });

  return (
    <div className="flex items-center gap-2">
      <SelectInput value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-8 text-xs">
        <option value="">Posting ke akun…</option>
        {/* Leaves no module controls: classifying posts a cash voucher,
            which refuses a parent or a control account. */}
        {leafAccounts(accounts.data ?? []).filter((a) => !a.akun.kontrol).map((a) => (
          <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} · {a.akun.nama}</option>
        ))}
      </SelectInput>
      <Button
        size="sm" variant="outline"
        disabled={!accountId || classify.isPending}
        onClick={() => classify.mutate({ accountId })}
      >
        Posting
      </Button>
      <Button
        size="sm" variant="ghost"
        disabled={classify.isPending}
        onClick={() => classify.mutate({ ignore: true })}
      >
        Abaikan
      </Button>
    </div>
  );
}

export function BankStatementDetailDialog({ importId, onClose }: BankStatementDetailDialogProps) {
  const detail = useQuery({
    queryKey: [...scopeKey(), "cash-bank", "bank-statement-import", importId],
    queryFn: () => getImport(importId!),
    enabled: !!importId,
  });

  const autoMatchMutation = useDeskMutation({
    mutationFn: () => autoMatch(importId!),
    success: (result) => ({
      title: "Pencocokan otomatis selesai",
      description: `${result.matched} cocok, ${result.posted} diposting, ${result.stillUnmatched} masih perlu klasifikasi manual.`,
    }),
    errorTitle: "Pencocokan otomatis gagal",
    invalidate: [[...scopeKey(), "cash-bank", "bank-statement-import", importId]],
  });

  const lines = detail.data?.lines ?? [];
  const unmatchedCount = lines.filter((l) => l.status === "unmatched").length;

  return (
    <Dialog open={!!importId} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{detail.data?.fileName ?? "Rekening koran"}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-muted">
            {detail.data ? `${formatDateId(detail.data.periodFrom)} – ${formatDateId(detail.data.periodTo)}` : ""}
            {unmatchedCount > 0 && ` · ${unmatchedCount} baris belum dicocokkan`}
          </p>
          <Button
            size="sm" variant="outline"
            disabled={autoMatchMutation.isPending || unmatchedCount === 0}
            onClick={() => autoMatchMutation.mutate(undefined as never)}
          >
            {autoMatchMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            Jalankan pencocokan otomatis
          </Button>
        </div>

        {detail.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-panel">
                <tr className="border-b border-line">
                  <th className="py-1.5 text-ink-muted">Tanggal</th>
                  <th className="py-1.5 text-ink-muted">Keterangan</th>
                  <th className="py-1.5 text-right text-ink-muted">Debit</th>
                  <th className="py-1.5 text-right text-ink-muted">Kredit</th>
                  <th className="py-1.5 text-ink-muted">Status</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b border-line align-top">
                    <td className="py-2 text-ink">{formatDateId(line.lineDate)}</td>
                    <td className="py-2 text-ink">{line.description || line.reference}</td>
                    <td className="data py-2 text-right text-ink">{line.debit ? formatRupiah(line.debit) : ""}</td>
                    <td className="data py-2 text-right text-ink">{line.credit ? formatRupiah(line.credit) : ""}</td>
                    <td className="py-2">
                      <div className="space-y-1">
                        <StatusBadge
                          label={line.matchedSourceType ? SOURCE_TYPE_LABEL[line.matchedSourceType] ?? LINE_STATUS_LABEL[line.status] : LINE_STATUS_LABEL[line.status]}
                          variant={getStatusVariant(LINE_STATUS_LABEL[line.status])}
                        />
                        {line.status === "unmatched" && importId && <ClassifyRow line={line} importId={importId} />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
