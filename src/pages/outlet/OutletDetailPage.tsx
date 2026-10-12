import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Printer,
  ShieldAlert,
  Truck,
  UserRound,
} from "lucide-react";
import {
  getOutletDetail,
  getOutletHistory,
} from "@/features/outlet/api/outletApi";
import {
  createOutletWarning,
  getOutletWarnings,
  type OutletWarningView,
} from "@/features/outletwarnings/api/outletWarningApi";
import { printSuratJalan } from "@/features/monitoring/api/monitoringApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Meter, Skeleton } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import { EmptyState } from "@/components/common/EmptyState";
import { Field, TextInput, TextareaInput } from "@/components/common/Field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  formatDateId,
  formatNumber,
  formatPercentId,
  formatRupiah,
} from "@/lib/format";
import { outletLabel, outletLabelTitle, unitLabel } from "@/lib/lexicon";

type HistoryRow = Awaited<ReturnType<typeof getOutletHistory>>[number];

export function OutletDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const detail = useQuery({
    queryKey: [...scopeKey(), "outlet-detail", id],
    queryFn: () => getOutletDetail(id),
  });

  const history = useQuery({
    queryKey: [...scopeKey(), "outlet-history", id],
    queryFn: () => getOutletHistory(id, 12),
  });

  const printMutation = useDeskMutation({
    mutationFn: (deliveryId: string) => printSuratJalan(deliveryId),
    errorTitle: "Cetak surat jalan gagal",
  });

  const warnings = useQuery({
    queryKey: [...scopeKey(), "outlet-warnings", id],
    queryFn: () => getOutletWarnings(id),
  });

  const [recordingWarning, setRecordingWarning] = useState(false);
  const [warningReason, setWarningReason] = useState("");
  const [warningNotes, setWarningNotes] = useState("");
  const [warningDate, setWarningDate] = useState(() => new Date().toISOString().slice(0, 10));

  const createWarningMutation = useDeskMutation({
    mutationFn: () =>
      createOutletWarning({
        outletId: id,
        issuedOn: warningDate,
        reason: warningReason,
        notes: warningNotes || undefined,
      }),
    errorTitle: "SP tidak tercatat",
    success: "SP tercatat",
    onDone: () => {
      setRecordingWarning(false);
      setWarningReason("");
      setWarningNotes("");
      setWarningDate(new Date().toISOString().slice(0, 10));
    },
  });

  const warningColumns: Column<OutletWarningView>[] = [
    {
      key: "issuedOn",
      header: "Tanggal",
      render: (row) => <span className="data text-ink">{formatDateId(row.issuedOn)}</span>,
      sortValue: (row) => row.issuedOn,
    },
    {
      key: "reason",
      header: "Alasan",
      render: (row) => <span className="text-ink">{row.reason}</span>,
    },
    {
      key: "notes",
      header: "Catatan",
      render: (row) => <span className="text-ink-muted">{row.notes || "—"}</span>,
    },
  ];

  const columns: Column<HistoryRow>[] = [
    {
      key: "kode",
      header: "Surat jalan",
      render: (row) => <span className="data text-xs text-ink">{row.kode}</span>,
      sortValue: (row) => row.kode,
    },
    {
      key: "tanggal",
      header: "Tanggal",
      render: (row) => (
        <span className="text-ink-muted">
          {formatDateId(row.tanggal)} <span className="data">{row.jam}</span>
        </span>
      ),
      sortValue: (row) => `${row.tanggal}${row.jam}`,
    },
    {
      key: "driver",
      header: "Driver",
      render: (row) => <span className="text-ink-muted">{row.driver}</span>,
      sortValue: (row) => row.driver,
    },
    {
      key: "muatan",
      header: "Realisasi / target",
      align: "right",
      render: (row) => (
        <span className="data text-ink">
          {formatNumber(row.realisasi)}
          <span className="text-ink-muted"> / {formatNumber(row.target)}</span>
        </span>
      ),
      sortValue: (row) => row.realisasi,
    },
    {
      key: "status",
      header: "Status",
      width: "8rem",
      render: (row) => (
        <StatusBadge variant={getStatusVariant(row.status)} label={row.status} />
      ),
    },
    {
      key: "aksi",
      header: "",
      align: "right",
      width: "1%",
      render: (row) => (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => printMutation.mutate(row.id)}
          disabled={printMutation.isPending}
        >
          <Printer className="h-3 w-3" />
          Cetak
        </Button>
      ),
    },
  ];

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Panel>
        <EmptyState
          icon={MapPin}
          title={`${outletLabelTitle()} tidak ditemukan`}
          description={`Data mungkin sudah dihapus. Kembali ke daftar untuk memilih ${outletLabel()} lain.`}
          action={
            <Button asChild size="sm">
              <Link to="/outlet">Ke daftar outlet</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  const p = detail.data;
  const kuotaPakai = p.kuotaBulanan === 0 ? 0 : (p.terpakaiBulanIni / p.kuotaBulanan) * 100;

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali
      </Button>

      <PageHeader
        eyebrow={`${p.kode} · Kec. ${p.kecamatan}`}
        title={p.nama}
        description={`${p.alamat}, ${p.kota}`}
        meta={<StatusBadge variant={getStatusVariant(p.status)} label={p.status} />}
        actions={
          <Button asChild variant="outline">
            <Link to={`/outlet/${p.id}/edit`}>
              <Pencil className="h-3.5 w-3.5" />
              Ubah data
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <PanelHeader title="Kuota bulan berjalan" />
          {/*
            Without deliveries there is no "terpakai", so there is no "tersisa"
            either -- only the obligation itself. Showing the meter at zero
            would report that none of this month's quota has been used, which
            is a claim about deliveries this build cannot see.
          */}
          {!p.statistikTersedia ? (
            <PanelBody className="space-y-2">
              <p className="data truncate text-figure font-semibold text-ink">
                {formatNumber(p.kuotaBulanan)}
                <span className="ml-1.5 font-sans text-sm font-medium tracking-normal text-ink-muted">
                  {unitLabel()} direncanakan
                </span>
              </p>
              <p className="text-xs text-ink-muted">
                Realisasi bulan ini belum tersedia dari layanan — surat jalan
                dicatat oleh dispatch dan belum terbaca di sini.
              </p>
            </PanelBody>
          ) : (
          <PanelBody className="space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="data truncate text-figure font-semibold text-ink">
                  {formatNumber(p.sisaKuota)}
                  <span className="ml-1.5 font-sans text-sm font-medium tracking-normal text-ink-muted">
                    {unitLabel()} tersisa
                  </span>
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  <span className="data">{formatNumber(p.terpakaiBulanIni)}</span> dari{" "}
                  <span className="data">{formatNumber(p.kuotaBulanan)}</span> terpakai (
                  {formatPercentId(kuotaPakai)})
                </p>
              </div>
            </div>
            <Meter
              value={p.terpakaiBulanIni}
              max={p.kuotaBulanan}
              tone={kuotaPakai > 95 ? "rust" : "signal"}
              label={`Kuota terpakai ${formatPercentId(kuotaPakai)}`}
            />
          </PanelBody>
          )}
        </Panel>

        <Panel spine={p.tagihanTertunda > 0 ? "text-signal" : undefined}>
          <PanelHeader title="Tagihan tertunda" />
          <PanelBody>
            {/*
              The invoice COUNT needs core.invoices; the AMOUNT is credit_balance
              on the outlet itself. So the money is shown in both builds and the
              count only where it is real -- a "0 faktur" beside a non-zero
              balance would be a contradiction the reader has to resolve.
            */}
            {p.statistikTersedia && (
              <p className="data truncate text-figure font-semibold text-ink">
                {formatNumber(p.tagihanTertunda)}
                <span className="ml-1.5 font-sans text-sm font-medium tracking-normal text-ink-muted">
                  faktur
                </span>
              </p>
            )}
            <p className={p.statistikTersedia ? "mt-1 text-xs text-ink-muted" : "data truncate text-figure font-semibold text-ink"}>
              {p.statistikTersedia ? (
                <>Senilai <span className="data">{formatRupiah(p.nilaiTertunda)}</span></>
              ) : (
                formatRupiah(p.nilaiTertunda)
              )}
            </p>
            {p.tagihanTertunda > 0 && (
              <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                <Link to="/payments">Verifikasi pembayaran</Link>
              </Button>
            )}
          </PanelBody>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Kontak" />
          <PanelBody className="space-y-3 text-sm">
            <p className="flex items-center gap-2.5 text-ink">
              <UserRound className="h-4 w-4 shrink-0 text-ink-muted" />
              {p.penanggungJawab || "Belum diisi"}
            </p>
            <a
              href={`tel:${p.telepon}`}
              className="flex items-center gap-2.5 text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
            >
              <Phone className="h-4 w-4 shrink-0 text-ink-muted" />
              <span className="data">{p.telepon || "—"}</span>
            </a>
            <p className="flex items-start gap-2.5 text-ink-muted">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                {p.alamat}, Kec. {p.kecamatan}, {p.kota}
                <br />
                <span className="data text-2xs">
                  {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                </span>
              </span>
            </p>
            <p className="border-t border-line pt-3 text-xs text-ink-muted">
              Terdaftar sejak <span className="data">{formatDateId(p.terdaftarPada)}</span>
              {p.pengirimanTerakhir && (
                <>
                  {" · "}pengiriman terakhir{" "}
                  <span className="data">{formatDateId(p.pengirimanTerakhir)}</span>
                </>
              )}
            </p>
          </PanelBody>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Riwayat pengiriman"
            hint="Dua belas surat jalan terakhir"
          />
          <DataTable
            columns={columns}
            data={history.data ?? []}
            isLoading={history.isLoading}
            rowKey={(row) => row.id}
            spineFor={(row) => spineFor(row.status)}
            emptyIcon={Truck}
            /*
              An unreadable history is not an empty one: a failed fetch and
              "never delivered to" are different facts, and the second should
              never be asserted by a screen that could not check.
            */
            emptyMessage={
              history.isError ? "Riwayat belum tersedia" : "Belum ada pengiriman"
            }
            emptyDescription={
              history.isError
                ? "Riwayat gagal dimuat. Coba muat ulang halaman ini."
                : `Riwayat muncul setelah ${outletLabel()} ini masuk rencana distribusi yang dikonfirmasi.`
            }
            dense
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Kontrol kredit" />
          <PanelBody className="space-y-3 text-sm">
            <p className="flex items-center justify-between text-ink">
              <span className="text-ink-muted">Plafon kredit</span>
              <span className="data">
                {p.batasKredit > 0 ? formatRupiah(p.batasKredit) : "Tidak dibatasi"}
              </span>
            </p>
            <p className="flex items-center justify-between text-ink">
              <span className="text-ink-muted">Termin pembayaran</span>
              <span className="data">
                {p.termin > 0 ? `${p.termin} hari` : "Tunai"}
              </span>
            </p>
            <p className="flex items-center justify-between border-t border-line pt-3 text-ink">
              <span className="text-ink-muted">Blokir otomatis saat jatuh tempo</span>
              <StatusBadge
                variant={p.blokirOtomatis ? "warning" : "draft"}
                label={p.blokirOtomatis ? "Aktif" : "Nonaktif"}
              />
            </p>
            <p className="text-xs text-ink-muted">
              Diubah dari halaman ubah data. Nilai ini menentukan apakah
              keberangkatan ke {outletLabel()} ini ditahan saat melebihi
              plafon atau menunggak.
            </p>
          </PanelBody>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Riwayat Surat Peringatan"
            hint="Dicatat manual -- lihat catatan performa pangkalan"
            actions={
              <CanAccess permission={PERMISSIONS.OUTLET_WARNINGS_CREATE}>
                <Button size="sm" variant="outline" onClick={() => setRecordingWarning(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Catat SP baru
                </Button>
              </CanAccess>
            }
          />
          <DataTable
            columns={warningColumns}
            data={warnings.data ?? []}
            isLoading={warnings.isLoading}
            rowKey={(row) => row.id}
            emptyIcon={ShieldAlert}
            emptyMessage="Belum ada SP"
            emptyDescription={`${outletLabel()} ini belum pernah menerima Surat Peringatan.`}
            dense
          />
        </Panel>
      </div>

      <Dialog open={recordingWarning} onOpenChange={setRecordingWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catat SP baru</DialogTitle>
            <DialogDescription>
              Surat Peringatan untuk {p.nama}. Ini adalah catatan, bukan alur
              persetujuan -- tidak dapat diubah setelah disimpan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Tanggal diterbitkan" required>
              <TextInput
                type="date"
                value={warningDate}
                onChange={(e) => setWarningDate(e.target.value)}
              />
            </Field>
            <Field label="Alasan" required>
              <TextInput
                value={warningReason}
                onChange={(e) => setWarningReason(e.target.value)}
                placeholder="Mis. Keterlambatan pembayaran berulang"
              />
            </Field>
            <Field label="Catatan" hint="Opsional">
              <TextareaInput
                value={warningNotes}
                onChange={(e) => setWarningNotes(e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecordingWarning(false)}>
              Batal
            </Button>
            <Button
              onClick={() => createWarningMutation.mutate(undefined)}
              disabled={!warningReason.trim() || !warningDate || createWarningMutation.isPending}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
