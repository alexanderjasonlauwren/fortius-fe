/**
 * An inline-editable Keterangan with no comparison attached (e.g. "500
 * tabung kosong ada di gudang") -- the same save-on-blur pattern
 * KomparasiPanel's own row editor uses, pulled out as its own component
 * since this one has nowhere near it: it lives on the plain Penjelasan
 * Akun tab, not inside a Komparasi table. Financial-statements plan's
 * gap-closing phase, Phase A's own closing note.
 */
import { useState } from "react";
import { TextareaInput } from "@/components/common/Field";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { upsertNote } from "@/features/externalstatements/api/externalstatementsApi";

export function GeneralKeterangan({
  layoutLineCode,
  scopeKey,
  value,
}: {
  layoutLineCode: string;
  scopeKey: string;
  value?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);

  const noteMutation = useDeskMutation({
    mutationFn: () => upsertNote({ layoutLineCode, scopeKey, note: draft }),
    success: "Keterangan disimpan",
    errorTitle: "Simpan keterangan gagal",
    onDone: () => setEditing(false),
  });

  return (
    <CanAccess
      permission={PERMISSIONS.STATEMENT_NOTES_UPDATE}
      fallback={value ? <p className="mt-2 text-xs text-ink-muted">{value}</p> : null}
    >
      {editing ? (
        <TextareaInput
          autoFocus
          rows={2}
          className="mt-2 text-xs"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== (value ?? "")) noteMutation.mutate(undefined as never);
            else setEditing(false);
          }}
          disabled={noteMutation.isPending}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-2 w-full rounded-sm px-1.5 py-1 text-left text-xs text-ink-muted hover:bg-panel-sunk hover:text-ink"
        >
          {value || "Tambah keterangan…"}
        </button>
      )}
    </CanAccess>
  );
}
