import { scopeKey } from "@/lib/scope";
import { AttachmentsButton } from "@/features/attachments/components/AttachmentsButton";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, Plus, Split, Wallet, XCircle } from "lucide-react";
import {
  getOpenInvoices,
  getPaymentMethods,
  getPayments,
  submitAllocation,
  submitPayment,
  submitPaymentDecision,
  type PaymentView,
} from "@/features/finance/api/financeApi";
import { getOutletOptions } from "@/features/distribution/api/distributionApi";
import { getOutletDetail } from "@/features/outlet/api/outletApi";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import {
  Field,
  SearchInput,
  SegmentedControl,
  SelectInput,
  TextInput,
  TextareaInput,
} from "@/components/common/Field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateId, formatRupiah, formatRupiahShort } from "@/lib/format";
import type { BankNameEntity } from "@/types/domain";
import { outletLabel, outletLabelTitle } from "@/lib/lexicon";
import { useResettableState } from "@/hooks/useResettableState";

const TABS = ["Menunggu Verifikasi", "Terverifikasi", "Ditolak", "Semua"];
const BANKS: BankNameEntity[] = ["BCA", "BNI", "Mandiri", "BRI", "BSI"];

function todayIso() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PaymentPage() {
  const [tab, setTab] = useState("Menunggu Verifikasi");
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState<{
    payment: PaymentView;
    action: "verify" | "reject";
  } | null>(null);
  const [alasan, setAlasan] = useState("");
  // Rejecting a receipt that was already verified is its void: the same
  // backend action, reversing the journal it posted.
  const voiding = decision?.action === "reject" && decision.payment.status === "Terverifikasi";
  const [allocating, setAllocating] = useState<PaymentView | null>(null);
  // Arriving from Verifikasi Pembayaran's "Alokasikan" dialog with no receipt yet
  // recorded: ?outlet=<id> opens this dialog with that outlet pre-selected,
  // so recording one is a single trip rather than a menu hunt back here.
  const [searchParams] = useSearchParams();
  const outletFromLink = searchParams.get("outlet") ?? "";
  const [recording, setRecording] = useState(!!outletFromLink);

  const payments = useQuery({
    queryKey: [...scopeKey(), "payments", tab, search],
    queryFn: () => getPayments(tab, search),
  });

  const decideMutation = useDeskMutation({
    mutationFn: (input: {
      id: string;
      action: "verify" | "reject";
      keterangan?: string;
    }) => submitPaymentDecision(input.id, input.action, input.keterangan),
    errorTitle: "Verifikasi gagal",
    success: (p) => ({
      title:
        p.status === "Terverifikasi" ? `${p.nomor} diverifikasi` : `${p.nomor} ditolak / dibatalkan`,
      description:
        p.status === "Terverifikasi"
          ? `${formatRupiah(p.jumlah)} masuk ke buku besar dan mengurangi piutang.`
          : "Alokasi ke tagihan dibatalkan, piutang kembali terbuka.",
      tone: p.status === "Terverifikasi" ? "success" : "warning",
    }),
    onDone: () => {
      setDecision(null);
      setAlasan("");
    },
  });

  const totals = useMemo(() => {
    const rows = payments.data ?? [];
    return {
      menunggu: rows.filter((p) => p.status === "Menunggu Verifikasi"),
      belumAlokasi: rows.filter((p) => p.belumDialokasikan > 0.5),
    };
  }, [payments.data]);

  const columns: Column<PaymentView>[] = [
    {
      key: "nomor",
      header: "Bukti terima",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{row.nomor}</span>
          <span className="data block text-2xs text-ink-muted">
            {formatDateId(row.tanggal)}
          </span>
        </>
      ),
      sortValue: (row) => row.tanggal,
    },
    {
      key: outletLabel(),
      header: outletLabelTitle(),
      render: (row) => (
        <Link
          to={`/receivables?${outletLabel()}=${row.outletId}`}
          className="font-medium text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
        >
          {row.outlet}
        </Link>
      ),
      sortValue: (row) => row.outlet,
    },
    {
      key: "bank",
      header: "Sumber dana",
      render: (row) => (
        <>
          <span className="block text-xs text-ink">{row.bank}</span>
          <span className="data block text-2xs text-ink-muted">{row.noRekening}</span>
        </>
      ),
    },
    {
      key: "jumlah",
      header: "Diterima",
      align: "right",
      render: (row) => (
        <span className="data font-semibold text-ink">{formatRupiah(row.jumlah)}</span>
      ),
      sortValue: (row) => row.jumlah,
    },
    {
      key: "alokasi",
      header: "Alokasi",
      render: (row) =>
        row.alokasi.length === 0 ? (
          <span className="text-2xs font-medium text-signal-ink">Belum dialokasikan</span>
        ) : (
          <>
            <span className="data block text-2xs text-ink">
              {row.alokasi.map((a) => a.nomor).join(", ")}
            </span>
            {row.belumDialokasikan > 0.5 && (
              <span className="data block text-2xs text-signal-ink">
                sisa {formatRupiah(row.belumDialokasikan)}
              </span>
            )}
          </>
        ),
      sortValue: (row) => row.belumDialokasikan,
    },
    {
      key: "status",
      header: "Status",
      width: "11rem",
      render: (row) => (
        <>
          <StatusBadge variant={getStatusVariant(row.status)} label={row.status} />
          {row.keterangan && (
            <span className="mt-1 block max-w-[12rem] text-2xs leading-snug text-ink-muted">
              {row.keterangan}
            </span>
          )}
        </>
      ),
      sortValue: (row) => row.status,
    },
    {
      key: "aksi",
      header: "",
      align: "right",
      width: "1%",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <AttachmentsButton ownerType="payment" ownerId={row.id} label={row.nomor} />
          {row.belumDialokasikan > 0.5 && row.status !== "Ditolak" && (
            <Button size="xs" variant="outline" onClick={() => setAllocating(row)}>
              <Split className="h-3 w-3" />
              Alokasikan
            </Button>
          )}
          {row.status === "Terverifikasi" && (
            <CanAccess permission={PERMISSIONS.PAYMENTS_REJECT}>
              <Button
                size="xs"
                variant="ghost"
                aria-label={`Batalkan ${row.nomor}`}
                className="hover:bg-rust-soft hover:text-rust-ink"
                onClick={() => {
                  setAlasan("");
                  setDecision({ payment: row, action: "reject" });
                }}
              >
                <Ban className="h-3 w-3" />
              </Button>
            </CanAccess>
          )}
          {row.status === "Menunggu Verifikasi" && (
            <>
            <CanAccess permission={PERMISSIONS.PAYMENTS_VERIFY}>
              <Button
                size="xs"
                onClick={() => setDecision({ payment: row, action: "verify" })}
              >
                <CheckCircle2 className="h-3 w-3" />
                Verifikasi
              </Button>
            </CanAccess>
            <CanAccess permission={PERMISSIONS.PAYMENTS_REJECT}>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setAlasan("");
                  setDecision({ payment: row, action: "reject" });
                }}
                className="hover:bg-rust-soft hover:text-rust-ink"
              >
                <XCircle className="h-3 w-3" />
              </Button>
            </CanAccess>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Penerimaan Kas"
        description={`Uang masuk dari ${outletLabel()}. Setiap penerimaan dialokasikan ke tagihan tertentu — satu transfer boleh melunasi beberapa tagihan sekaligus.`}
        actions={
          <CanAccess permission={PERMISSIONS.PAYMENTS_CREATE}>
            <Button onClick={() => setRecording(true)}>
              <Plus className="h-3.5 w-3.5" />
              Catat penerimaan
            </Button>
          </CanAccess>
        }
        meta={
          <span className="text-xs text-ink-muted">
            <span className="data">{totals.menunggu.length}</span> menunggu verifikasi ·{" "}
            <span className="data">{totals.belumAlokasi.length}</span> belum dialokasikan
          </span>
        }
      />

      <Panel>
        <PanelHeader
          title="Daftar penerimaan"
          hint={`${(payments.data ?? []).length} baris`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={`Nomor, ${outletLabel()}, rekening`}
                className="w-52"
              />
              <SegmentedControl
                value={tab}
                onChange={setTab}
                options={TABS.map((t) => ({ value: t, label: t }))}
              />
            </div>
          }
        />
        <DataTable
          columns={columns}
          data={payments.data ?? []}
          isLoading={payments.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) =>
            row.belumDialokasikan > 0.5 ? "text-signal" : spineFor(row.status)
          }
          pageSize={12}
          defaultSortKey="nomor"
          defaultSortDir="desc"
          emptyIcon={Wallet}
          emptyMessage="Tidak ada penerimaan"
          emptyDescription="Catat transfer yang masuk, lalu alokasikan ke tagihan yang dilunasi."
          dense
        />
      </Panel>

      <RecordPaymentDialog
        open={recording}
        onOpenChange={setRecording}
        initialOutletId={outletFromLink}
      />
      <AllocateDialog payment={allocating} onClose={() => setAllocating(null)} />

      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {decision?.action === "verify"
                ? `Verifikasi ${decision?.payment.nomor}`
                : voiding
                  ? `Batalkan ${decision?.payment.nomor}`
                  : `Tolak ${decision?.payment.nomor}`}
            </DialogTitle>
            <DialogDescription>
              {decision?.action === "verify"
                ? "Kas diakui di buku besar dan piutang berkurang sebesar alokasinya."
                : voiding
                  ? "Untuk penerimaan yang sudah diverifikasi tetapi ternyata batal (transfer ditarik, giro tolak). Jurnalnya dibalik hari ini dan tagihan yang dilunasinya terbuka kembali."
                  : "Alokasi ke tagihan dibatalkan dan piutang kembali terbuka."}
            </DialogDescription>
          </DialogHeader>

          {decision && (
            <div className="rounded-md border border-line bg-panel-sunk p-4 text-xs">
              <div className="flex justify-between gap-4">
                <span className="text-ink-muted">Diterima</span>
                <span className="data font-semibold text-ink">
                  {formatRupiah(decision.payment.jumlah)}
                </span>
              </div>
              <div className="mt-1.5 flex justify-between gap-4">
                <span className="text-ink-muted">Dialokasikan</span>
                <span className="data text-ink">
                  {formatRupiah(
                    decision.payment.jumlah - decision.payment.belumDialokasikan,
                  )}
                </span>
              </div>
              {decision.payment.belumDialokasikan > 0.5 &&
                decision.action === "verify" && (
                  <p className="mt-2 border-t border-line pt-2 text-signal-ink">
                    Sisa {formatRupiah(decision.payment.belumDialokasikan)} belum
                    dialokasikan dan tetap tercatat sebagai kas belum teridentifikasi.
                  </p>
                )}
            </div>
          )}

          <Field
            label={decision?.action === "reject" ? (voiding ? "Alasan pembatalan" : "Alasan penolakan") : "Catatan"}
            htmlFor="alasan"
            required={decision?.action === "reject"}
          >
            <TextareaInput
              id="alasan"
              rows={3}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder={
                decision?.action === "reject"
                  ? "Contoh: nominal transfer tidak cocok dengan mutasi rekening."
                  : "Opsional."
              }
            />
          </Field>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDecision(null)}>
              Batal
            </Button>
            <Button
              variant={decision?.action === "reject" ? "destructive" : "default"}
              disabled={
                decideMutation.isPending ||
                (decision?.action === "reject" && !alasan.trim())
              }
              onClick={() =>
                decision &&
                decideMutation.mutate({
                  id: decision.payment.id,
                  action: decision.action,
                  keterangan: alasan,
                })
              }
            >
              {decision?.action === "reject" ? (voiding ? "Batalkan penerimaan" : "Tolak penerimaan") : "Verifikasi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── allocation ────────────────────────────────────────────────────────── */

function AllocateDialog({
  payment,
  onClose,
}: {
  payment: PaymentView | null;
  onClose: () => void;
}) {

  const invoices = useQuery({
    queryKey: [...scopeKey(), "open-invoices", payment?.outletId],
    queryFn: () => getOpenInvoices(payment!.outletId),
    enabled: !!payment,
  });

  // Allocations are per payment, so opening a different one starts empty.
  // Reset during render rather than in an effect: after an effect, the new
  // payment's invoice list would paint for one frame carrying the amounts
  // typed against the previous one.
  const [rows, setRows] = useResettableState<Record<string, number>>(
    [payment?.id],
    () => ({}),
  );

  const mutation = useDeskMutation({
    mutationFn: (input: {
      id: string;
      alokasi: { invoiceId: string; jumlah: number }[];
    }) => submitAllocation(input.id, input.alokasi),
    errorTitle: "Alokasi gagal",
    success: "Penerimaan dialokasikan",
    onDone: onClose,
  });

  const dialokasikan = Object.values(rows).reduce((s, v) => s + (v || 0), 0);
  const tersedia = payment?.belumDialokasikan ?? 0;
  const sisa = tersedia - dialokasikan;

  /** Oldest invoice first — the standard way to apply cash. */
  const autoApply = () => {
    let budget = tersedia;
    const next: Record<string, number> = {};
    for (const inv of invoices.data ?? []) {
      if (budget <= 0) break;
      const take = Math.min(budget, inv.sisa);
      next[inv.id] = Math.round(take);
      budget -= take;
    }
    setRows(next);
  };

  return (
    <Dialog open={!!payment} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Alokasikan {payment?.nomor}</DialogTitle>
          <DialogDescription>
            Tentukan tagihan mana yang dilunasi penerimaan ini. Sisa yang tidak
            dialokasikan tetap tercatat sebagai kas belum teridentifikasi.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-panel-sunk px-4 py-3 text-xs">
          <span className="text-ink-muted">
            Tersedia{" "}
            <span className="data font-semibold text-ink">{formatRupiah(tersedia)}</span>
          </span>
          <span className={cn("text-ink-muted", sisa < 0 && "font-semibold text-rust-ink")}>
            Sisa <span className="data font-semibold">{formatRupiah(sisa)}</span>
          </span>
          <Button size="xs" variant="outline" onClick={autoApply}>
            Terapkan otomatis (tertua dulu)
          </Button>
        </div>

        {/* overflow-x too: four columns plus a numeric input do not fit the
            ~295px of dialog interior on a phone, and the allocation input is
            the whole point of this modal. */}
        <div className="max-h-72 overflow-auto rounded-md border border-line">
          {(invoices.data ?? []).length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">
              Tidak ada tagihan terbuka untuk {outletLabel()} ini.
            </p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line bg-panel-sunk">
                  <th className="label px-4 py-2 text-2xs text-ink-muted">Tagihan</th>
                  <th className="label px-4 py-2 text-2xs text-ink-muted">Jatuh tempo</th>
                  <th className="label px-4 py-2 text-right text-2xs text-ink-muted">
                    Sisa
                  </th>
                  <th className="label px-4 py-2 text-right text-2xs text-ink-muted">
                    Alokasi
                  </th>
                </tr>
              </thead>
              <tbody>
                {(invoices.data ?? []).map((inv) => (
                  <tr key={inv.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-2">
                      <span className="data block text-xs text-ink">{inv.nomor}</span>
                      <StatusBadge
                        variant={getStatusVariant(inv.status)}
                        label={inv.status}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <span className="data text-xs text-ink-muted">
                        {formatDateId(inv.jatuhTempo)}
                      </span>
                      {inv.umurHari > 0 && (
                        <span className="data block text-2xs text-rust-ink">
                          telat {inv.umurHari} hari
                        </span>
                      )}
                    </td>
                    <td className="data px-4 py-2 text-right text-xs text-ink">
                      {formatRupiah(inv.sisa)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <TextInput
                        type="number"
                        mono
                        min={0}
                        max={inv.sisa}
                        aria-label={`Alokasi untuk ${inv.nomor}`}
                        className="w-24 py-1 text-right text-xs sm:w-32"
                        value={rows[inv.id] ?? ""}
                        onChange={(e) =>
                          setRows({ ...rows, [inv.id]: Number(e.target.value) })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            disabled={dialokasikan <= 0 || sisa < 0 || mutation.isPending}
            onClick={() =>
              payment &&
              mutation.mutate({
                id: payment.id,
                alokasi: Object.entries(rows)
                  .filter(([, v]) => v > 0)
                  .map(([invoiceId, jumlah]) => ({ invoiceId, jumlah })),
              })
            }
          >
            Alokasikan {formatRupiahShort(dialokasikan)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── record a receipt ──────────────────────────────────────────────────── */

function RecordPaymentDialog({
  open,
  onOpenChange,
  initialOutletId = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialOutletId?: string;
}) {
  const [rest, setRest] = useState({
    outletId: initialOutletId,
    jumlah: 0,
    tanggal: todayIso(),
    keterangan: "",
    metodeId: "",
    referensi: "",
    rekeningTujuanId: "",
  });

  const outlet = useQuery({
    queryKey: [...scopeKey(), "outlet-options"],
    queryFn: getOutletOptions,
  });
  const methods = useQuery({ queryKey: [...scopeKey(), "payment-methods"], queryFn: getPaymentMethods, enabled: open });
  const accounts = useQuery({ queryKey: [...scopeKey(), "bank-accounts"], queryFn: getBankAccounts, enabled: open });

  const selectedOutlet = useQuery({
    queryKey: [...scopeKey(), "outlet-detail", rest.outletId],
    queryFn: () => getOutletDetail(rest.outletId),
    enabled: !!rest.outletId,
  });
  const openInvoices = useQuery({
    queryKey: [...scopeKey(), "open-invoices", rest.outletId],
    queryFn: () => getOpenInvoices(rest.outletId),
    enabled: open && !!rest.outletId,
  });

  // Recomputed during render, not in an effect (see useResettableState's own
  // doc for why), whenever selectedOutlet.data's identity changes -- which
  // React Query only does when the outlet selection actually changes, not on
  // every keystroke elsewhere in the form. Only takes bank/noRekening from
  // the outlet when IT has a default on file; one with none on file falls
  // back to the BNI default rather than an empty field, since SIM3LON is
  // itself described as tied to BNI Direct (flow doc §8) -- not a claim
  // every pangkalan uses it, just the better blank guess.
  const [bankInfo, setBankInfo] = useResettableState([selectedOutlet.data], () => ({
    bank: (selectedOutlet.data?.bank ?? "BNI") as BankNameEntity,
    noRekening: selectedOutlet.data?.noRekening ?? "",
  }));
  // Allocations belong to one pangkalan's invoices; choosing another
  // pangkalan starts them over.
  const [alokasi, setAlokasi] = useResettableState<Record<string, number>>([rest.outletId], () => ({}));

  const form = { ...rest, ...bankInfo };
  const setForm = (next: typeof form) => {
    const { bank, noRekening, ...others } = next;
    setRest(others);
    setBankInfo({ bank, noRekening });
  };

  const activeAccounts = (accounts.data ?? []).filter((a) => a.aktif);
  const defaultAccount = activeAccounts.find((a) => a.utama && a.kind === "bank") ?? activeAccounts[0];
  const methodList = methods.data ?? [];
  const method =
    methodList.find((m) => m.id === form.metodeId) ??
    methodList.find((m) => m.kode === "bank_transfer") ??
    methodList[0];
  const needsReference = !!method?.butuhReferensi;

  const dialokasikan = Object.values(alokasi).reduce((t, v) => t + (v || 0), 0);
  const sisaAlokasi = form.jumlah - dialokasikan;
  /** Oldest invoice first -- the standard way to apply cash. */
  const autoApply = () => {
    let budget = form.jumlah;
    const next: Record<string, number> = {};
    for (const inv of openInvoices.data ?? []) {
      if (budget <= 0) break;
      const take = Math.min(budget, inv.sisa);
      next[inv.id] = Math.round(take);
      budget -= take;
    }
    setAlokasi(next);
  };

  const mutation = useDeskMutation({
    mutationFn: () =>
      submitPayment({
        ...form,
        metodeId: method?.id,
        rekeningTujuanId: form.rekeningTujuanId || defaultAccount?.id,
        alokasi: Object.entries(alokasi)
          .filter(([, v]) => v > 0)
          .map(([invoiceId, jumlah]) => ({ invoiceId, jumlah })),
      }),
    errorTitle: "Penerimaan tidak tercatat",
    success: (p) => ({
      title: `${p.nomor} dicatat`,
      description:
        p.belumDialokasikan > 0.5
          ? `Sisa ${formatRupiah(p.belumDialokasikan)} belum dialokasikan ke tagihan.`
          : "Seluruhnya sudah dialokasikan ke tagihan.",
    }),
    onDone: () => onOpenChange(false),
  });

  const canSubmit =
    !!form.outletId &&
    form.jumlah > 0 &&
    !!form.tanggal &&
    sisaAlokasi >= 0 &&
    (!needsReference || !!form.referensi.trim() || !!form.noRekening.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Catat penerimaan kas</DialogTitle>
          <DialogDescription>
            Uang yang masuk dari {outletLabel()}. Pilih tagihan yang dilunasi di bawah, atau
            alokasikan nanti dari daftar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={outletLabelTitle()} htmlFor="p-pkl" required className="sm:col-span-2">
            <SelectInput
              id="p-pkl"
              value={form.outletId}
              onChange={(e) => setForm({ ...form, outletId: e.target.value })}
            >
              <option value="">Pilih {outletLabel()}</option>
              {(outlet.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Jumlah diterima" htmlFor="p-jml" required>
            <TextInput
              id="p-jml"
              type="number"
              mono
              min={1}
              value={form.jumlah}
              onChange={(e) => setForm({ ...form, jumlah: Number(e.target.value) })}
            />
          </Field>
          <Field label="Tanggal" htmlFor="p-tgl" required>
            <TextInput
              id="p-tgl"
              type="date"
              value={form.tanggal}
              onChange={(e) => setForm({ ...form, tanggal: e.target.value })}
            />
          </Field>
          <Field label="Metode" htmlFor="p-metode" required>
            <SelectInput
              id="p-metode"
              value={method?.id ?? ""}
              onChange={(e) => setForm({ ...form, metodeId: e.target.value })}
            >
              {methodList.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nama}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Masuk ke rekening" htmlFor="p-tujuan" hint="Rekening agen yang menerima uangnya.">
            <SelectInput
              id="p-tujuan"
              value={form.rekeningTujuanId || defaultAccount?.id || ""}
              onChange={(e) => setForm({ ...form, rekeningTujuanId: e.target.value })}
            >
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.kind === "cash" ? "Kas" : a.bank} · {a.nomorRekening}
                  {a.atasNama ? ` · ${a.atasNama}` : ""}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Bank pengirim" htmlFor="p-bank">
            <SelectInput
              id="p-bank"
              value={form.bank}
              onChange={(e) => setForm({ ...form, bank: e.target.value as BankNameEntity })}
            >
              {BANKS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="No. rekening pengirim" htmlFor="p-rek">
            <TextInput
              id="p-rek"
              mono
              value={form.noRekening}
              onChange={(e) => setForm({ ...form, noRekening: e.target.value })}
            />
          </Field>
          <Field
            label="No. referensi transfer"
            htmlFor="p-ref"
            required={needsReference}
            hint="Dari bukti transfer atau mutasi rekening."
          >
            <TextInput
              id="p-ref"
              mono
              maxLength={255}
              value={form.referensi}
              onChange={(e) => setForm({ ...form, referensi: e.target.value })}
            />
          </Field>
          <Field label="Keterangan" htmlFor="p-ket">
            <TextInput
              id="p-ket"
              value={form.keterangan}
              onChange={(e) => setForm({ ...form, keterangan: e.target.value })}
            />
          </Field>
        </div>

        {form.outletId && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-ink-muted">Lunasi tagihan</span>
              <span className={cn("text-ink-muted", sisaAlokasi < 0 && "font-semibold text-rust-ink")}>
                Belum dialokasikan{" "}
                <span className="data font-semibold">{formatRupiah(sisaAlokasi)}</span>
              </span>
              <Button size="xs" variant="outline" onClick={autoApply} disabled={form.jumlah <= 0}>
                Terapkan otomatis (tertua dulu)
              </Button>
            </div>
            <div className="max-h-56 overflow-auto rounded-md border border-line">
              {(openInvoices.data ?? []).length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-ink-muted">
                  Tidak ada tagihan terbuka; penerimaan dicatat sebagai uang muka {outletLabel()}.
                </p>
              ) : (
                <table className="w-full text-left">
                  <tbody>
                    {(openInvoices.data ?? []).map((inv) => (
                      <tr key={inv.id} className="border-b border-line last:border-b-0">
                        <td className="px-3 py-1.5">
                          <span className="data block text-xs text-ink">{inv.nomor}</span>
                          <span className="data text-2xs text-ink-muted">
                            jatuh tempo {formatDateId(inv.jatuhTempo)}
                          </span>
                        </td>
                        <td className="data px-3 py-1.5 text-right text-xs text-ink">
                          {formatRupiah(inv.sisa)}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <TextInput
                            type="number"
                            mono
                            min={0}
                            max={inv.sisa}
                            aria-label={`Alokasi untuk ${inv.nomor}`}
                            className="w-28 py-1 text-right text-xs"
                            value={alokasi[inv.id] ?? ""}
                            onChange={(e) => setAlokasi({ ...alokasi, [inv.id]: Number(e.target.value) })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate(undefined as never)}
          >
            Catat penerimaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
