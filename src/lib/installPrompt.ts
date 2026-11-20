/**
 * "Pasang aplikasi": Chrome and Edge offer to install the console once the
 * manifest qualifies, but their own banner is easy to dismiss and then stays
 * away for months. Holding on to the browser's prompt lets the account menu
 * offer it again on request.
 *
 * The event fires early, often before React mounts, so the listener is
 * registered when this module is first imported (main.tsx), not in a hook.
 * Browsers without the event (Safari, Firefox) never offer the item; iOS
 * users install through Bagikan → Tambahkan ke Layar Utama.
 */
import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's own banner: preventDefault would suppress it, and
    // for a driver it is the most obvious way in. The saved event still
    // lets the menu offer the same prompt later.
    deferred = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether the browser will show its install prompt if asked now. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(subscribe, () => deferred !== null, () => false);
}

/** Shows the browser's install prompt; a prompt can be used only once. */
export async function promptInstall(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null;
  emit();
  await event.prompt();
  // Dismissed: Chrome fires beforeinstallprompt again on a later visit, so
  // the menu item comes back then rather than now.
  await event.userChoice;
}
