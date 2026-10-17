/**
 * The BAST/transportation-fee ledger, against the real API.
 *
 * `claimStatus` bucket filtering happens client-side: the server's own
 * `claim_status` filter is `eq`-only and exact, which is already what the
 * console's dropdown needs (the six wire values and the console's own
 * ClaimStatus union are the same set, unlike delivery_status/payment_status
 * elsewhere in this codebase), so no translation is needed either way.
 */
import type { RateBasis } from "../lib/rate";
import { getList, getOne, send } from "@/lib/api";
import type { ClaimStatus, ID } from "@/types/domain";
import type {
  BeritaAcaraDocument,
  ClaimFilters,
  ClaimView,
  CreateClaimInput,
  RecapFilters,
  RecapReport,
  TransportationClaimApi,
  UpdateClaimInput,
  UpdateClaimStatusInput,
} from "./contract";

/** 100 is every list definition's MaxPageSize; the server refuses more. */
const PAGE_SIZE = 100;

/** Mirrors the backend's transportationclaim.ClaimResponse. */
interface ClaimResponse {
  id: string;
  claim_number: string;
  handover_reference?: string;
  handover_date: string;
  period_start?: string;
  period_end?: string;
  claimed_amount: number;
  total_qty: number;
  total_weight_kg: number;
  principal_invoice_number?: string;
  claim_status: ClaimStatus;
  status_note?: string;
  status_updated_at?: string;
  settled_at?: string;
  settled_amount?: number;
  tax_withheld?: number;
  settlement_mode?: "cash" | "bank";
  delivery_ids?: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

function toView(row: ClaimResponse): ClaimView {
  return {
    id: row.id,
    tenantId: "",
    branchId: "",
    claimNumber: row.claim_number,
    handoverReference: row.handover_reference,
    handoverDate: row.handover_date,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    claimedAmount: row.claimed_amount,
    totalQty: row.total_qty,
    totalWeightKg: row.total_weight_kg,
    principalInvoiceNumber: row.principal_invoice_number,
    claimStatus: row.claim_status,
    statusNote: row.status_note,
    statusUpdatedAt: row.status_updated_at,
    settledAt: row.settled_at,
    settledAmount: row.settled_amount,
    taxWithheld: row.tax_withheld,
    settlementMode: row.settlement_mode,
    deliveryIds: row.delivery_ids ?? [],
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getClaims(filters?: ClaimFilters): Promise<ClaimView[]> {
  const page = await getList<ClaimResponse>("/transportation-claims", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "handover_date", direction: "desc" }],
    search: filters?.search,
    filters:
      filters?.claimStatus && filters.claimStatus !== "Semua"
        ? [{ field: "claim_status", operator: "eq" as const, value: filters.claimStatus }]
        : [],
  });
  return page.items.map(toView);
}

async function createClaim(input: CreateClaimInput): Promise<ClaimView> {
  return toView(
    await send<ClaimResponse>("post", "/transportation-claims", {
      branch_id: input.branchId,
      period: input.period,
      handover_date: input.handoverDate,
      handover_reference: input.handoverReference,
    }),
  );
}

async function updateClaim(input: UpdateClaimInput): Promise<ClaimView> {
  const body: Record<string, unknown> = { version: input.version };
  if (input.handoverReference !== undefined) body.handover_reference = input.handoverReference;
  if (input.handoverDate !== undefined) body.handover_date = input.handoverDate;
  return toView(await send<ClaimResponse>("put", `/transportation-claims/${input.id}`, body));
}

async function updateClaimStatus(input: UpdateClaimStatusInput): Promise<ClaimView> {
  return toView(
    await send<ClaimResponse>("post", `/transportation-claims/${input.id}/status`, {
      version: input.version,
      claim_status: input.claimStatus,
      principal_invoice_number: input.principalInvoiceNumber,
      status_note: input.statusNote,
      settled_at: input.settledAt,
      settled_amount: input.settledAmount,
      tax_withheld: input.taxWithheld,
      settlement_mode: input.settlementMode,
    }),
  );
}

async function deleteClaim(id: ID): Promise<void> {
  await send("delete", `/transportation-claims/${id}`);
}

async function generateLines(id: ID): Promise<ClaimView> {
  return toView(await send<ClaimResponse>("post", `/transportation-claims/${id}/lines/generate`));
}

async function generateFromSim3lon(id: ID): Promise<ClaimView> {
  return toView(await send<ClaimResponse>("post", `/transportation-claims/${id}/lines/from-sim3lon`));
}

/** Mirrors the backend's transportationclaim.BeritaAcaraResponse. */
interface BeritaAcaraResponse {
  kind?: "lo" | "deliveries";
  loading_orders?: Array<{
    no: number;
    date: string;
    lo_number: string;
    so_number?: string;
    material: string;
    qty_pcs: number;
    qty_kg: number;
    rate_per_kg: number;
    amount: number;
  }>;
  header: {
    claim_number: string;
    handover_reference?: string;
    handover_date: string;
    period_start: string;
    period_end: string;
    tenant_legal_name: string;
    tenant_address?: string;
    branch_name: string;
    claim_status: ClaimStatus;
    principal_invoice_number?: string;
  };
  groups: Array<{
    delivery_date: string;
    trip_number?: number;
    product_code: string;
    product_name: string;
    outlet_count: number;
    qty: number;
    weight_kg: number;
    rate_basis: RateBasis;
    rate: number;
    amount: number;
  }>;
  lines: Array<{
    no: number;
    delivery_date: string;
    delivery_number: string;
    outlet_code: string;
    outlet_name: string;
    product_code: string;
    qty: number;
    weight_kg: number;
    rate_basis: RateBasis;
    rate: number;
    amount: number;
    has_drift: boolean;
    current_delivered_qty?: number;
  }>;
  footer: {
    line_count: number;
    group_count: number;
    total_qty: number;
    total_weight_kg: number;
    rates: Array<{ rate_basis: RateBasis; rate: number; qty: number; weight_kg: number; amount: number }>;
    amount: number;
    sum_of_line_amounts: number;
    rounding_difference: number;
    drifted_line_count: number;
  };
  signatory: { company_name: string; name?: string; title?: string; city?: string };
}

