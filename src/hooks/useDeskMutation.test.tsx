// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { ApiError } from "@/lib/api";
import { useDeskMutation } from "./useDeskMutation";

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

const askOldDate = vi.fn();
vi.mock("@/lib/oldDateConfirmation", () => ({ askOldDate: (...args: unknown[]) => askOldDate(...args) }));

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
  it("invalidates everything by default", async () => {
    const { spy, wrapper } = harness();
    const { result } = renderHook(
      () => useDeskMutation({ mutationFn: async () => "ok" }),
      { wrapper },
    );

    result.current.mutate(undefined as never);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    // No argument at all: the sweep every other screen relies on.
    expect(spy).toHaveBeenCalledWith();
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

// Round 1 G24: a date more than 31 days back is asked about, then the same
// write is sent again carrying the confirmation.
describe("an old document date", () => {
  const tooOld = () => new ApiError({ message: "Tanggal 01-01-2020 lebih dari 31 hari yang lalu", code: "DATE_NEEDS_CONFIRMATION", status: 409 });

  it("is sent again once the person confirms it", async () => {
    askOldDate.mockReset().mockResolvedValue(true);
    const write = vi.fn().mockRejectedValueOnce(tooOld()).mockResolvedValueOnce("saved");
    const { wrapper } = harness();
    const { result } = renderHook(() => useDeskMutation({ mutationFn: write }), { wrapper });
    result.current.mutate("form" as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(askOldDate).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("is not sent again when the person goes back to fix it", async () => {
    askOldDate.mockReset().mockResolvedValue(false);
    const write = vi.fn().mockRejectedValue(tooOld());
    const { wrapper } = harness();
    const { result } = renderHook(() => useDeskMutation({ mutationFn: write }), { wrapper });
    result.current.mutate("form" as never);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(write).toHaveBeenCalledTimes(1);
  });
});
