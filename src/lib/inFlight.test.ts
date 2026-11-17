import { beforeEach, expect, it } from "vitest";

import { setActiveScope } from "@/lib/scope";
import { shareInFlight } from "./inFlight";

const scope = (branchId: string | null) =>
  setActiveScope({ actingTenantId: "t1", visibleTenantIds: ["t1"], branchId, allowedBranchIds: [] });

beforeEach(() => scope("b1"));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

it("sends one request for identical calls made while it is in flight", async () => {
  let sent = 0;
  const answer = deferred<string>();
  const load = () => {
    sent++;
    return answer.promise;
  };
  const first = shareInFlight("outlets", load);
  const second = shareInFlight("outlets", load);
  answer.resolve("rows");
  expect(await first).toBe("rows");
  expect(await second).toBe("rows");
  expect(sent).toBe(1);
});

it("asks the server again once the answer has arrived", async () => {
  let sent = 0;
  const load = async () => ++sent;
  await shareInFlight("outlets", load);
  await shareInFlight("outlets", load);
  expect(sent).toBe(2);
});

it("never shares an answer between two branches", async () => {
  let sent = 0;
  const answer = deferred<number>();
  const load = () => {
    sent++;
    return answer.promise;
  };
  const here = shareInFlight("outlets", load);
  scope("b2");
  const there = shareInFlight("outlets", load);
  answer.resolve(1);
  await Promise.all([here, there]);
  expect(sent).toBe(2);
});

it("lets the next call retry after a failure", async () => {
  let sent = 0;
  await expect(shareInFlight("x", async () => { sent++; throw new Error("down"); })).rejects.toThrow("down");
  await shareInFlight("x", async () => ++sent);
  expect(sent).toBe(2);
});
