import { scopeKey } from "@/lib/scope";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, FileText, Printer } from "lucide-react";
import { getDocument, type BeritaAcaraDocument } from "@/features/transportation/api/transportationApi";
import { CLAIM_STATUS_LABEL } from "@/features/transportation/api/contract";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant } from "@/lib/status";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { formatDateId, formatRupiah } from "@/lib/format";
import { printDocument } from "@/lib/export";
import type { BeritaAcaraGroup, BeritaAcaraLine, LoadingOrderLine } from "@/features/transportation/api/contract";
import { formatRate, formatTariff } from "@/features/transportation/lib/rate";

const groupColumns: Column<BeritaAcaraGroup>[] = [
  {
    key: "tanggal",
    header: "Tanggal",
    render: (row) => <span className="data text-xs text-ink">{formatDateId(row.deliveryDate)}</span>,
    sortValue: (row) => row.deliveryDate,
  },
  {
    key: "trip",
    header: "Trip",
    render: (row) => <span className="data text-xs text-ink-muted">{row.tripNumber ?? "—"}</span>,
  },
  {
    key: "produk",
    header: "Produk",
    render: (row) => <span className="text-xs text-ink">{row.productName}</span>,
  },
  {
    key: "outlet",
    header: "Pangkalan",
    align: "right",
    render: (row) => <span className="data text-xs text-ink-muted">{row.outletCount}</span>,
  },
  {
    key: "qty",
    header: "Tabung",
    align: "right",
    render: (row) => <span className="data text-xs text-ink">{row.qty.toLocaleString("id-ID")}</span>,
  },
  {
    key: "kg",
    header: "Kg",
    align: "right",
    render: (row) => <span className="data text-xs text-ink">{row.weightKg.toLocaleString("id-ID")}</span>,
  },
  {
    key: "rate",
    header: "Tarif",
    align: "right",
    render: (row) => <span className="data text-xs text-ink-muted">{formatTariff(row.rate, row.rateBasis)}</span>,
  },
  {
    key: "amount",
    header: "Jumlah",
    align: "right",
    render: (row) => <span className="data text-xs font-semibold text-ink">{formatRupiah(row.amount)}</span>,
  },
];

