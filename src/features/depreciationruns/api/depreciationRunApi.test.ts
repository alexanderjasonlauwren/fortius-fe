import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for depreciation runs. listRuns gets its own
 * dedicated test: ListRuns never carries `lines`/`total_amount` (same
 * N+1-avoidance reasoning journal.ListJournals gives its own list read --
 * see financeApi.http.ts's own getJournals, fixed after a live "0 entri"
 * bug caught in gap-closing plan Phase C), so this adapter is written to
 * fetch each row's own detail from the start rather than repeat it.
 */

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const { depreciationRunApiHttp } = await import("./depreciationRunApi.http");

const ID = "11111111-1111-4111-8111-111111111111";

function listWire(overrides: Record<string, unknown> = {}) {
  // What ListRuns actually returns: no lines, no total.
  return { id: ID, period: "2026-10", status: "posted", total_amount: 0, lines: null, version: 1, created_at: "2026-10-07T00:00:00Z", ...overrides };
}

function detailWire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID, period: "2026-10", status: "posted", total_amount: 5_000_000,
    lines: [{ asset_id: "a-1", asset_code: "AST-VHC-001", asset_name: "Truk Isuzu", amount: 5_000_000 }],
    version: 1, created_at: "2026-10-07T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
});

it("fetches each run's own detail to recover the lines/total the list never carries", async () => {
  getList.mockResolvedValue({ items: [listWire()], pagination: { has_next: false } });
  getOne.mockResolvedValue(detailWire());

  const runs = await depreciationRunApiHttp.listRuns();

  expect(getOne).toHaveBeenCalledWith(`/depreciation-runs/${ID}`);
  expect(runs[0].totalAmount).toBe(5_000_000);
  expect(runs[0].lines).toHaveLength(1);
});

it("sorts the list by period, newest first", async () => {
  getList.mockResolvedValue({ items: [] });
  await depreciationRunApiHttp.listRuns();
  const [, params] = getList.mock.calls[0];
  expect(params.sort).toEqual([{ field: "period", direction: "desc" }]);
});

describe("writing", () => {
  it("posts a period to create a run", async () => {
    send.mockResolvedValue(detailWire());
    await depreciationRunApiHttp.createRun("2026-10");
    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe("/depreciation-runs");
    expect(body).toEqual({ period: "2026-10" });
  });

  it("sends the version to void a run", async () => {
    send.mockResolvedValue(detailWire({ status: "void" }));
    await depreciationRunApiHttp.voidRun(ID, 3);
    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe(`/depreciation-runs/${ID}/void`);
    expect(body).toEqual({ version: 3 });
  });
});
