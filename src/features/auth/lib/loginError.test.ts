import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { loginErrorMessage } from "./loginError";

const refusal = (init: Partial<ConstructorParameters<typeof ApiError>[0]>) =>
  new ApiError({ message: "Invalid credentials", code: "UNKNOWN", ...init });

describe("the login form says why signing in failed (bug #3, Round 1 G19)", () => {
  it("names a wrong email or password without saying which", () => {
    expect(loginErrorMessage(refusal({ status: 401, code: "INVALID_CREDENTIALS" }))).toBe(
      "Email/username atau kata sandi salah.",
    );
    // An older API answers 401 with no code: the same sentence, not English.
    expect(loginErrorMessage(refusal({ status: 401 }))).toBe("Email/username atau kata sandi salah.");
  });

  it("tells a throttled office how long to wait", () => {
    expect(loginErrorMessage(refusal({ status: 429, code: "TOO_MANY_REQUESTS", retryAfterSeconds: 60 }))).toBe(
      "Terlalu banyak percobaan masuk. Coba lagi dalam 60 detik.",
    );
    expect(loginErrorMessage(refusal({ status: 429 }))).toContain("Terlalu banyak percobaan");
  });

  it("names a locked or inactive account", () => {
    expect(loginErrorMessage(refusal({ status: 401, code: "ACCOUNT_LOCKED" }))).toContain("dikunci sementara");
    expect(loginErrorMessage(refusal({ status: 401, code: "ACCOUNT_INACTIVE" }))).toContain("tidak aktif");
  });

  it("does not blame the password when the server could not be reached", () => {
    expect(loginErrorMessage(refusal({ code: "NETWORK" }))).toContain("menghubungi server");
    expect(loginErrorMessage(new Error("boom"))).toContain("Periksa koneksi");
  });
});
