import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { memoryOutbox, nextSeq, replay, type Filing, type Transport } from "./outbox";

function filing(over: Partial<Filing>): Filing {
  return {
    id: crypto.randomUUID(),
    seq: nextSeq(),
    documentId: "d1",
    stopId: "s1",
    kind: "depart",
    fields: { latitude: -7.3 },
    state: "pending",
    ...over,
  };
}

const offline = () => new ApiError({ message: "Network Error", code: "NETWORK" });

/** A server that answers each transition with the next version. */
function server() {
  const seen: { id: string; kind: string; body: unknown }[] = [];
  let version = 5;
  let down = false;
  const transport: Transport = async (f, request) => {
    if (down) throw offline();
    seen.push({ id: f.id, kind: f.kind, body: typeof request.body === "string" ? JSON.parse(request.body) : "blob" });
    version += 1;
    return f.kind === "photo" ? undefined : version;
  };
  return { seen, transport, setDown: (v: boolean) => (down = v) };
}

describe("replay", () => {
  it("sends filings for one document in order, each built on the version the one before returned", async () => {
    const store = memoryOutbox();
    await store.put(filing({ kind: "depart" }));
    await store.put(filing({ kind: "arrive" }));
    const s = server();

    const result = await replay(store, s.transport, new Map([["d1", 5]]));

    expect(result).toEqual({ sent: 2, refused: 0, offline: false });
    expect(s.seen.map((x) => [x.kind, (x.body as { version: number }).version])).toEqual([
      ["depart", 5],
      ["arrive", 6],
    ]);
    expect(await store.all()).toHaveLength(0);
  });

  it("freezes a request once sent: a retry after a lost answer sends the same bytes and key", async () => {
    const store = memoryOutbox();
    const f = filing({ kind: "depart" });
    await store.put(f);
    const s = server();
    let first = true;
    const flaky: Transport = async (x, request) => {
      if (first) {
        first = false;
        throw offline(); // the request left; the answer did not come back
      }
      return s.transport(x, request);
    };

    const versions = new Map([["d1", 5]]);
    expect((await replay(store, flaky, versions)).offline).toBe(true);
    const [kept] = await store.all();
    expect(kept.sent?.body).toBe(JSON.stringify({ latitude: -7.3, version: 5 }));

    // Even if the version known has moved on since, the retry is the original.
    versions.set("d1", 9);
    await replay(store, flaky, versions);
    expect(s.seen).toEqual([{ id: f.id, kind: "depart", body: { latitude: -7.3, version: 5 } }]);
  });

  it("stops at the first network failure and keeps everything that did not go", async () => {
    const store = memoryOutbox();
    await store.put(filing({ kind: "depart", documentId: "d1" }));
    await store.put(filing({ kind: "depart", documentId: "d2" }));
    const s = server();
    s.setDown(true);

    const result = await replay(store, s.transport, new Map([["d1", 1], ["d2", 1]]));
    expect(result.offline).toBe(true);
    expect(await store.all()).toHaveLength(2);
  });

  it("a refusal stops the filings behind it for that document only, and is kept with its reason", async () => {
    const store = memoryOutbox();
    await store.put(filing({ kind: "depart", documentId: "d1" }));
    await store.put(filing({ kind: "arrive", documentId: "d1" }));
    await store.put(filing({ kind: "depart", documentId: "d2" }));
    const sent: string[] = [];
    const transport: Transport = async (f) => {
      if (f.documentId === "d1") throw new ApiError({ message: "Delivery is not on route", code: "CONFLICT", status: 409 });
      sent.push(f.documentId);
      return 2;
    };

    const result = await replay(store, transport, new Map([["d1", 1], ["d2", 1]]));
    expect(result).toEqual({ sent: 1, refused: 1, offline: false });
    expect(sent).toEqual(["d2"]);
    const left = await store.all();
    expect(left.find((f) => f.state === "refused")?.error).toBe("Delivery is not on route");
    expect(left.find((f) => f.kind === "arrive")?.state).toBe("pending");
  });

  it("an answer that the original is still running is retried later, not refused", async () => {
    const store = memoryOutbox();
    await store.put(filing({}));
    const transport: Transport = async () => {
      throw new ApiError({ message: "still processing", code: "IDEMPOTENCY_IN_FLIGHT", status: 409 });
    };
    const result = await replay(store, transport, new Map([["d1", 1]]));
    expect(result).toEqual({ sent: 0, refused: 0, offline: true });
    expect((await store.all())[0].state).toBe("pending");
  });

  it("a transition waits while its document's version is unknown, rather than guessing one", async () => {
    const store = memoryOutbox();
    await store.put(filing({}));
    const s = server();
    const result = await replay(store, s.transport, new Map());
    expect(result.sent).toBe(0);
    expect(s.seen).toHaveLength(0);
  });

  it("encodes a photo once, with its boundary, as multipart", async () => {
    const store = memoryOutbox();
    await store.put(filing({ kind: "photo", fields: undefined, photo: { blob: new Blob(["png"], { type: "image/png" }), name: "foto.png" } }));
    const requests: NonNullable<Filing["sent"]>[] = [];
    const result = await replay(store, async (_f, request) => {
      requests.push(request);
      return undefined;
    }, new Map());
    expect(result.sent).toBe(1);
    expect(requests[0].contentType).toMatch(/^multipart\/form-data; boundary=/);
    const text = await (requests[0].body as Blob).text();
    expect(text).toContain('name="file"; filename="foto.png"');
  });
});
