import { lazy, type ComponentType } from "react";

/** sessionStorage key marking that one reload has already been tried. */
const RELOAD_KEY = "lazy-page-reloaded";

/**
 * A route page loaded on first visit instead of in the entry bundle.
 *
 * Pages are named exports, and `React.lazy` wants a default one, so the module
 * is adapted here once rather than at every call site.
 *
 * A failed import after a deploy usually means the hashed chunk this tab was
 * built against no longer exists on the server. Reloading once fetches the
 * new `index.html` and its chunks; the flag stops a genuinely broken chunk from
 * looping, and the error then reaches the route's error boundary.
 */
export function lazyPage<M extends Record<string, unknown>, K extends keyof M & string>(
  load: () => Promise<M>,
  name: K,
) {
  return lazy(async () => {
    try {
      const module = await load();
      safeSession(() => sessionStorage.removeItem(RELOAD_KEY));
      return { default: module[name] as ComponentType };
    } catch (error) {
      const alreadyReloaded = safeSession(() => sessionStorage.getItem(RELOAD_KEY)) === "1";
      if (!alreadyReloaded) {
        safeSession(() => sessionStorage.setItem(RELOAD_KEY, "1"));
        window.location.reload();
        // Never settles: the reload replaces the page.
        return new Promise<never>(() => {});
      }
      throw error;
    }
  });
}

function safeSession<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}
