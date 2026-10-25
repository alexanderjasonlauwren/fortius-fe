import { beforeEach, describe, expect, it, vi } from "vitest";

const getOne = vi.fn();
const send = vi.fn();
const upload = vi.fn();

vi.mock("@/lib/api", () => ({
  apiClient: { defaults: { baseURL: "http://localhost:8010/api/v1" } },
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: (...args: unknown[]) => upload(...args),
}));

const api = await import("./attachmentApi");

const OWNER = "11111111-1111-4111-8111-111111111111";
const FILE = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  getOne.mockReset();
  send.mockReset();
  upload.mockReset();
});

describe("attachments", () => {
  it("addresses every call through the owning document", async () => {
    getOne.mockResolvedValue([
      { id: FILE, file_name: "nota.png", mime_type: "image/png", size_bytes: 2048, created_at: "2026-10-13T08:00:00Z" },
    ]);
    const rows = await api.listAttachments("expense", OWNER);
    expect(getOne).toHaveBeenCalledWith(`/attachments/expense/${OWNER}`);
    expect(rows).toEqual([
      { id: FILE, namaFile: "nota.png", jenis: "image/png", ukuran: 2048, diunggah: "2026-10-13T08:00:00Z" },
    ]);

    await api.deleteAttachment("expense", OWNER, FILE);
    expect(send).toHaveBeenCalledWith("delete", `/attachments/expense/${OWNER}/${FILE}`);

    const file = new File(["x"], "nota.png");
    upload.mockResolvedValue({ id: FILE, file_name: "nota.png", mime_type: "image/png", size_bytes: 1, created_at: "" });
    await api.uploadAttachment("expense", OWNER, file);
    expect(upload).toHaveBeenCalledWith(`/attachments/expense/${OWNER}`, file);
  });

  // In development the backend serves the bytes itself and answers with a
  // path; it lives at the API's origin, not under /api/v1 and not on the
  // console's own origin.
  it("resolves a development file path against the API's origin", async () => {
    getOne.mockResolvedValue({ url: "/internal/files?key=a%2Fb.png&expires=1&sig=x" });
    const url = await api.attachmentDownloadUrl("payment", OWNER, FILE);
    expect(getOne).toHaveBeenCalledWith(`/attachments/payment/${OWNER}/${FILE}/download`);
    expect(url).toBe("http://localhost:8010/internal/files?key=a%2Fb.png&expires=1&sig=x");
  });

  it("leaves a bucket's absolute presigned URL as it is", async () => {
    getOne.mockResolvedValue({ url: "https://files.example.r2.dev/t/invoices/1/x.pdf?X-Amz-Signature=abc" });
    expect(await api.attachmentDownloadUrl("invoice", OWNER, FILE)).toBe(
      "https://files.example.r2.dev/t/invoices/1/x.pdf?X-Amz-Signature=abc",
    );
  });
});
