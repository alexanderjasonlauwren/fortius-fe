// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { SHELL, useDeskMutation } from "./useDeskMutation";

/**
 * Every write in the console goes through this hook, and until now every one
 * of them invalidated every query in the app.
 *
 * That default is correct and stays: the feature APIs read one shared store,
 * so verifying a payment really does change the finance page, the dashboard's
 * pending count and the notification bell at once. What these tests pin is
 * that narrowing it is *opt-in* — a global narrowing would have been a silent
 * regression across twenty screens, each going stale in its own way and none
 * of them obviously related to this file.
 */

vi.mock("./useToast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

function harness() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const spy = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, spy, wrapper };
}

describe("useDeskMutation", () => {
  // The sweep every other screen relies on -- except the shell queries under
  // every page (tenants, branches, settings, intake policy), which almost
  // never change and were most of the refetches after each write (Round 1
  // G15).
  it("invalidates everything but the shell by default", async () => {
    const { client, wrapper } = harness();
    await client.prefetchQuery({ queryKey: ["scope", "payments"], queryFn: async () => [] });
    await client.prefetchQuery({ queryKey: ["tenants", "registry"], queryFn: async () => [], meta: SHELL });
    const { result } = renderHook(
      () => useDeskMutation({ mutationFn: async () => "ok" }),
      { wrapper },
    );

    result.current.mutate(undefined as never);
    await waitFor(() => expect(client.getQueryState(["scope", "payments"])?.isInvalidated).toBe(true));
    expect(client.getQueryState(["tenants", "registry"])?.isInvalidated).toBe(false);
  });

  it("refreshes the shell too when the write changes it", async () => {
    const { client, wrapper } = harness();
    await client.prefetchQuery({ queryKey: ["tenants", "registry"], queryFn: async () => [], meta: SHELL });
    const { result } = renderHook(
      () => useDeskMutation({ mutationFn: async () => "ok", refreshesShell: true }),
      { wrapper },
    );

    result.current.mutate(undefined as never);
    await waitFor(() => expect(client.getQueryState(["tenants", "registry"])?.isInvalidated).toBe(true));
  });

  it("invalidates only the keys it was given", async () => {
    const { spy, wrapper } = harness();
    const board = ["scope", "monitoring-snapshot"];
    const { result } = renderHook(
      () =>
        useDeskMutation({
          mutationFn: async () => "ok",
          invalidate: [board],
        }),
      { wrapper },
    );

    result.current.mutate(undefined as never);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    expect(spy).toHaveBeenCalledWith({ queryKey: board });
    // Never the unscoped sweep -- that is the whole point of passing a key.
    expect(spy).not.toHaveBeenCalledWith();
  });

  /**
   * The board's key is a prefix of the query it must refresh: the query is
   * keyed [...scope, "monitoring-snapshot", dateRange] and the mutation
   * invalidates [...scope, "monitoring-snapshot"]. TanStack matches by prefix,
   * and if it did not, a status write would leave the board showing the old
   * status until the thirty-second poll came round -- which looks exactly like
   * the write having failed.
   */
  it("refreshes a query whose key merely starts with the one invalidated", async () => {
    const { client, wrapper } = harness();
    const queryKey = ["scope", "monitoring-snapshot", { from: "2026-09-07" }];

    let fetches = 0;
    await client.fetchQuery({
      queryKey,
      queryFn: async () => {
        fetches += 1;
        return fetches;
      },
    });
    expect(fetches).toBe(1);

    const { result } = renderHook(
      () =>
        useDeskMutation({
          mutationFn: async () => "ok",
          invalidate: [["scope", "monitoring-snapshot"]],
        }),
      { wrapper },
    );

    result.current.mutate(undefined as never);

    await waitFor(() => {
      expect(client.getQueryState(queryKey)?.isInvalidated).toBe(true);
    });
  });
});
