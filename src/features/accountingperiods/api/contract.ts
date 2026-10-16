/**
 * The monthly period lock (accounting parity P7, client requirement §16):
 * a month is open, under review (only finance may post) or closed.
 */
export type PeriodStatus = "open" | "review" | "closed";

export interface AccountingPeriod {
  /** "YYYY-MM". */
  period: string;
  status: PeriodStatus;
  /** Closed because its fiscal year is: not movable here. */
  yearClosed: boolean;
  reason?: string;
  changedAt?: string;
  changedBy?: string;
  journals: number;
  /** 0 for a month nobody has moved yet. */
  version: number;
}

export interface AccountingPeriodApi {
  listYear(year: number): Promise<AccountingPeriod[]>;
  setStatus(period: string, input: { status: PeriodStatus; version: number; reason?: string }): Promise<AccountingPeriod>;
}

export const PERIOD_STATUS_LABEL: Record<PeriodStatus, string> = {
  open: "Terbuka",
  review: "Direview",
  closed: "Ditutup",
};
