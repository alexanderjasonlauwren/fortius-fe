/**
 * In-browser mock backend.
 *
 * One store, persisted to localStorage, that every feature API reads and
 * writes. Because it is shared, actions cross-affect the way they would on a
 * real server: confirming a plan draws down SA quota, opens surat jalan on the
 * monitoring board, and raises invoices that finance later verifies.
 */

import {
  createSeedDatabase,
  DB_VERSION,
  DEFAULT_NOTIFICATIONS,
  DEFAULT_LEXICON,
  DEFAULT_NUMBERING,
  DEFAULT_OPERATIONS,
  isoDate,
  seedSettings,
  startOfToday,
} from "./seed";
import { getActingTenant } from "./actingTenant";
import { resolveSettings } from "./settingsResolver";
import type { AuditEntry, Database, ReminderRuleKey } from "./types";

const STORAGE_KEY = "sidistrib:db:v1";

type Listener = () => void;

let db: Database | null = null;
const listeners = new Set<Listener>();

/* ── persistence ───────────────────────────────────────────────────────── */

function read(): Database | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Database;
    if (parsed.version !== DB_VERSION) return null;
    // The seed is anchored to a working day. Once the calendar rolls over the
    // stored day is history, so start the console on a fresh one.
    if (isoDate(new Date(parsed.seededAt)) !== isoDate(startOfToday())) {
      return null;
    }
    return migrate(parsed);
  } catch {
    return null;
  }
}

/**
 * Fills in anything a stored database predates.
 *
 * Cheaper for the user than bumping the version: config added after they
 * started clicking around appears with its defaults instead of wiping the work
 * they have already done in the session.
 */
function migrate(db: Database): Database {
  db.suppliers ??= [];
  db.bankAccounts ??= [];
  db.deliveryEvents ??= [];
  db.saDailyTargets ??= [];
  db.saImportBatches ??= [];
  db.sim3lonSourceSnapshots ??= [];
  db.sim3lonPlanSources ??= [];
  for (const sa of db.scheduleAgreements) sa.dialokasikan ??= sa.terpakai;
  for (const source of db.sim3lonSourceSnapshots) {
    source.createdAt ??= db.seededAt;
  }
  for (const plan of db.plans) plan.version ??= 1;

  const s = db.settings as Partial<Database["settings"]>;
  s.penomoran ??= { ...DEFAULT_NUMBERING };
  s.istilah ??= { ...DEFAULT_LEXICON };
  // A tenant stored before the lexicon existed keeps its unit word.
  s.istilah.satuan ??= (s as { satuanDefault?: string }).satuanDefault ?? DEFAULT_LEXICON.satuan;
  s.istilah.outlet ??= DEFAULT_LEXICON.outlet;
  s.istilah.pemasok ??= DEFAULT_LEXICON.pemasok;
  s.operasi ??= { ...DEFAULT_OPERATIONS };
  s.operasi.rekamLokasi ??= DEFAULT_OPERATIONS.rekamLokasi;
  s.operasi.radiusGeofenceMeter ??= DEFAULT_OPERATIONS.radiusGeofenceMeter;
  s.notifikasi ??= structuredClone(DEFAULT_NOTIFICATIONS);

  // A rule added after this database was stored still needs its default.
  for (const key of Object.keys(DEFAULT_NOTIFICATIONS.rules) as ReminderRuleKey[]) {
    s.notifikasi.rules[key] ??= { ...DEFAULT_NOTIFICATIONS.rules[key] };
  }
  return db;
}

function write(next: Database) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked (private mode) — the session still works, it
    // just will not survive a reload.
  }
}

export function getDb(): Database {
  if (!db) {
    db = read() ?? createSeedDatabase();
    write(db);
  }
  // `settings` is derived, not stored: it is the acting tenant's row resolved up
  // the tree. Resolved here rather than at each call site because a dozen
  // readers across the console want the effective value and would otherwise
  // each have to walk the hierarchy — and the one that forgot would silently
  // render the root's vocabulary inside a subsidiary.
  //
  // Assigned onto the same object rather than returning a copy: mutate() writes
  // `db` back to storage, and a copy here would drop every other change.
  db.settings = resolveSettings(
    // The pristine defaults, not db.settings. Feeding the previous result back
    // in makes the base drift: after viewing tenant A, any field A resolved
    // becomes the default tenant B inherits, and mutate() persists the drift.
    seedSettings(),
    db.settingsByTenant ?? [],
    db.tenants,
    getActingTenant() || db.tenants.find((t) => t.indukId === null)?.id || "",
  );
  return db;
}

/** Applies a change, persists it, and notifies subscribers. */
export function mutate<T>(fn: (db: Database) => T): T {
  const current = getDb();
  const result = fn(current);
  write(current);
  listeners.forEach((l) => l());
  return result;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Wipes local state and regenerates the demo day. */
export function resetDb(): Database {
  localStorage.removeItem(STORAGE_KEY);
  db = createSeedDatabase();
  write(db);
  listeners.forEach((l) => l());
  return db;
}

/* ── request simulation ────────────────────────────────────────────────── */

type RequestKind = "read" | "write" | "upload";

const LATENCY: Record<RequestKind, [number, number]> = {
  read: [140, 380],
  write: [420, 820],
  upload: [900, 1800],
};

export function latency(kind: RequestKind = "read"): Promise<void> {
  const [min, max] = LATENCY[kind];
  const ms = min + Math.random() * (max - min);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Thrown by mock APIs so the UI can render a real error path. */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/* ── helpers ───────────────────────────────────────────────────────────── */

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}`;
}

export function currentActor(): string {
  try {
    const raw = localStorage.getItem("auth-storage");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.state?.user?.name ?? "Sistem";
    }
  } catch {
    /* fall through */
  }
  return "Sistem";
}

/**
 * The signed-in user's own id, for the one place a rule needs to compare an
 * identity rather than display one — a dual-control override naming the
 * acting session as its own second approver (D3 A-Step 2/3), the mock's own
 * parity check for `ck_deliveries_credit_override` on the real API.
 */
export function currentActorId(): string | undefined {
  try {
    const raw = localStorage.getItem("auth-storage");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.state?.user?.id;
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

/** Appends to the audit trail. Every write in `rules.ts` goes through here. */
export function recordAudit(
  database: Database,
  entry: Omit<AuditEntry, "id" | "at" | "actor"> & { actor?: string },
) {
  const row: AuditEntry = {
    id: nextId("aud"),
    at: new Date().toISOString(),
    actor: entry.actor ?? currentActor(),
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    summary: entry.summary,
  };
  database.audit.unshift(row);
  if (database.audit.length > 500) database.audit.length = 500;
  return row;
}

/**
 * Raises a notification, unless the rule behind it is switched off.
 *
 * Every alert names the rule that produced it, so the switches on the
 * Notifikasi page actually gate what arrives rather than just being stored.
 */
export function notify(
  database: Database,
  n: {
    type: "Pengingat" | "Alert" | "Sistem";
    title: string;
    message: string;
    href?: string;
    /** Omit for system messages that are not governed by a rule. */
    rule?: ReminderRuleKey;
  },
) {
  if (n.rule) {
    const rule = database.settings.notifikasi?.rules?.[n.rule];
    if (rule && !rule.aktif) return;
  }

  database.notifications.unshift({
    id: nextId("ntf"),
    createdAt: new Date().toISOString(),
    isRead: false,
    type: n.type,
    title: n.title,
    message: n.message,
    href: n.href,
    rule: n.rule,
  });
}
