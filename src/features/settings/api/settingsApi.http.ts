/**
 * Settings, against the real API.
 *
 * The language boundary lives here: the backend speaks English and matches its
 * own schema, the UI domain model is Indonesian.
 *
 * The three-part read maps straight across, because the backend returns exactly
 * the same shape and for the same reason — `own` carries nulls intact so a form
 * can tell "this tenant chose 07:00" from "this tenant inherited 07:00".
 */
import { getOne, send } from "@/lib/api";
import type {
  ResolvedSettingsEntity,
  SettingsEntity,
  TenantEntity,
} from "@/types/domain";
import type { InheritableFieldKey } from "./fields";
import { getActingTenant } from "@/lib/scope";
import { DEFAULT_SETTINGS } from "./defaults";

/** Mirrors the backend's SettingsPayload. Null means "inherit". */
interface SettingsPayload {
  unit_term: string | null;
  outlet_term: string | null;
  supplier_term: string | null;
  working_days: number[] | null;
  operating_hours_start: string | null;
  operating_hours_end: string | null;
  stop_duration_minutes: number | null;
  planning_lead_time_days: number | null;
  geofence_radius_m: number | null;
  record_driver_location: boolean | null;
}

interface SettingsResponse {
  own: SettingsPayload;
  effective: SettingsPayload;
  inherited_from: Record<string, { id: string; code: string; name: string }>;
}

/** "07:00:00" on the wire, "07:00" in an <input type="time">. */
const toTime = (value: string | null) => value?.slice(0, 5);

/**
 * Only the fields the backend's tenant_settings actually holds.
 *
 * The console's SettingsEntity is wider — it also carries the agency profile,
 * numbering and notification rules, which live in other tables. Those are left
 * untouched here rather than invented, so a field this endpoint does not own
 * never appears to have been answered by it.
 */
function toDomain(p: SettingsPayload): Partial<SettingsEntity> {
  const out: Partial<SettingsEntity> = {};
  if (p.unit_term || p.outlet_term || p.supplier_term) {
    out.istilah = {
      satuan: p.unit_term ?? "",
      outlet: p.outlet_term ?? "",
      pemasok: p.supplier_term ?? "",
    };
  }
  if (p.operating_hours_start) out.jamOperasionalMulai = toTime(p.operating_hours_start)!;
  if (p.operating_hours_end) out.jamOperasionalSelesai = toTime(p.operating_hours_end)!;

  // The five operational columns map 1:1 onto OperationsEntity. Present only
  // when at least one is set, so a tenant that has set none of them reports
  // `operasi` as absent — which is what lets the settings page show it as
  // inherited rather than as chosen.
  const hasOps =
    p.working_days !== null ||
    p.stop_duration_minutes !== null ||
    p.planning_lead_time_days !== null ||
    p.geofence_radius_m !== null ||
    p.record_driver_location !== null;
  if (hasOps) {
    out.operasi = {
      hariKerja: p.working_days ?? DEFAULT_SETTINGS.operasi.hariKerja,
      durasiSinggahMenit: p.stop_duration_minutes ?? DEFAULT_SETTINGS.operasi.durasiSinggahMenit,
      leadTimeHari: p.planning_lead_time_days ?? DEFAULT_SETTINGS.operasi.leadTimeHari,
      radiusGeofenceMeter: p.geofence_radius_m ?? DEFAULT_SETTINGS.operasi.radiusGeofenceMeter,
      rekamLokasi: p.record_driver_location ?? DEFAULT_SETTINGS.operasi.rekamLokasi,
    };
  }
  return out;
}

/** OperationsEntity back onto the five columns it came from. */
function opsToWire(ops: SettingsEntity["operasi"]): Partial<SettingsPayload> {
  return {
    working_days: ops.hariKerja,
    stop_duration_minutes: ops.durasiSinggahMenit,
    planning_lead_time_days: ops.leadTimeHari,
    geofence_radius_m: ops.radiusGeofenceMeter,
    record_driver_location: ops.rekamLokasi,
  };
}

