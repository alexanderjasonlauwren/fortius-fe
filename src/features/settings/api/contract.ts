/**
 * What every settings adapter must provide.
 *
 * Same reason as the users and tenancy contracts: without one the two
 * implementations drift, and the build breaks only in whichever page happens to
 * read the field that diverged.
 *
 * **Adapters return domain types.** The wire shape never escapes the HTTP
 * adapter.
 */
import type { ResolvedSettingsEntity, SettingsEntity } from "@/types/domain";
import type { InheritableFieldKey } from "./fields";

/**
 * Where dispatch-time settlement of an unfunded stop takes the outlet's
 * money from: straight into the bank, or out of Hutang Titipan where the
 * bank statement import already booked it. A stop funded through Alokasi
 * Dana always settles from its own receipt, whichever is set.
 */
export type SettlementTarget = "bank" | "customer_deposit";

export interface SettingsApi {
  /** The acting tenant's effective settings — what applies, after inheritance. */
  getSettings(): Promise<SettingsEntity>;
  /**
   * The same, with provenance: own, effective and where each inherited field
   * came from. A form needs all three — saving from `effective` alone turns
   * every inherited value into an override.
   */
  getSettingsDetail(): Promise<ResolvedSettingsEntity>;
  /** Writes ONLY the fields supplied. Absent fields keep inheriting. */
  updateSettings(patch: Partial<SettingsEntity>): Promise<SettingsEntity>;
  /** Removes an override so the field follows its parent again. */
  clearSettingOverride(field: InheritableFieldKey): Promise<void>;
  /** Where dispatch settles an unfunded stop from; see SettlementTarget. */
  getSettlementTarget(): Promise<{ own: SettlementTarget | null; effective: SettlementTarget }>;
  saveSettlementTarget(target: SettlementTarget): Promise<void>;
}
