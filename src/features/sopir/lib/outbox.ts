/**
 * The driver's outbox: filings that must reach the server once, even from a
 * truck with no signal.
 *
 * Every filing -- depart, arrive, complete, fail, the proof photo -- is written
 * here before it is sent and removed when the server has answered. A filing
 * that could not be sent stays, and is replayed when the phone is online
 * again (useOutbox).
 *
 * # Once, not at-least-once
 *
 * Each filing carries an Idempotency-Key (its id). If a first attempt reached
 * the server and only the answer was lost, the replay is answered from the
 * server's stored response and nothing is filed twice. For that the replay
 * must be byte-for-byte the first attempt -- the server fingerprints the body,
 * and a photo re-encoded into a new multipart body would be refused as a
 * reused key -- so a request, once sent, is frozen in `sent` and never rebuilt.
 *
 * # Versions
 *
 * Every transition carries the delivery's version. A filing queued behind an
 * earlier one for the same document (arrive behind depart, both offline) is
 * not built when it is queued: the version it needs is the one the earlier
 * filing's answer will carry. It is built when it is first sent, from the
 * latest version known, and frozen from then on. Filings for one document go
 * strictly in order, and one the server refuses stops the ones behind it,
 * which were built on it.
 */
import { ApiError } from "@/lib/api";

export type FilingKind = "depart" | "arrive" | "complete" | "fail" | "photo";

export interface Filing {
  /** Also the Idempotency-Key. */
  id: string;
  /** Creation order; replay follows it. */
  seq: number;
  /** The delivery (surat jalan) the request names. */
  documentId: string;
  /** The run stop it belongs to, for the screen's "menunggu dikirim". */
  stopId: string;
  kind: FilingKind;
  /** A transition's fields, without its version (added when first sent). */
  fields?: Record<string, unknown>;
  /** The proof photo, already downscaled. */
  photo?: { blob: Blob; name: string };
  /** The exact request, once it has been sent at least once. */
  sent?: { body: Blob | string; contentType: string };
  state: "pending" | "refused";
  /** Why the server refused it, for the driver and the office. */
  error?: string;
}

export interface OutboxStore {
  all(): Promise<Filing[]>;
  put(filing: Filing): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Sends one built request; answers the new version when the server returns one. */
export type Transport = (filing: Filing, request: NonNullable<Filing["sent"]>) => Promise<number | undefined>;

/** The latest version known per document, from the run and from answers. */
export type Versions = Map<string, number>;

let counter = 0;
/** A sortable creation stamp, unique within the tab. */
export function nextSeq(): number {
  counter = (counter + 1) % 1000;
  return Date.now() * 1000 + counter;
}

/**
 * A filing to send again later, as opposed to one the server refused: no
 * answer at all, a server error, or the server still running the first
 * attempt with this key (IDEMPOTENCY_IN_FLIGHT).
 */
export function isOffline(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.code === "NETWORK" || error.code === "IDEMPOTENCY_IN_FLIGHT" || (error.status ?? 0) >= 500;
  }
  return error instanceof TypeError;
}

/**
 * Builds a filing's request. A transition needs its document's version; with
 * none known yet (the run not loaded since a reload) it cannot be built, and
 * waits.
 */
export async function buildRequest(filing: Filing, versions: Versions): Promise<Filing["sent"] | undefined> {
  if (filing.kind === "photo") {
    if (!filing.photo) return undefined;
    const form = new FormData();
    form.append("file", new File([filing.photo.blob], filing.photo.name, { type: filing.photo.blob.type }));
    // Encoded once, through Request, so the boundary is fixed with the bytes.
    const encoded = new Request("http://outbox.local/", { method: "POST", body: form });
    const contentType = encoded.headers.get("content-type");
    if (!contentType) return undefined;
    return { body: await encoded.blob(), contentType };
  }
  const version = versions.get(filing.documentId);
  if (version === undefined) return undefined;
  return { body: JSON.stringify({ ...filing.fields, version }), contentType: "application/json" };
}

export interface ReplayResult {
  sent: number;
  refused: number;
  /** The network gave out part way; the rest waits. */
  offline: boolean;
}

/**
 * Sends what is pending, oldest first.
 *
 * A filing for a document behind a refused or unbuildable one waits: it was
 * built on the one in front. The run stops at the first network failure --
 * the next filing would fail the same way.
 */
export async function replay(store: OutboxStore, transport: Transport, versions: Versions): Promise<ReplayResult> {
  const result: ReplayResult = { sent: 0, refused: 0, offline: false };
  const all = (await store.all()).sort((a, b) => a.seq - b.seq);
  const blocked = new Set(all.filter((f) => f.state === "refused").map((f) => f.documentId));

  for (const filing of all) {
    if (filing.state !== "pending" || blocked.has(filing.documentId)) continue;

    if (!filing.sent) {
      const built = await buildRequest(filing, versions);
      if (!built) {
        blocked.add(filing.documentId);
        continue;
      }
      filing.sent = built;
      // Frozen before it leaves: from here on a retry is this exact request.
      await store.put(filing);
    }

    try {
      const version = await transport(filing, filing.sent);
      if (version !== undefined) versions.set(filing.documentId, version);
      await store.remove(filing.id);
      result.sent++;
    } catch (error) {
      if (isOffline(error)) {
        result.offline = true;
        return result;
      }
      filing.state = "refused";
      filing.error = error instanceof Error ? error.message : String(error);
      await store.put(filing);
      blocked.add(filing.documentId);
      result.refused++;
    }
  }
  return result;
}

/* ------------------------------------------------------------------------- *
 * IndexedDB store
 * ------------------------------------------------------------------------- */

const DB_NAME = "fortius-sopir";
const STORE = "outbox";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = op(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

/** The browser's own outbox; survives a reload and a closed tab. */
export const indexedDbOutbox: OutboxStore = {
  all: () => run<Filing[]>("readonly", (s) => s.getAll() as IDBRequest<Filing[]>),
  put: async (filing) => {
    await run("readwrite", (s) => s.put(filing));
  },
  remove: async (id) => {
    await run("readwrite", (s) => s.delete(id));
  },
};

/** In memory, for tests and for a browser without IndexedDB. */
export function memoryOutbox(): OutboxStore {
  const items = new Map<string, Filing>();
  return {
    all: async () => [...items.values()].map((f) => ({ ...f })),
    put: async (filing) => {
      items.set(filing.id, { ...filing });
    },
    remove: async (id) => {
      items.delete(id);
    },
  };
}
