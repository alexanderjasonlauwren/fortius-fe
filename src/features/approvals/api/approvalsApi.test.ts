import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Void requests and refunds (client answer 5) against the backend's
 * voidrequest and paymentrefund wire shapes.
 */
const getOne = vi.fn();
const send = vi.fn();
vi.mock("@/lib/api", () => ({
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
}));

const { approvalsApiHttp } = await import("./approvalsApi.http");

const DOC = "11111111-1111-4111-8111-111111111111";
const REQ = "22222222-2222-4222-8222-222222222222";

function voidWire(overrides: Record<string, unknown> = {}) {
  return {
    id: REQ, document_type: "invoice", document_id: DOC, document_number: "INV-1", document_version: 1,
    reason: "transfer dobel", status: "pending", requested_by: "Finance", requested_at: "2026-10-18T08:00:00Z",
    requested_by_me: true, evidence_count: 1, version: 1, ...overrides,
  };
}

beforeEach(() => {
  getOne.mockReset();
  send.mockReset();
});

describe("void requests", () => {
  it("asks with the document, the version read and the reason", async () => {
    send.mockResolvedValue(voidWire());
    const out = await approvalsApiHttp.requestVoid({
      documentType: "purchase_payment", documentId: DOC, parentId: "bill-1", version: 3, reason: "transfer gagal",
    });
    expect(send).toHaveBeenCalledWith("post", "/void-requests", {
      document_type: "purchase_payment", document_id: DOC, parent_id: "bill-1", version: 3, reason: "transfer gagal",
    });
    expect(out).toMatchObject({ id: REQ, documentNumber: "INV-1", requestedByMe: true, evidenceCount: 1 });
  });

  it("decides under the version read, sending a note only when there is one", async () => {
    send.mockResolvedValue(voidWire({ status: "approved" }));
    await approvalsApiHttp.decideVoid(REQ, "approve", { version: 2, note: "  " });
    await approvalsApiHttp.decideVoid(REQ, "reject", { version: 2, note: " bukan ganda " });
    expect(send.mock.calls[0]).toEqual(["post", `/void-requests/${REQ}/approve`, { version: 2 }]);
    expect(send.mock.calls[1]).toEqual(["post", `/void-requests/${REQ}/reject`, { version: 2, note: "bukan ganda" }]);
  });

  it("filters by status and document only when given", async () => {
    getOne.mockResolvedValue([voidWire()]);
    await approvalsApiHttp.listVoidRequests({ status: "pending" });
    await approvalsApiHttp.listVoidRequests();
    expect(getOne.mock.calls[0][0]).toBe("/void-requests?status=pending");
    expect(getOne.mock.calls[1][0]).toBe("/void-requests");
  });
});

describe("refunds", () => {
  it("asks for a refund of a receipt, and maps what the list shows", async () => {
    send.mockResolvedValue({
      id: REQ, refund_number: "RFD-1", refund_date: "2026-10-18", amount: 500000, payment_id: DOC,
      payment_number: "PAY-1", outlet_name: "Pangkalan Satu", reason: "dobel", status: "pending",
      requested_at: "2026-10-18T08:00:00Z", requested_by_me: true, evidence_count: 0, version: 1,
    });
    const out = await approvalsApiHttp.requestRefund({
      paymentId: DOC, amount: 500000, refundDate: "2026-10-18", reason: "dobel",
    });
    expect(send).toHaveBeenCalledWith("post", "/payment-refunds", {
      payment_id: DOC, amount: 500000, refund_date: "2026-10-18", bank_account_id: undefined, reason: "dobel",
    });
    expect(out).toMatchObject({ refundNumber: "RFD-1", amount: 500000, outletName: "Pangkalan Satu", evidenceCount: 0 });
  });
});