async function getDocument(id: ID): Promise<BeritaAcaraDocument> {
  const row = await getOne<BeritaAcaraResponse>(`/transportation-claims/${id}/document`);
  return {
    kind: row.kind === "lo" ? "lo" : "deliveries",
    loadingOrders: (row.loading_orders ?? []).map((o) => ({
      no: o.no,
      date: o.date,
      loNumber: o.lo_number,
      soNumber: o.so_number,
      material: o.material,
      qtyPcs: o.qty_pcs,
      qtyKg: o.qty_kg,
      ratePerKg: o.rate_per_kg,
      amount: o.amount,
    })),
    header: {
      claimNumber: row.header.claim_number,
      handoverReference: row.header.handover_reference,
      handoverDate: row.header.handover_date,
      periodStart: row.header.period_start,
      periodEnd: row.header.period_end,
      tenantLegalName: row.header.tenant_legal_name,
      tenantAddress: row.header.tenant_address,
      branchName: row.header.branch_name,
      claimStatus: row.header.claim_status,
      principalInvoiceNumber: row.header.principal_invoice_number,
    },
    groups: row.groups.map((g) => ({
      deliveryDate: g.delivery_date,
      tripNumber: g.trip_number,
      productCode: g.product_code,
      productName: g.product_name,
      outletCount: g.outlet_count,
      qty: g.qty,
      weightKg: g.weight_kg,
      rateBasis: g.rate_basis,
      rate: g.rate,
      amount: g.amount,
    })),
    lines: row.lines.map((l) => ({
      no: l.no,
      deliveryDate: l.delivery_date,
      deliveryNumber: l.delivery_number,
      outletCode: l.outlet_code,
      outletName: l.outlet_name,
      productCode: l.product_code,
      qty: l.qty,
      weightKg: l.weight_kg,
      rateBasis: l.rate_basis,
      rate: l.rate,
      amount: l.amount,
      hasDrift: l.has_drift,
      currentDeliveredQty: l.current_delivered_qty,
    })),
    footer: {
      lineCount: row.footer.line_count,
      groupCount: row.footer.group_count,
      totalQty: row.footer.total_qty,
      totalWeightKg: row.footer.total_weight_kg,
      rates: row.footer.rates.map((r) => ({
        rateBasis: r.rate_basis,
        rate: r.rate,
        qty: r.qty,
        weightKg: r.weight_kg,
        amount: r.amount,
      })),
      amount: row.footer.amount,
      sumOfLineAmounts: row.footer.sum_of_line_amounts,
      roundingDifference: row.footer.rounding_difference,
      driftedLineCount: row.footer.drifted_line_count,
    },
    signatory: {
      companyName: row.signatory.company_name,
      name: row.signatory.name,
      title: row.signatory.title,
      city: row.signatory.city,
    },
  };
}

/** Mirrors the backend's transportationclaim.RecapResponse. */
interface RecapResponse {
  from: string;
  to: string;
  rows: Array<{
    month: string;
    claim_count: number;
    total_qty: number;
    total_weight_kg: number;
    claimed_amount: number;
    paid_amount: number;
    outstanding_amount: number;
    avg_days_to_settle?: number;
  }>;
  totals: {
    claim_count: number;
    total_qty: number;
    total_weight_kg: number;
    claimed_amount: number;
    paid_amount: number;
    outstanding_amount: number;
  };
}

async function getRecap(filters?: RecapFilters): Promise<RecapReport> {
  const params = new URLSearchParams();
  if (filters?.from) params.set("from", filters.from);
  if (filters?.to) params.set("to", filters.to);
  if (filters?.branchId) params.set("branch", filters.branchId);
  const qs = params.toString();
  const row = await getOne<RecapResponse>(`/transportation-claims/recap${qs ? `?${qs}` : ""}`);
  return {
    from: row.from,
    to: row.to,
    rows: row.rows.map((r) => ({
      month: r.month,
      claimCount: r.claim_count,
      totalQty: r.total_qty,
      totalWeightKg: r.total_weight_kg,
      claimedAmount: r.claimed_amount,
      paidAmount: r.paid_amount,
      outstandingAmount: r.outstanding_amount,
      avgDaysToSettle: r.avg_days_to_settle,
    })),
    totals: {
      claimCount: row.totals.claim_count,
      totalQty: row.totals.total_qty,
      totalWeightKg: row.totals.total_weight_kg,
      claimedAmount: row.totals.claimed_amount,
      paidAmount: row.totals.paid_amount,
      outstandingAmount: row.totals.outstanding_amount,
    },
  };
}

export const transportationApiHttp: TransportationClaimApi = {
  getClaims,
  createClaim,
  updateClaim,
  updateClaimStatus,
  deleteClaim,
  generateLines,
  generateFromSim3lon,
  getDocument,
  getRecap,
};
