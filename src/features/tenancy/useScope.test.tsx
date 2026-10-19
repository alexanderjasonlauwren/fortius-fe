// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getActiveScope } from "@/lib/scope";

/**
 * The acting tenant is the session's signed claim. A URL naming another tenant
 * must not become the scope: every request would still be answered for the
 * session tenant, so the console would draw one company's name over another's
 * data -- and a write would land in the tenant the user thought they had left.
 */
const session = vi.hoisted(() => ({
  tenantId: "t1",
  switchTenant: vi.fn<(id: string) => Promise<void>>(),
}));
vi.mock("@/features/auth/store/authStore", () => {
  const read = () => ({
    tenant: { id: session.tenantId, code: "", name: "" },
    user: { branchIds: [] },
    switchTenant: session.switchTenant,
  });
  const useAuthStore = (selector: (s: ReturnType<typeof read>) => unknown) => selector(read());
  useAuthStore.getState = read;
  return { useAuthStore };
});

vi.mock("@/features/auth/api/authApi", () => ({
  authApi: {
    listSwitchableTenants: () =>
      Promise.resolve([
        { id: "t1", code: "pt-salatiga", name: "PT Salatiga", level: 1, viaMembership: true },
        { id: "t2", code: "pt-pati", name: "PT Pati", level: 1, viaMembership: true },
      ]),
  },
}));

vi.mock("./tenantRegistry", () => ({
  tenantRegistry: () => [
    { id: "t1", kode: "pt-salatiga", nama: "PT Salatiga", aktif: true, indukId: null, level: 1 },
    { id: "t2", kode: "pt-pati", nama: "PT Pati", aktif: true, indukId: null, level: 1 },
  ],
  branchRegistry: () => [],
  setBranchRegistry: () => undefined,
}));

import { useScope } from "./useScope";

function wrapperAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(() => {
  session.tenantId = "t1";
  session.switchTenant.mockReset();
});

describe("useScope", () => {
  it("acts in the session tenant even when the URL names another", async () => {
    const { result } = renderHook(() => useScope(), { wrapper: wrapperAt("/dashboard?tenant=t2") });

    expect(result.current.tenant?.id).toBe("t1");
    expect(getActiveScope().actingTenantId).toBe("t1");
    expect(result.current.linkNamesOtherTenant).toBe(true);
    await waitFor(() => expect(result.current.linkTenant?.id).toBe("t2"));
  });

  it("switches only after the server re-issues the session", async () => {
    session.switchTenant.mockRejectedValueOnce(new Error("You do not have access to that tenant"));
    const { result } = renderHook(() => useScope(), { wrapper: wrapperAt("/dashboard?tenant=t1") });

    let refused: unknown;
    await act(async () => {
      try {
        await result.current.setTenant("t2");
      } catch (error) {
        refused = error;
      }
    });
    expect(refused).toBeInstanceOf(Error);
    expect(session.switchTenant).toHaveBeenCalledWith("t2");
    expect(getActiveScope().actingTenantId).toBe("t1");

    // As the real store does: the session tenant changes when the switch lands,
    // and every later render reads the scope from it.
    session.switchTenant.mockImplementationOnce(async (id) => {
      session.tenantId = id;
    });
    await act(() => result.current.setTenant("t2"));
    expect(getActiveScope().actingTenantId).toBe("t2");
  });
});
