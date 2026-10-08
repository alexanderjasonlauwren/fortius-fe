/**
 * What every fiscal-year adapter must provide.
 *
 * Mirrors fortius-backend's internal/entities/fiscalyear package: closing
 * and reopening a book year (financial-statements plan P7.1). Gap-closing
 * plan, Phase E.
 */
import type { FiscalYearStatus } from "@/types/domain";

export type { FiscalYearStatus };

export interface FiscalYearView {
  year: number;
  status: FiscalYearStatus;
  closedAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalYearApi {
  /** Only years that have ever been closed (and possibly reopened) have a
   *  row -- a year nobody has touched yet is implicitly "open" with no
   *  entry here. See FiscalYearSection's own doc for what the console
   *  does with that. */
  listFiscalYears(): Promise<FiscalYearView[]>;
  closeFiscalYear(year: number): Promise<FiscalYearView>;
  reopenFiscalYear(year: number, version: number): Promise<FiscalYearView>;
}
