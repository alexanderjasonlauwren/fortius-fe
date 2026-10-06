/**
 * Komparasi: Sistem | <label pembanding> | Selisih | Keterangan, for
 * whichever of Laba Rugi / Penjelasan Akun / Neraca is selected. Extra
 * lines (the compared book's own lines our layout has no code for) render
 * in italics, grouped under the line they were imported against.
 * Financial-statements plan's gap-closing phase, Phase A.3.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatRupiah } from "@/lib/format";
import { TextareaInput } from "@/components/common/Field";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { upsertNote } from "@/features/externalstatements/api/externalstatementsApi";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import type { ExtraCompareLine } from "../api/financialstatementsApi";
import type { KomparasiRow } from "../lib/komparasiRows";

function formatSigned(value: number): string {
  if (value === 0) return "—";
  if (value < 0) return `(${formatRupiah(Math.abs(value))})`;
  return formatRupiah(value);
}

export function KomparasiPanel({
  rows,
  extras,
  compareLabel,
  scopeKey,
  externalStatementId,
}: {
  rows: KomparasiRow[];
  extras: ExtraCompareLine[];
  compareLabel: string;
  /** The exact scope_key fin.statement_notes keys a saved Keterangan
   *  under -- "pl:<from>..<to>" or "bs:<asOf>", built by the caller so
   *  this component never has to know the date-formatting rule. */
  scopeKey: string;
  externalStatementId?: string;
}) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-line text-2xs uppercase tracking-wide text-ink-muted">
          <th className="py-1.5 pr-3 font-medium">&nbsp;</th>
          <th className="data w-36 py-1.5 pl-3 text-right font-medium">Sistem</th>
          <th className="data w-36 py-1.5 pl-3 text-right font-medium">{compareLabel}</th>
          <th className="data w-36 py-1.5 pl-3 text-right font-medium">Selisih</th>
          <th className="w-64 py-1.5 pl-3 font-medium">Keterangan</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <KomparasiRowView key={r.key} row={r} scopeKey={scopeKey} externalStatementId={externalStatementId} />
        ))}
        {extras.length > 0 && (
          <>
            <tr>
              <td colSpan={5} className="pt-3 pb-1 text-2xs font-semibold text-ink-muted">
                Pos tambahan dari pembanding
              </td>
            </tr>
            {extras.map((e, i) => (
              <tr key={`extra-${i}`} className="border-b border-line">
                <td className="py-1 pr-3 pl-3 text-xs italic text-ink-muted">
                  {e.label} <span className="text-2xs">(di bawah {e.parentCode})</span>
                </td>
                <td className="data py-1 pl-3 text-right text-xs italic text-ink-muted">—</td>
                <td className="data py-1 pl-3 text-right text-xs italic text-ink-muted">{formatRupiah(e.amount)}</td>
                <td className="data py-1 pl-3 text-right text-xs italic text-ink-muted">—</td>
                <td className="py-1 pl-3" />
              </tr>
            ))}
          </>
        )}
      </tbody>
    </table>
  );
}

function KomparasiRowView({
  row, scopeKey, externalStatementId,
}: {
  row: KomparasiRow;
  scopeKey: string;
  externalStatementId?: string;
}) {
  const [draft, setDraft] = useState(row.keterangan ?? "");
  const [editing, setEditing] = useState(false);

  const noteMutation = useDeskMutation({
    mutationFn: () =>
      upsertNote({ layoutLineCode: row.layoutLineCode!, scopeKey, externalStatementId, note: draft }),
    success: "Keterangan disimpan",
    errorTitle: "Simpan keterangan gagal",
    onDone: () => setEditing(false),
  });

  return (
    <tr className="border-b border-line">
      <td
        className={cn("py-1.5 pr-3 text-sm text-ink", row.isBold && "font-semibold")}
        style={{ paddingLeft: `${0.75 + row.level * 1.25}rem` }}
      >
        {row.label}
      </td>
      <td className={cn("data py-1.5 pl-3 text-right text-sm text-ink", row.isBold && "border-t border-line font-semibold")}>
        {formatSigned(row.amount)}
      </td>
      <td className="data py-1.5 pl-3 text-right text-sm text-ink-muted">
        {row.compareAmount == null ? "—" : formatSigned(row.compareAmount)}
      </td>
      <td
        className={cn(
          "data py-1.5 pl-3 text-right text-sm",
          row.variance == null ? "text-ink-muted" : row.variance === 0 ? "text-ink" : "font-semibold text-rust-ink",
        )}
      >
        {row.variance == null ? "—" : formatSigned(row.variance)}
      </td>
      <td className="py-1 pl-3">
        {row.layoutLineCode ? (
          <CanAccess
            permission={PERMISSIONS.STATEMENT_NOTES_UPDATE}
            fallback={<span className="px-1.5 py-1 text-xs text-ink-muted">{row.keterangan || "—"}</span>}
          >
            {editing ? (
              <TextareaInput
                autoFocus
                rows={2}
                className="min-h-0 text-xs"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => {
                  if (draft !== (row.keterangan ?? "")) noteMutation.mutate(undefined as never);
                  else setEditing(false);
                }}
                disabled={noteMutation.isPending}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="w-full rounded-sm px-1.5 py-1 text-left text-xs text-ink-muted hover:bg-panel-sunk hover:text-ink"
              >
                {row.keterangan || "Tambah keterangan…"}
              </button>
            )}
          </CanAccess>
        ) : null}
      </td>
    </tr>
  );
}
