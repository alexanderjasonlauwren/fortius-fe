import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for fiscal-year close/reopen. listFiscalYears
 * gets its own test proving it reads a plain array under `data` (getOne),
 * not a paginated list (getList) -- ListFiscalYears' own usecase returns
 * []*FiscalYearResponse directly, no pagination meta.
 */

const getOne = vi.fn();
const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: vi.fn(),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const { fiscalYearApiHttp } = await import("./fiscalYearApi.http");

beforeEach(() => {
  getOne.mockReset();
  send.mockReset();
});

it("reads a plain array under data, not a paginated list", async () => {
  getOne.mockResolvedValue([
    { year: 2026, status: "closed", closed_at: "2026-12-31T00:00:00Z", version: 2, created_at: "2026-12-31T00:00:00Z", updated_at: "2026-12-31T00:00:00Z" },
  ]);
  const years = await fiscalYearApiHttp.listFiscalYears();
  expect(getOne).toHaveBeenCalledWith("/fiscal-years");
  expect(years[0]).toMatchObject({ year: 2026, status: "closed", closedAt: "2026-12-31T00:00:00Z" });
});

describe("writing", () => {
  it("posts to close a year, with no body", async () => {
    send.mockResolvedValue({ year: 2026, status: "closed", version: 1, created_at: "x", updated_at: "x" });
    await fiscalYearApiHttp.closeFiscalYear(2026);
    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe("/fiscal-years/2026/close");
    expect(body).toEqual({});
  });

  it("sends the version to reopen a year", async () => {
    send.mockResolvedValue({ year: 2026, status: "open", version: 2, created_at: "x", updated_at: "x" });
    await fiscalYearApiHttp.reopenFiscalYear(2026, 2);
    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe("/fiscal-years/2026/reopen");
    expect(body).toEqual({ version: 2 });
  });
});
