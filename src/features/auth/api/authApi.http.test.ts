import { describe, expect, it, vi, beforeEach } from "vitest";

const send = vi.fn();
vi.mock("@/lib/api", () => ({
  getOne: vi.fn(),
  send: (...args: unknown[]) => send(...args),
  exchangeSession: vi.fn(),
}));
vi.mock("@/lib/tokens", () => ({
  setSessionTokens: vi.fn(),
  getRefreshToken: vi.fn(),
  clearSessionTokens: vi.fn(),
}));

const { authApiHttp } = await import("./authApi.http");

beforeEach(() => send.mockReset());

describe("account security", () => {
  it("changes the password with the current one; the subject is the session, never the body", async () => {
    send.mockResolvedValue(null);
    await authApiHttp.changePassword("old-secret", "new-secret-1");
    expect(send).toHaveBeenLastCalledWith("post", "/auth/change-password", {
      current_password: "old-secret",
      new_password: "new-secret-1",
    });
  });

  it("ends every session and answers how many", async () => {
    send.mockResolvedValue({ sessions_revoked: 3 });
    expect(await authApiHttp.logoutAll()).toBe(3);
    expect(send).toHaveBeenLastCalledWith("post", "/auth/logout-all");
  });
});