const lineColumns: Column<BeritaAcaraLine>[] = [
  { key: "no", header: "No.", render: (row) => <span className="data text-xs text-ink-muted">{row.no}</span> },
  {
    key: "tanggal",
    header: "Tanggal",
    render: (row) => <span className="data text-xs text-ink">{formatDateId(row.deliveryDate)}</span>,
  },
  {
    key: "sj",
    header: "No. Surat Jalan",
    render: (row) => <span className="data text-xs text-ink-muted">{row.deliveryNumber}</span>,
  },
  {
    key: "outlet",
    header: "Pangkalan",
    render: (row) => (
      <>
        <span className="block text-xs text-ink">{row.outletName}</span>
        <span className="data block text-2xs text-ink-muted">{row.outletCode}</span>
      </>
    ),
  },
  {
    key: "qty",
    header: "Tabung",
    align: "right",
    render: (row) => (
      <span className="data text-xs text-ink">
        {row.qty.toLocaleString("id-ID")}
        {row.hasDrift && (
          <span
            className="ml-1 inline-flex items-center text-rust"
            title={`Data pengiriman berubah setelah lini dibuat -- kini ${row.currentDeliveredQty ?? "?"} tabung`}
          >
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </span>
    ),
  },
  {
    key: "amount",
    header: "Jumlah",
    align: "right",
    render: (row) => <span className="data text-xs text-ink">{formatRupiah(row.amount)}</span>,
  },
];

const loColumns: Column<LoadingOrderLine>[] = [
  { key: "no", header: "No.", render: (row) => <span className="data text-xs text-ink-muted">{row.no}</span> },
  {
    key: "tanggal",
    header: "Tanggal",
    render: (row) => <span className="data text-xs text-ink">{formatDateId(row.date)}</span>,
    sortValue: (row) => row.date,
  },
  { key: "lo", header: "Nomor DO/LO", render: (row) => <span className="data text-xs text-ink">{row.loNumber}</span> },
  { key: "so", header: "No. SO", render: (row) => <span className="data text-xs text-ink-muted">{row.soNumber ?? "—"}</span> },
  {
    key: "qty",
    header: "Tabung",
    align: "right",
    render: (row) => <span className="data text-xs text-ink">{row.qtyPcs.toLocaleString("id-ID")}</span>,
  },
  {
    key: "kg",
    header: "Kg",
    align: "right",
    render: (row) => <span className="data text-xs text-ink">{row.qtyKg.toLocaleString("id-ID")}</span>,
  },
  {
    key: "rate",
    header: "Tarif/kg",
    align: "right",
    render: (row) => <span className="data text-xs text-ink-muted">{formatRate(row.ratePerKg)}</span>,
  },
  {
    key: "amount",
    header: "Total",
    align: "right",
    render: (row) => <span className="data text-xs font-semibold text-ink">{formatRupiah(row.amount)}</span>,
  },
];

/** "MARET 2026" -- the BA LO names the month its LOs fall in. */
function periodMonth(periodStart?: string): string {
  if (!periodStart) return "";
  const d = new Date(`${periodStart}T00:00:00`);
  return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" }).toUpperCase();
}

/**
 * The BA LO as the client uploads it to Pertamina for the BAST: one row per
 * LO with its tabung, kg, Rp/kg and total, the totals, and the director's
 * signature (their March 2026 BA LO is the model).
 */
function baLoHtml(doc: BeritaAcaraDocument): string {
  const { header, footer, signatory } = doc;
  const rates = footer.rates.map((r) => formatRate(r.rate)).join(" / ");
  return `
    <div style="text-align:center">
      <h1 style="margin-bottom:2px">BERITA ACARA</h1>
      <p style="margin:0;font-weight:600">TAGIHAN TRANSPORT FEE AGEN LPG 3 KG</p>
      <p style="margin:0;font-weight:600">PERIODE BULAN ${periodMonth(header.periodStart)}</p>
      <p style="margin:0;font-weight:600">${header.tenantLegalName.toUpperCase()}</p>
    </div>
    <table style="margin-top:16px">
      <thead>
        <tr>
          <th>No.</th><th>Tanggal Pengiriman</th><th>Nomor DO/LO</th>
          <th style="text-align:right">Jumlah (Tabung)</th><th style="text-align:right">Jumlah (KG)</th>
          <th style="text-align:right">Tarif/KG (Rp)</th><th style="text-align:right">Total Rupiah</th>
        </tr>
      </thead>
      <tbody>
        ${doc.loadingOrders
          .map(
            (l) => `<tr>
              <td>${l.no}</td><td>${l.date}</td><td class="code">${l.loNumber}</td>
              <td class="num">${l.qtyPcs.toLocaleString("id-ID")}</td><td class="num">${l.qtyKg.toLocaleString("id-ID")}</td>
              <td class="num">${formatRate(l.ratePerKg)}</td><td class="num">${formatRupiah(l.amount)}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3">Total</td>
          <td class="num">${footer.totalQty.toLocaleString("id-ID")}</td>
          <td class="num">${footer.totalWeightKg.toLocaleString("id-ID")}</td>
          <td class="num">${rates}</td>
          <td class="num">${formatRupiah(footer.amount)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="sign">
      <div>${signatory.companyName}<span>${signatory.title ?? "Direktur"}</span><span style="margin-top:56px">${signatory.name ?? ""}</span></div>
    </div>`;
}

function documentHtml(doc: BeritaAcaraDocument): string {
  if (doc.kind === "lo") return baLoHtml(doc);
  const { header, footer, signatory } = doc;
  return `
    <p class="eyebrow">${header.tenantLegalName}${header.tenantAddress ? " · " + header.tenantAddress : ""}</p>
    <h1>Berita Acara Tagihan Transport Fee Agen LPG 3 Kg</h1>
    <p>Periode Bulan ${formatDateId(header.periodStart)} – ${formatDateId(header.periodEnd)}</p>
    <hr class="rule" />
    <div class="meta">
      <div>Nomor klaim<strong>${header.claimNumber}</strong></div>
      <div>No. BAST<strong>${header.handoverReference ?? "—"}</strong></div>
      <div>Tanggal serah terima<strong>${formatDateId(header.handoverDate)}</strong></div>
      <div>Cabang<strong>${header.branchName}</strong></div>
      <div>Status<strong>${CLAIM_STATUS_LABEL[header.claimStatus]}</strong></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>No.</th><th>Tanggal</th><th>No. DO/LO</th>
          <th style="text-align:right">Tabung</th><th style="text-align:right">Kg</th>
          <th style="text-align:right">Tarif</th><th style="text-align:right">Total Rupiah</th>
        </tr>
      </thead>
      <tbody>
        ${doc.lines
          .map(
            (l) => `<tr>
              <td>${l.no}</td><td>${formatDateId(l.deliveryDate)}</td><td class="code">${l.deliveryNumber}</td>
              <td class="num">${l.qty.toLocaleString("id-ID")}</td><td class="num">${l.weightKg.toLocaleString("id-ID")}</td>
              <td class="num">${formatTariff(l.rate, l.rateBasis)}</td><td class="num">${formatRupiah(l.amount)}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3">Total</td>
          <td class="num">${footer.totalQty.toLocaleString("id-ID")}</td>
          <td class="num">${footer.totalWeightKg.toLocaleString("id-ID")}</td>
          <td></td>
          <td class="num">${formatRupiah(footer.amount)}</td>
        </tr>
      </tfoot>
    </table>
    <div class="sign">
      <div>${signatory.companyName}<span>${signatory.name ?? ""}${signatory.title ? " — " + signatory.title : ""}</span></div>
    </div>`;
}

export function TransportationClaimDocumentPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const query = useQuery({
    queryKey: [...scopeKey(), "transportation-claim-document", id],
    queryFn: () => getDocument(id),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <Panel>
        <EmptyState
          icon={FileText}
          title="Klaim BAST tidak ditemukan"
          description="Data mungkin sudah dihapus. Kembali ke daftar untuk memilih yang lain."
          action={
            <Button asChild size="sm">
              <Link to="/transportation-claims">Ke daftar klaim</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  const doc = query.data;
  const { header, footer, signatory } = doc;

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali
      </Button>

      <PageHeader
        eyebrow={`${doc.kind === "lo" ? "BA LO · LO dari SIM3LON" : "Berita Acara"} · ${header.branchName}`}
        title={header.claimNumber}
        description={`Periode ${formatDateId(header.periodStart)} – ${formatDateId(header.periodEnd)}. ${header.handoverReference ? `No. BAST ${header.handoverReference}.` : "Belum ada nomor BAST."}`}
        meta={<StatusBadge variant={getStatusVariant(CLAIM_STATUS_LABEL[header.claimStatus])} label={CLAIM_STATUS_LABEL[header.claimStatus]} />}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              printDocument(`${doc.kind === "lo" ? "BA LO" : "Berita Acara"} ${header.claimNumber}`, documentHtml(doc))
            }
          >
            <Printer className="h-3.5 w-3.5" />
            Cetak
          </Button>
        }
      />

      {footer.driftedLineCount > 0 && (
        <Panel spine="text-rust">
          <PanelBody className="flex items-center gap-2 text-sm text-rust-ink">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {footer.driftedLineCount} lini pada dokumen ini datanya sudah berubah sejak dibuat --
            lihat tanda peringatan pada baris terkait. Nilai klaim tetap yang tercatat saat dibuat,
            bukan yang terbaru.
          </PanelBody>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total tabung" value={footer.totalQty.toLocaleString("id-ID")} />
        <Stat label="Total kilogram" value={footer.totalWeightKg.toLocaleString("id-ID")} unit="kg" />
        <Stat label="Nilai klaim" value={formatRupiah(footer.amount)} />
        <Stat
          label={doc.kind === "lo" ? "Jumlah LO" : "Jumlah lini"}
          value={doc.kind === "lo" ? `${footer.lineCount} LO` : `${footer.lineCount} lini / ${footer.groupCount} kelompok`}
        />
      </div>

      {/* A difference under half a rupiah is float noise from summing the
          lines, not a real gap between the total and the lines. */}
      {Math.abs(footer.roundingDifference) >= 0.5 && (
        <p className="text-xs text-ink-muted">
          Selisih pembulatan {formatRupiah(footer.roundingDifference)} antara nilai klaim
          ({formatRupiah(footer.amount)}, dihitung dari total kg &times; tarif) dan jumlah baris
          per lini ({formatRupiah(footer.sumOfLineAmounts)}) -- keduanya ditampilkan agar selisih
          terlihat, bukan didiamkan.
        </p>
      )}

      {doc.kind === "lo" && (
        <Panel>
          <PanelHeader
            title="Loading Order dari SIM3LON"
            hint={`${doc.loadingOrders.length} LO · tarif ${footer.rates.map((r) => formatTariff(r.rate, "per_kg")).join(", ")}`}
          />
          <DataTable
            columns={loColumns}
            data={doc.loadingOrders}
            isLoading={false}
            rowKey={(row) => row.loNumber}
            emptyIcon={FileText}
            emptyMessage="Belum ada LO"
            dense
          />
        </Panel>
      )}

      {doc.kind !== "lo" && (
      <Panel>
        <PanelHeader
          title="Ringkasan per muatan"
          hint="Dikelompokkan per tanggal, trip, dan produk -- satu kelompok mendekati satu muatan truk"
        />
        <DataTable
          columns={groupColumns}
          data={doc.groups}
          isLoading={false}
          rowKey={(row, i) => `${row.deliveryDate}-${row.tripNumber ?? "x"}-${row.productCode}-${i}`}
          emptyIcon={FileText}
          emptyMessage="Belum ada lini"
          emptyDescription="Buat lini klaim ini dari daftar klaim untuk melihat rinciannya di sini."
          dense
        />
      </Panel>

      )}

      {doc.kind !== "lo" && (
      <Panel>
        <PanelHeader title="Rincian per pengiriman" hint={`${doc.lines.length} baris`} />
        <DataTable
          columns={lineColumns}
          data={doc.lines}
          isLoading={false}
          rowKey={(row) => String(row.no)}
          emptyIcon={FileText}
          emptyMessage="Belum ada lini"
          dense
        />
      </Panel>
      )}

      <Panel>
        <PanelHeader title="Tanda tangan" />
        <PanelBody className="text-sm text-ink">
          <p className="font-medium">{signatory.companyName}</p>
          <p className="text-ink-muted">
            {signatory.name ? `${signatory.name}${signatory.title ? ` — ${signatory.title}` : ""}` : "Belum ada penandatangan tercatat."}
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-md border border-line bg-panel p-4">
      <p className="label text-2xs text-ink-muted">{label}</p>
      <p className="data mt-1.5 truncate text-figure font-semibold text-ink">
        {value}
        {unit && (
          <span className="ml-1.5 font-sans text-sm font-medium tracking-normal text-ink-muted">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}
