import { expect, it, vi, beforeEach } from "vitest";

/** The HTTP adapter's request mapping, following bankAccountApi.test.ts's pattern. */

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();
const upload = vi.fn();

vi.mock("@/lib/api", () => ({
  apiClient: { get: vi.fn() },
  getList: (...args: unknown[]) => getList(...args),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: (...args: unknown[]) => upload(...args),
}));

const { externalstatementsApiHttp } = await import("./externalstatementsApi.http");

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
  upload.mockReset();
});

const ID = "11111111-1111-4111-8111-111111111111";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    label: "BDA FY2025",
    kind: "profit_loss",
    layout_code: "laba_rugi",
    lines: [],
    version: 1,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

it("uploads the import with the right form fields", async () => {
  upload.mockResolvedValue(wire());
  const file = new File(["x"], "bda.xlsx");
  await externalstatementsApiHttp.importStatement({
    file, label: "BDA FY2025", kind: "profit_loss", periodFrom: "2025-01-01", periodTo: "2025-12-31",
  });
  const [path, uploadedFile, field, , fields] = upload.mock.calls[0];
  expect(path).toBe("/external-statements");
  expect(uploadedFile).toBe(file);
  expect(field).toBe("file");
  expect(fields).toMatchObject({
    label: "BDA FY2025", kind: "profit_loss", period_from: "2025-01-01", period_to: "2025-12-31",
  });
});

it("reads the version before updating lines and sends it back", async () => {
  send.mockResolvedValue(wire({ version: 2 }));
  await externalstatementsApiHttp.updateLines({
    id: ID, version: 1,
    lines: [{ lineCode: "pendaftaran", parentLineCode: null, accountCode: null, label: "x", amount: 5, sortOrder: 0 }],
  });
  const [method, path, body] = send.mock.calls[0];
  expect(method).toBe("put");
  expect(path).toBe(`/external-statements/${ID}/lines`);
  expect(body.version).toBe(1);
  expect(body.lines[0]).toMatchObject({ line_code: "pendaftaran", amount: 5 });
});

it("deletes by id", async () => {
  send.mockResolvedValue(undefined);
  await externalstatementsApiHttp.deleteStatement(ID);
  expect(send.mock.calls[0]).toEqual(["delete", `/external-statements/${ID}`]);
});

it("upserts a note with the scope fields", async () => {
  send.mockResolvedValue({ layout_line_code: "laba_bersih", scope_key: "pl:2025-01-01..2025-12-31", note: "x", version: 1 });
  await externalstatementsApiHttp.upsertNote({
    layoutLineCode: "laba_bersih", scopeKey: "pl:2025-01-01..2025-12-31", externalStatementId: ID, note: "x",
  });
  const [method, path, body] = send.mock.calls[0];
  expect(method).toBe("put");
  expect(path).toBe("/statement-notes");
  expect(body).toMatchObject({ layout_line_code: "laba_bersih", external_statement_id: ID });
});
