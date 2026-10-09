/**
 * What every schedule agreement adapter must provide.
 *
 * Same reason as `features/users/api/contract.ts`: without a contract the mock
 * and the HTTP adapter drift, and the drift shows up only in whichever screen
 * happens to read the field one of them forgot.
 *
 * **Adapters return domain types.** The wire shape never escapes the HTTP
 * adapter — mapping there is what keeps every component unaware of which source
 * it is running against.
 */
import type {
  PlanningCutoverReport,
  SAImportApplied,
  SAImportBatch,
  SAImportSummary,
  SIM3LONApplied,
  SIM3LONApplyReview,
  SIM3LONPreview,
  SIM3LONReconciliationPreview,
  SIM3LONVarianceReport,
  ScheduleAgreement,
  SAFilterParams,
  UploadSAPayload,
} from "../types";

export interface ScheduleAgreementApi {
  getSAList(filters?: SAFilterParams): Promise<ScheduleAgreement[]>;
  getSADetail(id: string): Promise<ScheduleAgreement>;
  /**
   * What the agreement's import looked like -- the raw per-outlet rows behind
   * its quota, for checking an import against the document it came from.
   * `null` for an agreement typed by hand.
   */
  getImportSummary(id: string): Promise<SAImportSummary | null>;
  uploadSA(payload: UploadSAPayload): Promise<ScheduleAgreement>;
  activateSA(id: string): Promise<ScheduleAgreement>;
  deleteSA(id: string): Promise<void>;
  /**
   * Suppliers the tenant has recorded agreements with, for the upload form's
   * datalist. Derived from existing agreements rather than a master list: the
   * backend has no supplier table, and inventing one to populate a dropdown
   * would be a table nobody maintains.
   */
  getSupplierOptions(): Promise<string[]>;

  /**
   * Reads a Base SA export and reports what applying it would do. Writes
   * nothing.
   *
   * Two calls rather than one because approving the diff is the point: a
   * `POST` that parsed and wrote in a single step would make a mistyped column
   * a month of overwritten obligations instead of a glance at a table.
   */
  parseImport(saId: string, file: File): Promise<SAImportBatch>;
  /** Writes the targets a reviewed batch describes. */
  applyImport(batchId: string): Promise<SAImportApplied>;
  previewSIM3LON(file: File, supplierName: string, productId: string): Promise<SIM3LONPreview>;
  getSIM3LONReconciliation(batchId: string): Promise<SIM3LONReconciliationPreview>;
  applySIM3LON(batchId: string, review?: SIM3LONApplyReview): Promise<SIM3LONApplied>;
  /**
   * Sets the date the default branch starts planning in the system. Earlier
   * SIM3LON days become the Base quota's opening balance. `dryRun` reports the
   * movement and blockers without writing.
   */
  setPlanningCutover(planningStartDate: string, dryRun: boolean): Promise<PlanningCutoverReport>;
  /**
   * Where the latest SIM3LON disagrees with confirmed-or-later plans, from the
   * planning start date on. Computed on every read; nothing is rewritten.
   */
  getSIM3LONVariances(productId: string, month: string): Promise<SIM3LONVarianceReport>;

  /**
   * The tenant's configured preselection for the import dialog's product
   * field, resolved through tenant_settings inheritance. `null` when
   * neither this tenant nor an ancestor has set one -- the dialog then
   * leaves the field for the user to choose, same as before this existed.
   */
  getSIM3LONDefaultProduct(): Promise<string | null>;
  /**
   * Replaces the acting tenant's own preference. `null` clears the override
   * and restores inheritance.
   */
  setSIM3LONDefaultProduct(code: string | null): Promise<string | null>;
}
