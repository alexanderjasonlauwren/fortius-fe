/**
 * What every transportation-claim adapter must provide.
 *
 * D3's own A-Step 5/7: a claim now covers a calendar month and its lines are
 * DERIVED from actual deliveries in that period -- priced against whichever
 * transport-fee tariff covered each one's own date -- not typed by hand and
 * not linked one at a time. The schema and this contract both call it a
 * "transportation claim" and a "handover reference"; every screen reading
 * this type says "BAST" -- see the plan's own decision 7 for why the words
 * split there.
 */
import type { RateBasis } from "../lib/rate";
import type { ClaimStatus, ID, TransportationClaimEntity } from "@/types/domain";

export type ClaimView = TransportationClaimEntity;

/** Indonesian display labels -- the wire/store value stays the CHECK constraint's own English word. */
export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  draft: "Draf",
  submitted: "Diserahkan",
  under_review: "Sedang Ditinjau",
  approved: "Disetujui",
  rejected: "Ditolak",
  paid: "Lunas",
};

export const CLAIM_STATUSES: ClaimStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "paid",
];

export interface ClaimFilters {
  search?: string;
  claimStatus?: ClaimStatus | "Semua";
}

/** Opens an empty draft for one billing period. No amount, no lines: generateLines derives both. */
export interface CreateClaimInput {
  branchId?: ID;
  /** YYYY-MM. The claim covers the whole calendar month. */
  period: string;
  handoverDate: string;
  handoverReference?: string;
}

export interface UpdateClaimInput {
  id: ID;
  version: number;
  handoverReference?: string;
  handoverDate?: string;
}

/**
 * Records what the agent read off iVendor. settledAt/settledAmount/settlementMode
 * are read only when claimStatus is "paid" -- all three are required together
 * on that one transition, and settledAmount + taxWithheld must equal the
 * claim's own claimedAmount: Pertamina pays net of the tax it deducts, and the
 * tax is booked to Pajak Dibayar Dimuka.
 */
export interface UpdateClaimStatusInput {
  id: ID;
  version: number;
  claimStatus: ClaimStatus;
  principalInvoiceNumber?: string;
  statusNote?: string;
  settledAt?: string;
  settledAmount?: number;
  taxWithheld?: number;
  settlementMode?: "cash" | "bank";
}

/* ── the Berita Acara document ───────────────────────────────────────────── */

export interface BeritaAcaraHeader {
  claimNumber: string;
  handoverReference?: string;
  handoverDate: string;
  periodStart: string;
  periodEnd: string;
  tenantLegalName: string;
  tenantAddress?: string;
  branchName: string;
  claimStatus: ClaimStatus;
  principalInvoiceNumber?: string;
}

/** One truck load -- the mitigation for a spreadsheet row (~560 tabung, one LO) not lining up
 * 1:1 with a delivery row (~20-40 tabung, one outlet drop): grouping by (date, trip, product)
 * collapses back to roughly the original document's own row count. tripNumber is absent when
 * the underlying plan carried no trip -- the group still appears, keyed on date and product alone. */
export interface BeritaAcaraGroup {
  deliveryDate: string;
  tripNumber?: number;
  productCode: string;
  productName: string;
  outletCount: number;
  qty: number;
  weightKg: number;
  /** Per tabung (client decision G5) or per kg; rate is in that basis. */
  rateBasis: RateBasis;
  rate: number;
  amount: number;
}

export interface BeritaAcaraLine {
  no: number;
  deliveryDate: string;
  deliveryNumber: string;
  outletCode: string;
  outletName: string;
  productCode: string;
  qty: number;
  weightKg: number;
  /** Per tabung (client decision G5) or per kg; rate is in that basis. */
  rateBasis: RateBasis;
  rate: number;
  amount: number;
  /** True when the delivery's own delivered quantity has changed since this line was generated. */
  hasDrift: boolean;
  currentDeliveredQty?: number;
}

export interface FooterRate {
  rateBasis: RateBasis;
  rate: number;
  qty: number;
  weightKg: number;
  amount: number;
}

/** amount is claimedAmount itself (round(SUM(weight_kg) x rate, 2) per rate group, computed by
 * the backend) -- not a re-sum of the already-rounded line amounts. roundingDifference is the
 * (usually tiny) gap between the two, surfaced rather than silently reconciled. */
export interface BeritaAcaraFooter {
  lineCount: number;
  groupCount: number;
  totalQty: number;
  totalWeightKg: number;
  rates: FooterRate[];
  amount: number;
  sumOfLineAmounts: number;
  roundingDifference: number;
  driftedLineCount: number;
}

