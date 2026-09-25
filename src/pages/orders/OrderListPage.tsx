import { scopeKey } from "@/mocks/scope";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Download,
  Plus,
  XCircle,
} from "lucide-react";
import {
  addOrdersToPlan,
  approveOrder,
  approveOrderBatch,
  createOrder,
  declineOrder,
  exportOrders,
  getOrders,
  getOrderTotals,
  getSchedulablePlans,
} from "@/features/orders/api/orderApi";
import { getOutletOptions } from "@/features/distribution/api/distributionApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { useIntakePolicy } from "@/features/distribution/hooks/useIntakePolicy";
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
import { formatDateId, formatDateTimeId, formatNumber } from "@/lib/format";
import type { OrderView } from "@/features/orders/api/orderApi";
import type { OrderStatus } from "@/mocks/types";
import { outletLabel, outletLabelTitle, unitLabel } from "@/lib/lexicon";

type Tab = OrderStatus | "Semua";
const TABS: Tab[] = ["Baru", "Disetujui", "Dijadwalkan", "Selesai", "Ditolak", "Semua"];

function todayIso(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function OrderListPage() {
  const policy = useIntakePolicy();
  const manualIntake = policy.allowsManualIntake;
  const assertManualIntake = () => {
    if (!manualIntake) throw new Error("Intake manual tidak tersedia. Gunakan alokasi SIM3LON pada Perencanaan Distribusi.");
  };
  const [tab, setTab] = useState<Tab>("Baru");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<OrderView | null>(null);
  const [alasan, setAlasan] = useState("");
  const [scheduling, setScheduling] = useState(false);
  const [planId, setPlanId] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    outletId: "",
    jumlahUnit: 100,
    tanggalDiminta: todayIso(1),
    catatan: "",
  });

  const orders = useQuery({
    queryKey: [...scopeKey(), "orders", tab, search],
    queryFn: () => getOrders({ status: tab, search }),
  });
  const totals = useQuery({ queryKey: [...scopeKey(), "order-totals"], queryFn: getOrderTotals });
  const plans = useQuery({ queryKey: [...scopeKey(), "schedulable-plans"], queryFn: getSchedulablePlans, enabled: manualIntake });
  const outlet = useQuery({
    queryKey: [...scopeKey(), "outlet-options"],
    queryFn: getOutletOptions,
    enabled: manualIntake,
  });

  const clearSelection = () => setSelected(new Set());

  const approveMutation = useDeskMutation({
    mutationFn: (id: string) => { assertManualIntake(); return approveOrder(id); },
    errorTitle: "Persetujuan gagal",
    success: (o) => ({
      title: `${o.kode} disetujui`,
      description: "Pesanan siap ditarik ke rencana distribusi.",
    }),
  });

  const batchApprove = useDeskMutation({
    mutationFn: (ids: string[]) => { assertManualIntake(); return approveOrderBatch(ids); },
    errorTitle: "Persetujuan massal gagal",
    success: (r) => ({
      title: `${r.approved} pesanan disetujui`,
      description: r.failures.length > 0 ? r.failures[0] : undefined,
      tone: r.failures.length > 0 ? "warning" : "success",
    }),
    onDone: clearSelection,
  });

  const rejectMutation = useDeskMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => {
      assertManualIntake(); return declineOrder(id, reason);
    },
    errorTitle: "Penolakan gagal",
    success: (o) => ({ title: `${o.kode} ditolak`, tone: "warning" }),
    onDone: () => {
      setRejecting(null);
      setAlasan("");
    },
  });

  const scheduleMutation = useDeskMutation({
    mutationFn: ({ plan, ids }: { plan: string; ids: string[] }) => {
      assertManualIntake(); return addOrdersToPlan(plan, ids);
    },
    errorTitle: "Penjadwalan gagal",
    success: (count) => ({
      title: `${count} pesanan masuk rencana`,
      description: "Tetapkan driver di Perencanaan Distribusi sebelum konfirmasi.",
    }),
    onDone: () => {
      setScheduling(false);
      clearSelection();
    },
  });

  const createMutation = useDeskMutation({
    mutationFn: (input: Parameters<typeof createOrder>[0]) => { assertManualIntake(); return createOrder(input); },
    errorTitle: "Pesanan tidak tercatat",
    success: (o) => ({ title: `Pesanan ${o.kode} dicatat` }),
    onDone: () => setCreating(false),
  });

  const exportMutation = useDeskMutation({
    mutationFn: () => exportOrders(tab),
    errorTitle: "Unduh gagal",
    success: (count) => ({
      title: "Berkas CSV diunduh",
      description: `${count} pesanan diekspor.`,
    }),
  });

  const rows = useMemo(() => orders.data ?? [], [orders.data]);
  const selectableStatus = tab === "Disetujui" ? "Disetujui" : "Baru";
  const selectable = useMemo(
    () => rows.filter((o) => o.status === selectableStatus),
    [rows, selectableStatus],
  );
  const chosen = selectable.filter((o) => selected.has(o.id));
  const allChosen = selectable.length > 0 && chosen.length === selectable.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns: Column<OrderView>[] = [
    {
      key: "pilih",
      header: "",
      width: "1%",
      render: (row) =>
        manualIntake && row.status === selectableStatus ? (
          <input
            type="checkbox"
            aria-label={`Pilih ${row.kode}`}
            checked={selected.has(row.id)}
            onChange={() => toggle(row.id)}
            className="h-3.5 w-3.5 accent-[rgb(var(--ink))]"
          />
        ) : null,
    },
    {
      key: "kode",
      header: "Kode",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{row.kode}</span>
          <span className="data block text-2xs text-ink-muted">
            {formatDateTimeId(row.tanggalMasuk)}
          </span>
        </>
      ),
      sortValue: (row) => row.tanggalMasuk,
    },
    {
      key: outletLabel(),
      header: outletLabelTitle(),
      render: (row) => (
        <>
          <Link
            to={`/outlet/${row.outletId}`}
            className="block font-medium text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
          >
            {row.outlet}
          </Link>
          <span className="block text-xs text-ink-muted">Kec. {row.kecamatan}</span>
        </>
      ),
      sortValue: (row) => row.outlet,
    },
    {
      key: "jumlah",
      header: "Diminta",
      align: "right",
      render: (row) => (
        <>
          <span className="data block font-semibold text-ink">
            {formatNumber(row.jumlahUnit)}
          </span>
          <span
            className={cn(
              "block text-2xs",
              row.jumlahUnit > row.sisaKuotaOutlet
                ? "font-semibold text-rust-ink"
                : "text-ink-muted",
            )}
          >
            sisa kuota {formatNumber(row.sisaKuotaOutlet)}
          </span>
        </>
      ),
      sortValue: (row) => row.jumlahUnit,
    },
    {
      key: "diminta",
      header: "Untuk tanggal",
      render: (row) => (
        <span className="data text-xs text-ink-muted">
          {formatDateId(row.tanggalDiminta)}
        </span>
      ),
      sortValue: (row) => row.tanggalDiminta,
    },
    {
      key: "status",
      header: "Status",
      width: "10rem",
      render: (row) => (
        <>
          <StatusBadge variant={getStatusVariant(row.status)} label={row.status} />
          {row.kodeRencana && (
            <span className="data mt-1 block text-2xs text-ink-muted">
              {row.kodeRencana}
            </span>
          )}
          {row.catatan && (
            <span className="mt-1 block max-w-[12rem] text-2xs leading-snug text-ink-muted">
              {row.catatan}
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
      render: (row) =>
        manualIntake && row.status === "Baru" ? (
          <div className="flex items-center justify-end gap-1">
            <Button
              size="xs"
              onClick={() => approveMutation.mutate(row.id)}
              disabled={approveMutation.isPending}
            >
              <CheckCircle2 className="h-3 w-3" />
              Setujui
            </Button>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => setRejecting(row)}
              className="hover:bg-rust-soft hover:text-rust-ink"
            >
              <XCircle className="h-3 w-3" />
              Tolak
            </Button>
          </div>
        ) : (
          <span className="text-2xs text-ink-muted">{row.diprosesOleh ?? "—"}</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasi harian"
        title={`${manualIntake ? "Pesanan" : "Histori Pesanan"} ${outletLabelTitle()}`}
        description={manualIntake ? `Permintaan yang masuk dari ${outletLabel()}. Pesanan yang disetujui dapat ditarik langsung ke rencana distribusi.` : "Histori pesanan lama hanya dapat dibaca. Alokasi SIM3LON ditinjau melalui Perencanaan Distribusi."}
        actions={
          <>
            <Button variant="outline" onClick={() => exportMutation.mutate(undefined as never)}>
              <Download className="h-3.5 w-3.5" />
              Unduh CSV
            </Button>
            {manualIntake ? <Button
              onClick={() => {
                setForm((f) => ({
                  ...f,
                  outletId: outlet.data?.[0]?.id ?? "",
                }));
                setCreating(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Catat pesanan
            </Button> : null}
          </>
        }
      />

      {!manualIntake ? <div className="rounded-lg border border-line bg-panel px-5 py-3 text-sm text-ink-muted" role="status">
        {policy.isError ? <>Kebijakan sumber pesanan belum tersedia. Intake manual dinonaktifkan. <Button size="sm" variant="outline" onClick={() => void policy.refetch()}>Coba lagi</Button></> : policy.isPending ? "Memuat kebijakan sumber pesanan; intake manual belum tersedia." : <>Pesanan mengikuti SIM3LON. <Link className="text-ink underline" to="/distribution">Buka Perencanaan Distribusi</Link>.</>}
      </div> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Menunggu persetujuan"
          value={formatNumber(totals.data?.baru ?? 0)}
          hint={`${formatNumber(totals.data?.baruUnit ?? 0)} ${unitLabel()} diminta`}
          tone={totals.data && totals.data.baru > 0 ? "signal" : undefined}
        />
        <Stat
          label="Disetujui, belum dijadwalkan"
          value={formatNumber(totals.data?.disetujui ?? 0)}
          hint={`${formatNumber(totals.data?.disetujuiUnit ?? 0)} ${unitLabel()} siap dijadwalkan`}
        />
        <Stat label="Dijadwalkan" value={formatNumber(totals.data?.dijadwalkan ?? 0)} />
        <Stat label="Selesai" value={formatNumber(totals.data?.selesai ?? 0)} tone="pine" />
      </div>

      <Panel>
        <PanelHeader
          title="Daftar pesanan"
          hint={`${rows.length} baris ditampilkan`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={`Kode atau ${outletLabel()}`}
                className="w-52"
              />
              <SegmentedControl
                value={tab}
                onChange={(t) => {
                  setTab(t);
                  clearSelection();
                }}
                options={TABS.map((t) => ({ value: t, label: t }))}
              />
            </div>
          }
        />

        {manualIntake && selectable.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-panel-sunk px-5 py-2.5">
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={allChosen}
                onChange={() =>
                  setSelected(allChosen ? new Set() : new Set(selectable.map((o) => o.id)))
                }
                className="h-3.5 w-3.5 accent-[rgb(var(--ink))]"
              />
              Pilih semua ({selectable.length})
            </label>

            {chosen.length > 0 && (
              <>
                <span className="text-xs text-ink">
                  <span className="data font-semibold">{chosen.length}</span> dipilih ·{" "}
                  <span className="data">
                    {formatNumber(chosen.reduce((s, o) => s + o.jumlahUnit, 0))}
                  </span>{" "}
                  {unitLabel()}
                </span>
                <div className="ml-auto flex gap-2">
                  {selectableStatus === "Baru" ? (
                    <Button
                      size="sm"
                      disabled={batchApprove.isPending}
                      onClick={() => batchApprove.mutate(chosen.map((o) => o.id))}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Setujui {chosen.length} pesanan
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={(plans.data ?? []).length === 0}
                      title={
                        (plans.data ?? []).length === 0
                          ? "Buat rencana distribusi berstatus draf terlebih dahulu"
                          : undefined
                      }
                      onClick={() => {
                        setPlanId(plans.data?.[0]?.id ?? "");
                        setScheduling(true);
                      }}
                    >
                      <CalendarPlus className="h-3.5 w-3.5" />
                      Jadwalkan {chosen.length} pesanan
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <DataTable
          columns={columns}
          data={rows}
          isLoading={orders.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) => spineFor(row.status)}
          pageSize={12}
          defaultSortKey="kode"
          defaultSortDir="desc"
          emptyIcon={ClipboardList}
          emptyMessage="Tidak ada pesanan"
          emptyDescription={manualIntake ? "Catat pesanan yang masuk lewat telepon atau pesan, lalu setujui untuk dijadwalkan." : "Tidak ada histori pesanan untuk filter ini. Alokasi harian tersedia melalui SIM3LON."}
          emptyAction={
            manualIntake ? <Button size="sm" onClick={() => setCreating(true)}>
              Catat pesanan
            </Button> : <Link to="/distribution" className="text-sm text-ink underline">Buka Perencanaan Distribusi</Link>
          }
          dense
        />
      </Panel>

      {/* Record an order */}
      <Dialog open={manualIntake && creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Catat pesanan {outletLabel()}</DialogTitle>
            <DialogDescription>
              Untuk permintaan yang masuk lewat telepon atau WhatsApp. Pesanan
              tercatat sebagai baru dan menunggu persetujuan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Field label={outletLabelTitle()} htmlFor="pkl" required>
              <SelectInput
                id="pkl"
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

            <Field label={`Jumlah ${unitLabel()}`} htmlFor="jumlah" required>
              <TextInput
                id="jumlah"
                type="number"
                min={1}
                step="any"
                mono
                value={form.jumlahUnit}
                onChange={(e) =>
                  setForm({ ...form, jumlahUnit: Number(e.target.value) })
                }
              />
            </Field>

            <Field label="Diminta untuk tanggal" htmlFor="tanggal" required>
              <TextInput
                id="tanggal"
                type="date"
                min={todayIso()}
                value={form.tanggalDiminta}
                onChange={(e) => setForm({ ...form, tanggalDiminta: e.target.value })}
              />
            </Field>

            <Field label="Catatan" htmlFor="catatan">
              <TextareaInput
                id="catatan"
                rows={2}
                placeholder="Contoh: mohon kirim sebelum pukul 10.00."
                value={form.catatan}
                onChange={(e) => setForm({ ...form, catatan: e.target.value })}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Batal
            </Button>
            <Button
              disabled={!form.outletId || createMutation.isPending}
              onClick={() => createMutation.mutate(form)}
            >
              Catat pesanan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Schedule into a plan */}
      <Dialog open={manualIntake && scheduling} onOpenChange={setScheduling}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Jadwalkan {chosen.length} pesanan</DialogTitle>
            <DialogDescription>
              Pesanan ditambahkan sebagai titik singgah pada rencana yang dipilih.
              Menyimpan titik singgah mereservasi kuota; konfirmasi menetapkan rencana operasional.
            </DialogDescription>
          </DialogHeader>

          <Field label="Rencana distribusi" htmlFor="rencana" required>
            <SelectInput
              id="rencana"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            >
              {(plans.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.kode} — {formatDateId(p.tanggal)}
                </option>
              ))}
            </SelectInput>
          </Field>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduling(false)}>
              Batal
            </Button>
            <Button
              disabled={!planId || scheduleMutation.isPending}
              onClick={() =>
                scheduleMutation.mutate({ plan: planId, ids: chosen.map((o) => o.id) })
              }
            >
              Tambahkan ke rencana
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject */}
      <Dialog open={manualIntake && !!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak {rejecting?.kode}</DialogTitle>
            <DialogDescription>
              {rejecting?.outlet} akan melihat alasan ini pada riwayat pesanannya.
            </DialogDescription>
          </DialogHeader>

          <Field label="Alasan penolakan" htmlFor="alasan" required>
            <TextareaInput
              id="alasan"
              rows={3}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder={`Contoh: melebihi kuota bulanan ${outletLabel()}.`}
            />
          </Field>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={!alasan.trim() || rejectMutation.isPending}
              onClick={() =>
                rejecting && rejectMutation.mutate({ id: rejecting.id, reason: alasan })
              }
            >
              Tolak pesanan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "signal" | "pine";
}) {
  const spine = { signal: "spine text-signal", pine: "spine text-pine" };
  return (
    <div className={cn("rounded-md border border-line bg-panel p-4", tone && spine[tone])}>
      <p className="label text-2xs text-ink-muted">{label}</p>
      <p className="data mt-1.5 truncate text-figure font-semibold text-ink">{value}</p>
      {hint && <p className="mt-2 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
