/**
 * Approvals against the real API: /void-requests and /payment-refunds.
 */
import { getOne, send } from "@/lib/api";
import type {
  ApprovalsApi, Decision, DecisionInput, NewRefund, NewVoidRequest, Refund, RequestStatus,
  VoidDocumentType, VoidRequest,
} from "./contract";

interface DecisionResponse {
  status: RequestStatus;
  requested_by?: string;
  requested_at: string;
  requested_by_me: boolean;
  decided_by?: string;
  decided_at?: string;
  decision_note?: string;
  evidence_count: number;
  version: number;
}

interface VoidRequestResponse extends DecisionResponse {
  id: string;
  document_type: VoidDocumentType;
  document_id: string;
  parent_id?: string;
  document_number: string;
  reason: string;
}

interface RefundResponse extends DecisionResponse {
  id: string;
  refund_number: string;
  refund_date: string;
  amount: number;
  payment_id: string;
  payment_number: string;
  outlet_name: string;
  bank_account_id?: string;
  bank_account_name?: string;
  reason: string;
}

function toDecision(r: DecisionResponse): Decision {
  return {
    status: r.status,
    requestedBy: r.requested_by,
    requestedAt: r.requested_at,
    requestedByMe: r.requested_by_me,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
    evidenceCount: r.evidence_count,
    version: r.version,
  };
}

export function toVoidRequest(r: VoidRequestResponse): VoidRequest {
  return {
    ...toDecision(r),
    id: r.id,
    documentType: r.document_type,
    documentId: r.document_id,
    parentId: r.parent_id,
    documentNumber: r.document_number,
    reason: r.reason,
  };
}

export function toRefund(r: RefundResponse): Refund {
  return {
    ...toDecision(r),
    id: r.id,
    refundNumber: r.refund_number,
    refundDate: r.refund_date,
    amount: r.amount,
    paymentId: r.payment_id,
    paymentNumber: r.payment_number,
    outletName: r.outlet_name,
    bankAccountId: r.bank_account_id,
    bankAccountName: r.bank_account_name,
    reason: r.reason,
  };
}

function query(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}

function decisionBody(input: DecisionInput): Record<string, unknown> {
  const body: Record<string, unknown> = { version: input.version };
  if (input.note?.trim()) body.note = input.note.trim();
  return body;
}

async function listVoidRequests(filter: { status?: RequestStatus; documentId?: string } = {}): Promise<VoidRequest[]> {
  const rows = await getOne<VoidRequestResponse[]>(
    `/void-requests${query({ status: filter.status, document_id: filter.documentId })}`,
  );
  return (rows ?? []).map(toVoidRequest);
}

async function requestVoid(input: NewVoidRequest): Promise<VoidRequest> {
  return toVoidRequest(await send<VoidRequestResponse>("post", "/void-requests", {
    document_type: input.documentType,
    document_id: input.documentId,
    parent_id: input.parentId,
    version: input.version,
    reason: input.reason,
  }));
}

async function decideVoid(id: string, action: "approve" | "reject" | "cancel", input: DecisionInput): Promise<VoidRequest> {
  return toVoidRequest(await send<VoidRequestResponse>("post", `/void-requests/${id}/${action}`, decisionBody(input)));
}

async function listRefunds(filter: { status?: RequestStatus; paymentId?: string } = {}): Promise<Refund[]> {
  const rows = await getOne<RefundResponse[]>(
    `/payment-refunds${query({ status: filter.status, payment_id: filter.paymentId })}`,
  );
  return (rows ?? []).map(toRefund);
}

async function requestRefund(input: NewRefund): Promise<Refund> {
  return toRefund(await send<RefundResponse>("post", "/payment-refunds", {
    payment_id: input.paymentId,
    amount: input.amount,
    refund_date: input.refundDate,
    bank_account_id: input.bankAccountId,
    reason: input.reason,
  }));
}

async function decideRefund(id: string, action: "approve" | "reject" | "cancel", input: DecisionInput): Promise<Refund> {
  return toRefund(await send<RefundResponse>("post", `/payment-refunds/${id}/${action}`, decisionBody(input)));
}

export const approvalsApiHttp: ApprovalsApi = {
  listVoidRequests, requestVoid, decideVoid, listRefunds, requestRefund, decideRefund,
};
