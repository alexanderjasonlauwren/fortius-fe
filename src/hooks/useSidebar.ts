import { useEffect } from "react";
import { create } from "zustand";
import { ALL_NAV_GROUPS, NAV_GROUPS } from "@/layouts/nav";

const COLLAPSED_KEY = "sidebar:collapsed";
const OPEN_GROUPS_KEY = "sidebar:groups";

function readCollapsed(): boolean {
  return localStorage.getItem(COLLAPSED_KEY) === "1";
}

const KNOWN_GROUPS_KEY = "sidebar:known-groups";

/** The groups the menu had before this list was kept -- what a browser that
 *  stored open groups but no known groups had seen. */
const GROUPS_BEFORE_P6 = ["Menu utama", "Operasi harian", "Keuangan", "Data induk"];

/**
 * The stored open groups plus every group this browser has never seen.
 *
 * Only open groups are stored, so a group added to the menu (accounting
 * parity P6 split Keuangan in two) would otherwise start closed for everyone
 * who had used the console before -- a menu that hides its new pages. A group
 * someone closed on purpose stays closed: it is in `known` and not in `open`.
 */
export function withNewGroupsOpen(open: string[], known: string[], current: string[]): string[] {
  const added = current.filter((label) => !known.includes(label) && !open.includes(label));
  return [...open, ...added];
}

function readOpenGroups(): string[] {
  const all = NAV_GROUPS.map((g) => g.label);
  try {
    const raw = localStorage.getItem(OPEN_GROUPS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const knownRaw = localStorage.getItem(KNOWN_GROUPS_KEY);
    const known = knownRaw ? JSON.parse(knownRaw) : GROUPS_BEFORE_P6;
    if (!Array.isArray(parsed)) return all;
    const open = withNewGroupsOpen(parsed, Array.isArray(known) ? known : GROUPS_BEFORE_P6, all);
    // Both together: "known" without the groups it just opened would close
    // them again on the next load.
    localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(open));
    localStorage.setItem(KNOWN_GROUPS_KEY, JSON.stringify(all));
    return open;
  } catch {
    return all;
  }
}

interface SidebarState {
  /** Rail mode: icons only, labels on hover. */
  collapsed: boolean;
  openGroups: string[];
  toggleCollapsed: () => void;
  toggleGroup: (label: string) => void;
  /** Used to reveal the group containing the current route. */
  ensureGroupOpen: (label: string) => void;
}

/**
 * Sidebar shape, shared so the header and layout can react to it and persisted
 * so it survives a reload — people set this once and expect it to stay.
 */
export const useSidebarStore = create<SidebarState>((set, get) => ({
  collapsed: typeof window === "undefined" ? false : readCollapsed(),
  openGroups: typeof window === "undefined" ? [] : readOpenGroups(),

  toggleCollapsed: () => {
    const next = !get().collapsed;
    localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
    set({ collapsed: next });
  },

  toggleGroup: (label) => {
    const open = get().openGroups;
    const next = open.includes(label)
      ? open.filter((l) => l !== label)
      : [...open, label];
    localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
    set({ openGroups: next });
  },

  ensureGroupOpen: (label) => {
    const open = get().openGroups;
    if (open.includes(label)) return;
    const next = [...open, label];
    localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
    set({ openGroups: next });
  },
}));

/** ⌘B / Ctrl-B collapses the sidebar, the shortcut people already expect. */
export function useSidebarShortcut() {
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);
}

/** Keeps the group holding the active route expanded. */
export function useRevealActiveGroup(pathname: string) {
  const ensureGroupOpen = useSidebarStore((s) => s.ensureGroupOpen);
  useEffect(() => {
    const group = ALL_NAV_GROUPS.find((g) =>
      g.items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)),
    );
    if (group) ensureGroupOpen(group.label);
  }, [pathname, ensureGroupOpen]);
}