function tenantPath(): string {
  const id = getActingTenant();
  if (!id) throw new Error("Tidak ada tenant aktif.");
  return `/tenants/${id}/settings`;
}

export async function getSettingsDetail(): Promise<ResolvedSettingsEntity> {
  const row = await getOne<SettingsResponse>(tenantPath());

  const inheritedFrom: ResolvedSettingsEntity["inheritedFrom"] = {};
  // The backend keys provenance by COLUMN; the console keys it by domain field,
  // and one domain field (istilah) covers three columns. A lexicon inherited in
  // part is inherited: the tenant did not choose the whole vocabulary.
  const lexiconSource =
    row.inherited_from.unit_term ??
    row.inherited_from.outlet_term ??
    row.inherited_from.supplier_term;
  if (lexiconSource) inheritedFrom.istilah = toTenant(lexiconSource);
  if (row.inherited_from.operating_hours_start)
    inheritedFrom.jamOperasionalMulai = toTenant(row.inherited_from.operating_hours_start);
  if (row.inherited_from.operating_hours_end)
    inheritedFrom.jamOperasionalSelesai = toTenant(row.inherited_from.operating_hours_end);
  // Same collapse as the lexicon: one domain field over five columns, and
  // partly inherited IS inherited — the tenant did not choose the whole set.
  const opsSource =
    row.inherited_from.working_days ??
    row.inherited_from.stop_duration_minutes ??
    row.inherited_from.planning_lead_time_days ??
    row.inherited_from.geofence_radius_m ??
    row.inherited_from.record_driver_location;
  if (opsSource) inheritedFrom.operasi = toTenant(opsSource);

  const effective = await getSettings();
  return { own: toDomain(row.own), effective, inheritedFrom };
}

function toTenant(src: { id: string; code: string; name: string }): TenantEntity {
  return {
    id: src.id,
    kode: src.code,
    nama: src.name,
    // Provenance names a tenant; it does not describe one. The rest is filled
    // from the tenants endpoint when a caller needs it.
    indukId: null,
    level: 0,
    jenisUsaha: "",
    jenis: "operasional",
    aktif: true,
  };
}

export async function getSettings(): Promise<SettingsEntity> {
  const row = await getOne<SettingsResponse>(tenantPath());
  // Merged over neutral defaults: this endpoint owns a subset of
  // SettingsEntity, and the fields it does not own must keep a renderable value
  // rather than becoming undefined.
  return { ...DEFAULT_SETTINGS, ...toDomain(row.effective) };
}

export async function updateSettings(
  patch: Partial<SettingsEntity>,
): Promise<SettingsEntity> {
  // PUT is a replacement: every inheritable field travels, and null means
  // inherit. Sending only changed fields would leave the others null and clear
  // overrides the caller never touched.
  const current = await getOne<SettingsResponse>(tenantPath());
  await send<SettingsResponse>("put", tenantPath(), {
    ...current.own,
    ...(patch.istilah && {
      unit_term: patch.istilah.satuan,
      outlet_term: patch.istilah.outlet,
      supplier_term: patch.istilah.pemasok,
    }),
    ...(patch.jamOperasionalMulai && { operating_hours_start: patch.jamOperasionalMulai }),
    ...(patch.jamOperasionalSelesai && { operating_hours_end: patch.jamOperasionalSelesai }),
    ...(patch.operasi && opsToWire(patch.operasi)),
  });
  return getSettings();
}

export async function clearSettingOverride(field: InheritableFieldKey): Promise<void> {
  const current = await getOne<SettingsResponse>(tenantPath());
  const cleared: Partial<SettingsPayload> =
    field === "istilah"
      ? { unit_term: null, outlet_term: null, supplier_term: null }
      : field === "jamOperasionalMulai"
        ? { operating_hours_start: null }
        : field === "jamOperasionalSelesai"
          ? { operating_hours_end: null }
          : field === "operasi"
            ? {
                working_days: null,
                stop_duration_minutes: null,
                planning_lead_time_days: null,
                geofence_radius_m: null,
                record_driver_location: null,
              }
            : {};
  await send<SettingsResponse>("put", tenantPath(), { ...current.own, ...cleared });
}
