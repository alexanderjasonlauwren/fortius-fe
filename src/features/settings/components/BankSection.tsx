import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { deleteBankAccount, getBankAccounts, saveBankAccount } from "@/features/bankaccounts/api/bankAccountApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Field, SegmentedControl, SelectInput, TextInput, Toggle } from "@/components/common/Field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BankAccountEntity, BankNameEntity } from "@/types/domain";
import { outletLabel } from "@/lib/lexicon";
import { Link } from "react-router-dom";
import { getTrialBalance } from "@/features/finance/api/financeApi";
import { balancesByCode } from "@/features/bankaccounts/lib/ledgerBalance";
import { useAuthStore } from "@/features/auth/store/authStore";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { formatRupiah } from "@/lib/format";
import { todayIso } from "@/lib/date";

const BANKS: BankNameEntity[] = ["BCA", "BNI", "Mandiri", "BRI", "BSI"];

/* ── receiving accounts ────────────────────────────────────────────────── */

interface BankForm {
  id?: string;
  bank: BankNameEntity;
  nomorRekening: string;
  atasNama: string;
  cabang: string;
  utama: boolean;
  aktif: boolean;
  kind: "bank" | "cash";
}

const EMPTY_BANK: BankForm = {
  bank: "BCA",
  nomorRekening: "",
  atasNama: "",
  cabang: "",
  utama: false,
  aktif: true,
  kind: "bank",
};

