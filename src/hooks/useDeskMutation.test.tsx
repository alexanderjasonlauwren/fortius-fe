// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { ApiError } from "@/lib/api";
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

// Round 4: a double click posted two vendor bills, two payments, two
// journals. The second click of a double click arrives before isPending
// disables the button, so the hook itself refuses to send it twice.
describe("useDeskMutation: a write sent twice while the first is in flight", () => {
  function slowWrite() {
    const calls: unknown[] = [];
    let finish: (value: string) => void = () => {};
    const mutationFn = vi.fn((args: unknown) => {
      calls.push(args);
      return new Promise<string>((resolve) => { finish = resolve; });
    });
    return { calls, mutationFn, finish: (value: string) => finish(value) };
  }

  it("sends the same write once, and tells both callers the one outcome", async () => {
    const { wrapper } = harness();
    const write = slowWrite();
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useDeskMutation({ mutationFn: write.mutationFn, onDone: onSuccess }), { wrapper });

    result.current.mutate({ supplier: "UJI-R4", amount: 50000 });
    result.current.mutate({ supplier: "UJI-R4", amount: 50000 });
    const joined = result.current.mutateAsync({ supplier: "UJI-R4", amount: 50000 });
    await waitFor(() => expect(write.mutationFn).toHaveBeenCalledTimes(1));

    write.finish("TBS-0001");
    await expect(joined).resolves.toBe("TBS-0001");
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(write.calls).toHaveLength(1);
  });

  it("lets a different write through, and the same one again once it has finished", async () => {
    const { wrapper } = harness();
    const write = slowWrite();
    const { result } = renderHook(() => useDeskMutation({ mutationFn: write.mutationFn }), { wrapper });

    result.current.mutate({ stop: "A" });
    result.current.mutate({ stop: "B" });
    await waitFor(() => expect(write.mutationFn).toHaveBeenCalledTimes(2));

    write.finish("done");
    await waitFor(() => expect(result.current.isPending).toBe(false));
    result.current.mutate({ stop: "B" });
    await waitFor(() => expect(write.mutationFn).toHaveBeenCalledTimes(3));
  });

  it("tells two files apart, which plain JSON would not", async () => {
    const { wrapper } = harness();
    const write = slowWrite();
    const { result } = renderHook(() => useDeskMutation({ mutationFn: write.mutationFn }), { wrapper });

    result.current.mutate({ file: new File(["a"], "struk-1.jpg") });
    result.current.mutate({ file: new File(["bb"], "struk-2.jpg") });
    await waitFor(() => expect(write.mutationFn).toHaveBeenCalledTimes(2));
  });
});
