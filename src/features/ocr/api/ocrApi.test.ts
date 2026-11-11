import { beforeEach, describe, expect, it, vi } from "vitest";

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();
const upload = vi.fn();
vi.mock("@/lib/api", () => ({
  apiClient: { defaults: { baseURL: "http://localhost:8010/api/v1" } },
  getList: (...args: unknown[]) => getList(...args),
  getAllPages: async (...args: unknown[]) => ({ items: (await getList(...args)).items, truncated: false }),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: (...args: unknown[]) => upload(...args),
}));

const { ocrApiHttp } = await import("./ocrApi.http");

beforeEach(() => { getList.mockReset(); getOne.mockReset(); send.mockReset(); upload.mockReset(); });

describe("ocrApiHttp", () => {
  it("takes status from the latest review and category from the archive", async () => {
    getList
      .mockResolvedValueOnce({ items: [
        { id: "ext-1", merchant_name: "SPBU", total_amount: 100000, created_at: "2026-09-13T01:00:00Z", last_status: "approved", has_file: true, expense_number: "EXP-1" },
        { id: "ext-2", created_at: "2026-09-13T01:00:00Z", last_status: "needs_review", last_note: "Total buram" },
        { id: "ext-3", created_at: "2026-09-13T01:00:00Z" },
      ] })
      .mockResolvedValueOnce({ items: [{ id: "arc-1", extraction_id: "ext-1", category: "parking", archived_at: "2026-09-13T02:00:00Z" }] });
    const [approved, review, fresh] = await ocrApiHttp.getReceipts("  spbu ");
    expect(getList.mock.calls[0][1]).toMatchObject({ search: "spbu" });
    expect(approved).toMatchObject({ status: "approved", category: "parking", hasFile: true, expenseNumber: "EXP-1" });
    expect(review).toMatchObject({ status: "needs_review", note: "Total buram", hasFile: false });
    expect(fresh.status).toBe("pending");
  });

  it("uploads only the file, with its document type when one was chosen", async () => {
    upload.mockResolvedValue({ id: "ext-9", created_at: "2026-10-14T00:00:00Z", has_file: true, file_name: "nota.png", process_status: "queued" });
    const file = new File(["x"], "nota.png", { type: "image/png" });
    const row = await ocrApiHttp.uploadReceipt({ file, documentType: "bank_transfer" });
    expect(upload).toHaveBeenCalledWith("/ocr/inbox/upload", file, "file", undefined, { document_type: "bank_transfer" });
    expect(row).toMatchObject({ id: "ext-9", hasFile: true, status: "pending", processStatus: "queued" });

    await ocrApiHttp.uploadReceipt({ file, documentType: "auto" });
    expect(upload).toHaveBeenLastCalledWith("/ocr/inbox/upload", file, "file", undefined, {});
  });

  it("maps the engine's reading, keeping the reference number as text", async () => {
    getList
      .mockResolvedValueOnce({ items: [{
        id: "ext-5", created_at: "2026-11-08T02:00:00Z", process_status: "ready", engine: "receipt-engine",
        document_type: "bank_transfer", total_amount: 776000, reference_no: "202605040622459260062192128",
        needs_review: true, review_reasons: ["Bukti transfer yang sama sudah pernah diunggah."],
        confidence: { total: "high" }, evidence: { total: "Total Bayar Rp776.000,-" },
        suggested_category: "penebusan_pangkalan", duplicate_of: "ext-1",
      }] })
      .mockResolvedValueOnce({ items: [] });
    const [row] = await ocrApiHttp.getReceipts();
    expect(row).toMatchObject({
      processStatus: "ready", documentType: "bank_transfer", referenceNo: "202605040622459260062192128",
      confidence: { total: "high" }, evidence: { total: "Total Bayar Rp776.000,-" },
      suggestedCategory: "penebusan_pangkalan", duplicateOf: "ext-1", needsReview: true,
    });
  });

  it("treats a row from a server without the engine as ready and typed", async () => {
    getList.mockResolvedValueOnce({ items: [{ id: "ext-6", created_at: "2026-11-08T02:00:00Z" }] }).mockResolvedValueOnce({ items: [] });
    const [row] = await ocrApiHttp.getReceipts();
    expect(row).toMatchObject({ processStatus: "ready", reviewReasons: [], confidence: {}, evidence: {} });
  });

  it("sends corrections with the decision, and none when nothing changed", async () => {
    send.mockResolvedValue({ extraction_id: "ext-1" });
    await ocrApiHttp.reviewReceipt({ id: "ext-1", outcome: "approved", category: "toll", corrections: { totalAmount: 7500 } });
    expect(send).toHaveBeenLastCalledWith("post", "/ocr/extractions/ext-1/verify", expect.objectContaining({
      corrections: { total_amount: 7500, merchant_name: undefined, txn_date: undefined, reference_no: undefined },
    }));
    await ocrApiHttp.reviewReceipt({ id: "ext-1", outcome: "approved", category: "toll", corrections: {} });
    expect(send.mock.calls[send.mock.calls.length - 1][2].corrections).toBeUndefined();
  });

  it("approves with a category and files the expense from the chosen account", async () => {
    send.mockResolvedValue({ extraction_id: "ext-1", archive_id: "arc-1", expense_id: "exp-1" });
    const result = await ocrApiHttp.reviewReceipt({
      id: "ext-1", outcome: "approved", category: "fuel",
      expense: { paymentMode: "bank", bankAccountId: "bank-1", incurredAt: "2026-09-13" },
    });
    expect(send).toHaveBeenCalledWith("post", "/ocr/extractions/ext-1/verify", {
      verification_status: "approved",
      category: "fuel",
      create_expense: { payment_mode: "bank", bank_account_id: "bank-1", incurred_at: "2026-09-13" },
    });
    expect(result.expenseId).toBe("exp-1");
  });

  it("sends a rejection with its note and nothing to archive or file", async () => {
    send.mockResolvedValue({ extraction_id: "ext-1" });
    await ocrApiHttp.reviewReceipt({
      id: "ext-1", outcome: "rejected", note: " Bukan nota kantor ", category: "fuel",
      expense: { paymentMode: "cash", incurredAt: "2026-09-13" },
    });
    expect(send).toHaveBeenCalledWith("post", "/ocr/extractions/ext-1/verify", {
      verification_status: "rejected", note: "Bukan nota kantor",
    });
  });

  it("resolves a development file link against the API origin", async () => {
    getOne.mockResolvedValue({ url: "/internal/files?key=a&sig=b" });
    expect(await ocrApiHttp.receiptFileUrl("ext-1")).toBe("http://localhost:8010/internal/files?key=a&sig=b");
  });
});
