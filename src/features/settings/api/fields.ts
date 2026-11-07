import type { SettingsEntity } from "@/types/domain";

/**
 * Fields a tenant inherits from its parent when it has not set them.
 *
 * The list follows the backend's `iam.tenant_settings` columns exactly, because
 * an inheritance badge is a promise about behaviour — showing one for a field
 * the API cannot carry would be a lie.
 *
 *   unit_term / outlet_term / supplier_term   -> istilah
 *   operating_hours_start / _end              -> jamOperasional*
 *   working_days, stop_duration_minutes,
 *   planning_lead_time_days, geofence_radius_m,
 *   record_driver_location                    -> operasi
 *
 * # Two fields that were on this list and should not have been
 *
 * `zonaWaktu` is `iam.tenant_profiles.timezone`, and profiles NEVER inherit — a
 * legal entity's timezone belongs with its registered address, not with how it
 * happens to work. The console was offering to inherit it while the backend
 * refused to, which is the two disagreeing about a rule rather than a value.
 *
 * `targetHarian` is `daily_target_qty` (since 2026-11-02), inherited per
 * column like the others.
 */
export const INHERITABLE_FIELDS = [
  "jamOperasionalMulai",
  "jamOperasionalSelesai",
  "targetHarian",
  "istilah",
  "operasi",
] as const satisfies readonly (keyof SettingsEntity)[];

export type InheritableFieldKey = (typeof INHERITABLE_FIELDS)[number];