export function BankSection() {
  const list = useQuery({ queryKey: [...scopeKey(), "bank-accounts"], queryFn: getBankAccounts });
  const [editing, setEditing] = useState<BankForm | null>(null);
  const [pendingDelete, setPendingDelete] = useState<BankAccountEntity | null>(null);
  // What each account holds in the books, from the trial balance to date --
  // only for someone who may read the statements.
  const canSeeBalances = useAuthStore((s) => s.hasPermission(PERMISSIONS.FINANCIAL_STATEMENTS_VIEW));
  const balances = useQuery({
    queryKey: [...scopeKey(), "bank-accounts", "ledger-balances"],
    queryFn: async () => balancesByCode((await getTrialBalance({ from: "2000-01-01", to: todayIso() })).rows),
    enabled: canSeeBalances,
  });

  const saveMutation = useDeskMutation({
    mutationFn: (values: BankForm) => saveBankAccount(values),
    errorTitle: "Rekening tidak tersimpan",
    success: (a) => ({
      title: a.kind === "cash"
        ? `Kas ${a.nomorRekening} tersimpan`
        : `Rekening ${a.bank} ${a.nomorRekening} tersimpan`,
    }),
    onDone: () => setEditing(null),
  });

  const deleteMutation = useDeskMutation({
    mutationFn: (id: string) => deleteBankAccount(id),
    errorTitle: "Hapus rekening gagal",
    success: "Rekening dihapus",
    onDone: () => setPendingDelete(null),
  });

  return (
    <>
      <Panel>
        <PanelHeader
          title="Rekening & Kas"
          hint={`Rekening tujuan transfer ${outletLabel()}, dan kas kecil untuk voucher tunai. Rekening utama dicetak pada tagihan.`}
          actions={
            <Button size="sm" onClick={() => setEditing(EMPTY_BANK)}>
              <Plus className="h-3.5 w-3.5" />
              Tambah rekening
            </Button>
          }
        />
        {list.isLoading ? (
          <PanelBody className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </PanelBody>
        ) : (list.data ?? []).length === 0 ? (
          <PanelBody>
            <p className="py-8 text-center text-sm text-ink-muted">
              Belum ada rekening penerimaan. Tim keuangan memerlukan ini untuk
              mencocokkan transfer yang masuk.
            </p>
          </PanelBody>
        ) : (
          <>
          <p className="border-b border-line px-5 py-2 text-xs text-ink-muted">
            Setiap rekening punya akun buku besarnya sendiri. Saldo saat mulai memakai aplikasi dicatat lewat{" "}
            <Link to="/opening-balance" className="font-medium text-ink underline-offset-2 hover:underline">Saldo Awal</Link>;
            sesudahnya, saldo bergerak lewat penerimaan, pembayaran, dan voucher kas &amp; bank.
          </p>
          <ul className="divide-y divide-line">
            {(list.data ?? []).map((a) => (
              <li
                key={a.id}
                className={cn(
                  "spine flex flex-wrap items-center gap-4 px-5 py-4",
                  a.utama ? "text-signal" : a.aktif ? "text-pine" : "text-draft",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {a.kind === "cash" ? "Kas Kecil" : a.bank}
                    {a.utama && (
                      <span className="flex items-center gap-1 rounded-sm bg-signal-soft px-1.5 py-0.5 text-2xs font-medium text-signal-ink">
                        <Star className="h-2.5 w-2.5" />
                        Utama
                      </span>
                    )}
                    {!a.aktif && <StatusBadge variant="draft" label="Nonaktif" />}
                  </p>
                  <p className="data mt-0.5 text-sm text-ink">{a.nomorRekening}</p>
                  <p className="text-xs text-ink-muted">
                    {a.atasNama}
                    {a.kind === "bank" && a.cabang && ` · KCP ${a.cabang}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="data text-2xs text-ink-muted">Akun {a.ledgerAccountCode}</p>
                  {canSeeBalances && (
                    <p className="data text-sm text-ink">
                      {balances.data ? formatRupiah(balances.data.get(a.ledgerAccountCode) ?? 0) : "…"}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Ubah rekening ${a.nomorRekening}`}
                    onClick={() => setEditing({ ...a })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Hapus rekening ${a.nomorRekening}`}
                    onClick={() => setPendingDelete(a)}
                    className="hover:bg-rust-soft hover:text-rust-ink"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          </>
        )}
      </Panel>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editing) saveMutation.mutate(editing);
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {editing?.id ? "Ubah rekening" : "Tambah rekening atau kas"}
              </DialogTitle>
              <DialogDescription>
                {editing?.kind === "cash"
                  ? "Kas kecil tidak muncul di tagihan. Hanya dipakai untuk voucher kas masuk dan keluar."
                  : "Rekening ini muncul pada tagihan dan dipakai keuangan untuk mencocokkan mutasi masuk."}
              </DialogDescription>
            </DialogHeader>

            {editing && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Jenis" htmlFor="bank-kind" className="sm:col-span-2">
                  {editing.id ? (
                    // Immutable after creation (CreateBankAccountRequest.Kind's
                    // own doc) -- shown, not offered as a choice.
                    <p className="py-1.5 text-sm text-ink">
                      {editing.kind === "cash" ? "Kas kecil" : "Rekening bank"}
                    </p>
                  ) : (
                    <SegmentedControl
                      value={editing.kind}
                      onChange={(kind) => setEditing({ ...editing, kind })}
                      options={[
                        { value: "bank" as const, label: "Rekening bank" },
                        { value: "cash" as const, label: "Kas kecil" },
                      ]}
                    />
                  )}
                </Field>
                {editing.kind === "bank" && (
                  <>
                    <Field label="Bank" htmlFor="bank-nama">
                      <SelectInput
                        id="bank-nama"
                        value={editing.bank}
                        onChange={(e) =>
                          setEditing({ ...editing, bank: e.target.value as BankNameEntity })
                        }
                      >
                        {BANKS.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Cabang" htmlFor="bank-cabang">
                      <TextInput
                        id="bank-cabang"
                        value={editing.cabang}
                        onChange={(e) => setEditing({ ...editing, cabang: e.target.value })}
                      />
                    </Field>
                  </>
                )}
                <Field
                  label={editing.kind === "cash" ? "Nama kas" : "Nomor rekening"}
                  htmlFor="bank-no"
                  required
                  className="sm:col-span-2"
                >
                  <TextInput
                    id="bank-no"
                    mono
                    value={editing.nomorRekening}
                    onChange={(e) =>
                      setEditing({ ...editing, nomorRekening: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Atas nama"
                  htmlFor="bank-atas"
                  required
                  className="sm:col-span-2"
                >
                  <TextInput
                    id="bank-atas"
                    value={editing.atasNama}
                    onChange={(e) => setEditing({ ...editing, atasNama: e.target.value })}
                  />
                </Field>
                <div className="divide-y divide-line sm:col-span-2">
                  <Toggle
                    label="Jadikan rekening utama"
                    description="Dicetak pada tagihan. Hanya satu rekening yang bisa menjadi utama."
                    checked={editing.utama}
                    onChange={(utama) => setEditing({ ...editing, utama })}
                  />
                  <Toggle
                    label="Aktif"
                    description="Rekening nonaktif tetap tersimpan untuk riwayat."
                    checked={editing.aktif}
                    onChange={(aktif) => setEditing({ ...editing, aktif })}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditing(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                Simpan rekening
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title="Hapus rekening ini?"
        message={`${pendingDelete?.kind === "cash" ? "Kas" : pendingDelete?.bank} ${pendingDelete?.nomorRekening} tidak lagi muncul pada tagihan baru.`}
        details="Pembayaran yang sudah tercatat pada rekening ini tetap tersimpan."
        confirmLabel="Hapus rekening"
        isPending={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </>
  );
}
