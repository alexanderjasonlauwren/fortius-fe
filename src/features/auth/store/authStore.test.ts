// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";

const session = vi.fn();
vi.mock("@/features/auth/api/authApi", () => ({
  authApi: { session: (...args: unknown[]) => session(...args) },
}));

const { useAuthStore, sessionMayStillBeValid } = await import("./authStore");

const signedIn = () => {
  localStorage.setItem("auth_token", "access");
  localStorage.setItem("refresh_token", "refresh");
  useAuthStore.setState({ token: "access", isAuthenticated: true, user: null, sessionUnavailable: false });
};

beforeEach(() => {
  session.mockReset();
  localStorage.clear();
});

// Round 1 G15: a reload while the API answered 429 or 5xx signed the
// person out, for everyone behind the office's one address at once.
describe("restore", () => {
  it.each([
    ["rate limited", new ApiError({ message: "busy", code: "RATE_LIMITED", status: 429 })],
    ["a server failure", new ApiError({ message: "down", code: "INTERNAL_ERROR", status: 502 })],
    ["no network", new ApiError({ message: "Network Error", code: "NETWORK" })],
  ])("keeps the session when the server was %s", async (_why, error) => {
    signedIn();
    session.mockRejectedValue(error);
    await useAuthStore.getState().restore();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.sessionUnavailable).toBe(true);
    expect(localStorage.getItem("auth_token")).toBe("access");
  });

  it.each([
    ["the session was refused", new ApiError({ message: "expired", code: "UNAUTHORIZED", status: 401 })],
    ["the account may not sign in", new ApiError({ message: "no", code: "FORBIDDEN", status: 403 })],
    ["there was no token", new Error("Sesi tidak ditemukan")],
  ])("signs out when %s", async (_why, error) => {
    signedIn();
    session.mockRejectedValue(error);
    await useAuthStore.getState().restore();
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.sessionUnavailable).toBe(false);
    expect(localStorage.getItem("auth_token")).toBeNull();
  });

  it("clears the unavailable state once the session reads again", async () => {
    signedIn();
    useAuthStore.setState({ sessionUnavailable: true });
    session.mockResolvedValue({ user: { id: "u", permissions: [] }, tenant: null, token: "access" });
    await useAuthStore.getState().restore();
    expect(useAuthStore.getState().sessionUnavailable).toBe(false);
  });
});

it("treats a 4xx other than 429 as the session's answer", () => {
  expect(sessionMayStillBeValid(new ApiError({ message: "x", code: "BAD_REQUEST", status: 400 }))).toBe(false);
});
