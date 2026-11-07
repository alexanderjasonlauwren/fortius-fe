/**
 * The words this tenant uses for the things it moves.
 *
 * The console is not an LPG console. It plans rounds, loads vehicles, draws
 * against a quota and bills the receiver — none of which is specific to gas
 * cylinders. But every screen has to *call* those things something, and the
 * right noun is the tenant's, not ours: an LPG agency says pangkalan, tabung
 * and SPBE; a water depot says depot, galon and pabrik; a feed distributor
 * says toko, sak and pabrik.
 *
 * So the vocabulary is data. The code names the *role* (`outlet`, `supplier`,
 * `unit`) and asks this module for the tenant's word at render time. Nothing
 * below the UI layer should carry an industry noun as a literal.
 *
 * Module-level rather than a hook: these are read from print templates, CSV headers and toast strings that are
 * not React components and cannot subscribe to anything.
 *
 * Where a single product *is* in scope — an invoice line, a stop's product
 * block — use that product's own `satuan` instead. `unitLabel` is the fallback
 * for totals that span products, not a replacement for the per-product word.
 */

import { formatNumber } from "./format";

/** The roles a tenant supplies a noun for. Keys match `SettingsEntity.istilah`. */
export type TermKey = "satuan" | "outlet" | "pemasok";

/**
 * Deliberately colourless. A brand-new browser shows these for the half-second
 * before settings load — better a neutral word than a confidently wrong
 * industry's.
 */
const FALLBACK: Record<TermKey, string> = {
  satuan: "unit",
  outlet: "outlet",
  pemasok: "pemasok",
};

/**
 * The cache is keyed PER TENANT.
 *
 * It used to be one key for the whole console, which was harmless while a
 * session had exactly one tenant. Once you can switch, it is not: the cache is
 * read at module load to make the first paint right, so an LPG agency and a
 * water depot sharing a key means the first screen after a switch renders the
 * tenant you just left — "tabung" all over a depot's console, for as long as it
 * takes settings to load. Briefly wrong and confidently wrong.
 */
const KEY_PREFIX = "sidistrib:istilah";

function cacheKey(tenantId: string): string {
  return tenantId ? `${KEY_PREFIX}:${tenantId}` : KEY_PREFIX;
}

/**
 * Whose vocabulary is currently loaded.
 *
 * Tracked so a switch can be detected: setLexicon for a different tenant must
 * REPLACE the terms rather than merge into them. Without this, a tenant that
 * leaves a term unset would keep the previous tenant's word for it — the exact
 * cross-tenant bleed the per-tenant key exists to stop, arriving through the
 * in-memory copy instead of through storage.
 */
let loadedFor = "";

/** Hydrated from the last session so the first paint after a reload is right. */
const terms: Record<TermKey, string> = { ...FALLBACK };

function readCache(tenantId: string): Partial<Record<TermKey, string>> {
  try {
    const raw = localStorage.getItem(cacheKey(tenantId));
    return raw ? (JSON.parse(raw) as Partial<Record<TermKey, string>>) : {};
  } catch {
    // No storage, or a stale shape from an older build. Fallbacks stand.
    return {};
  }
}

/**
 * Load a tenant's cached vocabulary, before its settings have arrived.
 *
 * Called from the layout as soon as the acting tenant is known, which is
 * earlier than settings resolve. Falls back to neutral words rather than the
 * previous tenant's.
 */
export function hydrateLexicon(tenantId: string): void {
  if (tenantId === loadedFor) return;
  const cached = readCache(tenantId);
  for (const key of Object.keys(FALLBACK) as TermKey[]) {
    terms[key] = cached[key]?.trim() || FALLBACK[key];
  }
  loadedFor = tenantId;
}

/** Called once settings land, from the layout that owns the session. */
export function setLexicon(
  next: Partial<Record<TermKey, string>>,
  tenantId: string = loadedFor,
): void {
  // A different tenant replaces rather than merges: anything it leaves unset
  // must fall back to a neutral word, never to the previous tenant's.
  if (tenantId !== loadedFor) hydrateLexicon(tenantId);

  let changed = false;
  for (const key of Object.keys(FALLBACK) as TermKey[]) {
    const value = next[key]?.trim() || FALLBACK[key];
    if (value === terms[key]) continue;
    terms[key] = value;
    changed = true;
  }
  if (!changed) return;
  try {
    localStorage.setItem(cacheKey(tenantId), JSON.stringify(terms));
  } catch {
    // Private mode. The lexicon still holds for this session.
  }
}

/** The tenant's word for a role, lower-case, as it reads mid-sentence. */
export function term(key: TermKey): string {
  return terms[key];
}

/** Sentence-case, for column headers and labels that open a phrase. */
export function termTitle(key: TermKey): string {
  const value = terms[key];
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ── role-specific readers ─────────────────────────────────────────────────
 * Thin, but they keep call sites reading as prose rather than as lookups, and
 * they are the seam to widen if a role ever needs a plural or a genitive.
 */

/** What one unit of the moved thing is called: tabung, galon, dus, sak. */
export const unitLabel = () => term("satuan");
export const unitLabelTitle = () => termTitle("satuan");

/** What a delivery destination is called: pangkalan, depot, toko, gerai. */
export const outletLabel = () => term("outlet");
export const outletLabelTitle = () => termTitle("outlet");

/** What a supply source is called: SPBE, pabrik, distributor pusat. */
export const supplierLabel = () => term("pemasok");
export const supplierLabelTitle = () => termTitle("pemasok");

/** "1.284 tabung" — pass a product's own `satuan` when one is in scope. */
export function formatUnits(value: number, satuan: string = terms.satuan): string {
  return `${formatNumber(value)} ${satuan}`;
}
