/**
 * The live SIM3LON view, as our API returns it.
 *
 * The shape mirrors the sim3lon-bridge snapshot 1:1 (see
 * fortius-backend/docs/sim3lon-live-integration.md). It is deliberately close to
 * the source rather than re-modelled into our domain vocabulary: this page's job
 * is to *reflect* SIM3LON, so keeping SIM3LON's own structure is a feature, and
 * it means a change on their side surfaces here rather than being silently
 * dropped in a mapper.
 */

export interface Wilayah {
  id: string;
  name: string;
}

export interface MatrixDayHeader {
  day: number;
  dayFlag: number;
  /** Older cached snapshots used this name for the source day marker. */
  fakultatif?: boolean;
}

export interface MatrixDayCell {
  day: number;
  dayFlag: number;
  /** Older cached snapshots used this name for the source day marker. */
  fakultatif?: boolean;
  /** SIM3LON status code for the day, or null when the day has no plan/entry. */
  status: number | null;
  qty: number;
  flag: number;
}

export interface MatrixRow {
  idRegistrasi: string;
  namaPangkalan: string;
  status: string;
  alokasi: number;
  days: MatrixDayCell[];
  totalNormal: number;
  totalFakultatif: number;
  sisaAlokasi: number;
  grandTotal: number;
}

/** perencanaan / penyaluran: pangkalan x day grid. */
export interface MatrixSection {
  label: string;
  kind: "matrix";
  days: MatrixDayHeader[];
  rows: MatrixRow[];
  recordsTotal: number;
}

/** inout-agen: Field x day grid, kept as raw rows. */
export interface GridSection {
  label: string;
  kind: "grid";
  columns: string[];
  rows: Array<Array<string | number>>;
  recordsTotal: number;
}

/** DataTables sections: arrays of objects keyed by SIM3LON's own field names. */
export interface TableSection {
  label: string;
  kind: "table";
  columns: string[];
  rows: Array<Record<string, unknown>>;
  recordsTotal: number;
}

/** A section the bridge could not fetch. Rendered as an error, never faked. */
export interface ErrorSection {
  label: string;
  error: string;
}

export type Section = MatrixSection | GridSection | TableSection | ErrorSection;

export function isErrorSection(s: Section): s is ErrorSection {
  return (s as ErrorSection).error !== undefined;
}

export interface Sim3lonSnapshot {
  /** null until the first sync — the "nothing pulled yet" state. */
  syncedAt: string | null;
  period: string;
  /** null until the first sync. */
  wilayah: Wilayah | null;
  /** Keyed by section id: perencanaan, penyaluran, penerimaan-agen, ... Empty until synced. */
  sections: Record<string, Section>;
}

/** A snapshot the backend returns before any sync has populated it. */
export function isEmptySnapshot(s: Sim3lonSnapshot): boolean {
  return !s.syncedAt || Object.keys(s.sections).length === 0;
}

export interface Sim3lonLiveApi {
  /** Cached snapshot for a period (empty = current month). */
  getSnapshot(period?: string): Promise<Sim3lonSnapshot>;
  /** Force a fresh pull from SIM3LON, then return the refreshed snapshot. */
  sync(period?: string): Promise<Sim3lonSnapshot>;
}

/** The order sections are shown in, and their display labels. */
export const SECTION_ORDER: ReadonlyArray<{ key: string; label: string }> = [
  { key: "perencanaan", label: "Perencanaan" },
  { key: "penyaluran", label: "Penyaluran" },
  { key: "penerimaan-agen", label: "Penerimaan Agen" },
  { key: "pangkalan", label: "Pangkalan" },
  { key: "pesanan", label: "Pesanan" },
  { key: "stok-harian", label: "Stok Harian" },
  { key: "harga-harian", label: "Harga Harian" },
  { key: "inout-agen", label: "In/Out Agen" },
];
