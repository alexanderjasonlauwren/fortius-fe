/**
 * What every schedule agreement adapter must provide.
 *
 * The domain shape screens read; the HTTP adapter maps the wire onto it.
 *
 * **Adapters return domain types.** The wire shape never escapes the HTTP
 * adapter — mapping there keeps every component unaware of the wire.
 */
import type {
  BaseReference,
  PlanningCutoverReport,
  QuotaSummary,
  SAImportSummary,
  SIM3LONApplied,
  SIM3LONLiveCandidate,
  SIM3LONSyncHealth,
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

  previewSIM3LON(file: File, supplierName: string, productId: string): Promise<SIM3LONPreview>;
  getSIM3LONReconciliation(batchId: string): Promise<SIM3LONReconciliationPreview>;
  applySIM3LON(batchId: string, review?: SIM3LONApplyReview): Promise<SIM3LONApplied>;
  syncLivePenyaluran(period: string): Promise<SIM3LONLiveCandidate>;
  getLivePenyaluranCandidates(period: string): Promise<SIM3LONLiveCandidate[]>;
  getSIM3LONSyncHealth(): Promise<SIM3LONSyncHealth>;
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
  /** The scoped branch's quota for one month, `YYYY-MM`: daily, then monthly. */
  getQuotaSummary(month: string): Promise<QuotaSummary>;

  /**
   * Reads the SPBE's Acuan Base SA PDF for the scoped branch and a month and
   * stores it, writing no baseline. A PDF that does not add up is refused
   * with each problem in `ApiError.violations`.
   */
  previewBaseReference(file: File, month: string): Promise<BaseReference>;
  /** Makes a previewed PDF the month's baseline, replacing any earlier one. */
  applyBaseReference(id: string): Promise<BaseReference>;
  /** The scoped branch's baseline for a month; `null` when none was uploaded. */
  getBaseReference(month: string): Promise<BaseReference | null>;

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
