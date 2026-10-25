// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for a real bug caught live: listPackages() never
 * carries a package's own kit items (the real backend's own ListPackages
 * passes nil rather than eager-loading every row's items for a picker
 * that only needs name/fee -- see registrationPackageApi.mock.ts's own
 * doc). Editing a package from the list row's own (item-less) data and
 * saving would silently replace its real kit with nothing. openEdit must
 * fetch the detail first.
 */

const state = vi.hoisted(() => ({
  listPackages: vi.fn(),
  getPackage: vi.fn(),
  updatePackage: vi.fn(),
  createPackage: vi.fn(),
}));

vi.mock("@/lib/scope", () => ({ scopeKey: () => ["tenant", "branch"] }));
vi.mock("@/hooks/useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/features/auth/store/authStore", () => ({
  useAuthStore: (selector: (store: { hasPermission: () => boolean }) => unknown) =>
    selector({ hasPermission: () => true }),
}));
vi.mock("@/features/registrationpackages/api/registrationPackageApi", () => ({
  listPackages: state.listPackages,
  getPackage: state.getPackage,
  createPackage: state.createPackage,
  updatePackage: state.updatePackage,
}));
vi.mock("@/features/products/api/productApi", () => ({
  getProducts: async () => [
    { id: "prd-accessory", nama: "Segel Tabung", productKind: "accessory", aktif: true },
  ],
}));

import { RegistrationPackageSection } from "./RegistrationPackageSection";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RegistrationPackageSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.listPackages.mockReset().mockResolvedValue([
    {
      id: "pkg-1", name: "Paket Standar", feeAmount: 500_000,
      isDefault: true, isActive: true,
      // The real list response's own shape: items always absent.
      items: [],
      version: 2, createdAt: "", updatedAt: "",
    },
  ]);
  state.getPackage.mockReset().mockResolvedValue({
    id: "pkg-1", name: "Paket Standar", feeAmount: 500_000,
    isDefault: true, isActive: true,
    items: [{ productId: "prd-accessory", productCode: "SEGEL-001", productName: "Segel Tabung", qty: 1 }],
    version: 2, createdAt: "", updatedAt: "",
  });
  state.updatePackage.mockReset().mockResolvedValue({});
});
afterEach(cleanup);

describe("RegistrationPackageSection editing", () => {
  it("fetches the package's own detail rather than the list row's empty items", async () => {
    setup();

    await screen.findByText("Paket Standar");
    fireEvent.click(screen.getByRole("button", { name: /Ubah paket Paket Standar/ }));

    await waitFor(() => expect(state.getPackage).toHaveBeenCalledWith("pkg-1"));
    // The kit item from the DETAIL response must be in the edit form --
    // proof the dialog populated from getPackage, not the list row.
    expect(await screen.findByDisplayValue("Segel Tabung")).toBeTruthy();
  });

  it("saving sends the item the detail fetch found, not an empty kit", async () => {
    setup();

    await screen.findByText("Paket Standar");
    fireEvent.click(screen.getByRole("button", { name: /Ubah paket Paket Standar/ }));
    await waitFor(() => expect(state.getPackage).toHaveBeenCalled());
    await screen.findByDisplayValue("Segel Tabung");

    fireEvent.click(await screen.findByRole("button", { name: "Simpan paket" }));

    await waitFor(() => expect(state.updatePackage).toHaveBeenCalled());
    const call = state.updatePackage.mock.calls[0][0];
    expect(call.items).toEqual([{ productId: "prd-accessory", qty: 1 }]);
  });
});
