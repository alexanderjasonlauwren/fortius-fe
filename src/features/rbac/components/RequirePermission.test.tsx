// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "../permissions";

const state = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/store/authStore", () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      user: { permissions: state.permissions },
      hasPermission: (code: string) => state.permissions.includes(code),
    }),
}));
import { RequireOfficeConsole } from "./RequirePermission";

afterEach(cleanup);

const driverRole = [
  PERMISSIONS.DELIVERIES_VIEW,
  PERMISSIONS.DELIVERIES_EXECUTE,
  PERMISSIONS.NOTIFICATIONS_VIEW,
  PERMISSIONS.SETTINGS_VIEW,
];

function open(permissions: string[]) {
  state.permissions = permissions;
  render(
    <MemoryRouter>
      <RequireOfficeConsole>
        <p>Profil agen</p>
      </RequireOfficeConsole>
    </MemoryRouter>,
  );
}

describe("an office-only page", () => {
  // The driver role reads the tenant for its own reasons, and the settings
  // page is gated on that same read -- so a permission check alone opened
  // the agency's profile and legal identity to every sopir.
  it("is refused to the driver console even when the grant is held", () => {
    open(driverRole);
    expect(screen.queryByText("Profil agen")).toBeNull();
    expect(screen.getByText("Halaman ini di luar akses Anda")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kembali ke halaman Anda" }).getAttribute("href")).toBe("/sopir");
  });

  it("opens for office staff", () => {
    open([PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.DISTRIBUTION_VIEW]);
    expect(screen.getByText("Profil agen")).toBeTruthy();
  });
});
