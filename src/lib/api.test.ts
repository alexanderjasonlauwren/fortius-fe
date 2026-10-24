import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// tokens.ts keeps the session in localStorage; the suite runs in Node.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const { apiClient, setSessionExpiredHandler } = await import("./api");

function respond(config: InternalAxiosRequestConfig, status: number, data: unknown = {}, headers: Record<string, string> = {}) {
  const response = { status, statusText: String(status), data, headers, config } as AxiosResponse;
  if (status < 400) return Promise.resolve(response);
  return Promise.reject(new AxiosError(`status ${status}`, String(status), config, undefined, response));
}

/** Answers apiClient requests in order: one status per call. */
function serve(...statuses: Array<number | [number, Record<string, string>]>) {
  const calls: string[] = [];
  apiClient.defaults.adapter = (config) => {
    calls.push(`${config.method?.toUpperCase()} ${config.url}`);
    const next = statuses.shift() ?? 200;
    const [status, headers] = Array.isArray(next) ? next : [next, {}];
    return respond(config, status, { success: true, data: { ok: true } }, headers);
  };
  return calls;
}

describe("a rate limit never ends the session (regression 2026-10-24 F16)", () => {
  const expired = vi.fn();

  beforeEach(() => {
    store.clear();
    store.set("auth_token", "old");
    store.set("refresh_token", "refresh");
    expired.mockReset();
    setSessionExpiredHandler(expired);
  });
  afterEach(() => vi.restoreAllMocks());

  it("keeps the session when the silent refresh is rate-limited", async () => {
    serve(401);
    vi.spyOn(axios, "post").mockImplementation((url, _body, config) =>
      respond({ url, ...config } as InternalAxiosRequestConfig, 429) as never,
    );
    await expect(apiClient.post("/payments", {})).rejects.toBeInstanceOf(AxiosError);
    expect(expired).not.toHaveBeenCalled();
  });

  it("still ends it when the refresh itself is refused", async () => {
    serve(401);
    vi.spyOn(axios, "post").mockImplementation((url, _body, config) =>
      respond({ url, ...config } as InternalAxiosRequestConfig, 401) as never,
    );
    await expect(apiClient.post("/payments", {})).rejects.toBeInstanceOf(AxiosError);
    expect(expired).toHaveBeenCalledOnce();
  });

  it("retries a rate-limited read once, after the server's Retry-After", async () => {
    vi.useFakeTimers();
    const calls = serve([429, { "retry-after": "2" }], 200);
    const pending = apiClient.get("/profile");
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toMatchObject({ status: 200 });
    expect(calls).toEqual(["GET /profile", "GET /profile"]);
    expect(expired).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not retry a rate-limited write", async () => {
    const calls = serve(429);
    await expect(apiClient.post("/payments", {})).rejects.toBeInstanceOf(AxiosError);
    expect(calls).toEqual(["POST /payments"]);
    expect(expired).not.toHaveBeenCalled();
  });
});