export interface Signatory {
  companyName: string;
  name?: string;
  title?: string;
  city?: string;
}

/** One row of the BA LO: an LO from SIM3LON, priced per kg. */
export interface LoadingOrderLine {
  no: number;
  date: string;
  loNumber: string;
  soNumber?: string;
  material: string;
  qtyPcs: number;
  qtyKg: number;
  ratePerKg: number;
  amount: number;
}

export interface BeritaAcaraDocument {
  /** "lo": the BA LO, one line per SIM3LON LO; "deliveries": from this system's surat jalan. */
  kind: "lo" | "deliveries";
  loadingOrders: LoadingOrderLine[];
  header: BeritaAcaraHeader;
  groups: BeritaAcaraGroup[];
  lines: BeritaAcaraLine[];
  footer: BeritaAcaraFooter;
  signatory: Signatory;
}

/* ── the monthly recap ───────────────────────────────────────────────────── */

export interface RecapFilters {
  /** YYYY-MM, inclusive. Both default to a six-month trailing window ending this month. */
  from?: string;
  to?: string;
  branchId?: ID;
}

export interface RecapRow {
  month: string; // YYYY-MM
  claimCount: number;
  totalQty: number;
  totalWeightKg: number;
  claimedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  /** Absent for a month with nothing settled yet -- "no data" and "settled same day" differ. */
  avgDaysToSettle?: number;
}

export interface RecapTotals {
  claimCount: number;
  totalQty: number;
  totalWeightKg: number;
  claimedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
}

export interface RecapReport {
  from: string;
  to: string;
  rows: RecapRow[];
  totals: RecapTotals;
}

/* ── the transport fee invoice (Tahap 2) ────────────────────────────────── */

export interface TransportInvoiceBank {
  id: ID;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
}

/**
 * The invoice to Pertamina for an accepted BAST -- issued, or (from the
 * draft) the values a new one starts from, in which case `id` is absent.
 * The amount is always the claim's own: the BA LO total.
 */
export interface TransportInvoice {
  id?: ID;
  claimId: ID;
  claimNumber: string;
  claimStatus: ClaimStatus;
  invoiceNumber: string;
  invoiceDate: string;
  recipientName: string;
  recipientAddress?: string;
  /** No. PO / No. SPB of Pertamina's order. */
  orderReference?: string;
  orderDate?: string;
  /** The e-Faktur's serial number. */
  taxInvoiceNumber?: string;
  taxInvoiceDate?: string;
  description: string;
  amount: number;
  vatRate: number;
  vatAmount: number;
  total: number;
  bank?: TransportInvoiceBank;
  place?: string;
  signatory: Signatory;
  createdAt?: string;
}

export interface CreateTransportInvoiceInput {
  claimId: ID;
  invoiceNumber: string;
  invoiceDate: string;
  recipientName: string;
  recipientAddress?: string;
  orderReference?: string;
  orderDate?: string;
  taxInvoiceNumber?: string;
  taxInvoiceDate?: string;
  description: string;
  vatAmount?: number;
  bankAccountId?: ID;
  place?: string;
}

export interface TransportationClaimApi {
  getClaims(filters?: ClaimFilters): Promise<ClaimView[]>;
  createClaim(input: CreateClaimInput): Promise<ClaimView>;
  updateClaim(input: UpdateClaimInput): Promise<ClaimView>;
  updateClaimStatus(input: UpdateClaimStatusInput): Promise<ClaimView>;
  deleteClaim(id: ID): Promise<void>;
  /** (Re)derives a draft's lines from deliveries in its own period and recomputes its amount. */
  generateLines(id: ID): Promise<ClaimView>;
  /** Fills a draft from the period's LPG 3 kg LOs in SIM3LON, priced per kg (the BA LO). */
  generateFromSim3lon(id: ID): Promise<ClaimView>;
  getDocument(id: ID): Promise<BeritaAcaraDocument>;
  getRecap(filters?: RecapFilters): Promise<RecapReport>;
  /** What a new invoice for an accepted BAST starts from; 409 BAST_NOT_APPROVED / INVOICE_EXISTS. */
  getInvoiceDraft(claimId: ID): Promise<TransportInvoice>;
  createInvoice(input: CreateTransportInvoiceInput): Promise<TransportInvoice>;
  getInvoice(claimId: ID): Promise<TransportInvoice>;
  listInvoices(): Promise<TransportInvoice[]>;
}
