import { scopeKey } from "@/mocks/scope";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, LogOut, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/features/auth/store/authStore";
import { getUnreadCount } from "@/features/notification/api/notificationApi";
import { useRevealActiveGroup, useSidebarStore } from "@/hooks/useSidebar";
import { APP_NAME, APP_SUBTITLE } from "@/utils/constants";
import { BOTTOM_NAV, navGroupsFor, type NavItem } from "./nav";
import { useIntakePolicy } from "@/features/distribution/hooks/useIntakePolicy";

interface SidebarProps {
  onClose?: () => void;
}

/*
 * Collapsing is one animation, not two.
 *
 * The grid column interpolates 16rem -> 4rem. Everything inside must hold still
 * while it does, or the sidebar arrives before its own container: an earlier
 * version swapped the whole tree at frame 0 -- labels unmounted, icons slid from
 * their text padding to centre, group headers disappeared, the toggle jumped to
 * another row -- and then spent 220ms sliding a box whose contents had already
 * finished moving. That mismatch is what reads as rough.
 *
 * So the structure is identical in both states and the column simply clips it:
 *
 *   RAIL (4rem)          LABELS (12rem)
 *   +----------+ +--------------------------+
 *   |   icon   | | Perencanaan Distribusi   |
 *   +----------+ +--------------------------+
 *   ^ never moves  ^ fixed width, so it never reflows; clipped, then revealed
 *
 * Both tracks are fixed-width and shrink-0. The icon sits at a constant 2rem
 * from the left edge in both states, so nothing slides horizontally, and the
 * label track never reflows or re-ellipsises mid-transition -- it is simply
 * outside the box or inside it.
 *
 * Opacity is asymmetric on purpose: text leaves quickly and unaccompanied, then
 * the column moves; on the way back the column widens first and the text arrives
 * after. Fading text in step with the width just looks like a smear.
 */

/** Width of the rail, and of the icon track that survives inside it. */
const RAIL = "w-16"; // 4rem — matches .app-shell[data-sidebar="collapsed"]
/** 16rem − 4rem. Fixed, so the label track never reflows while the column moves. */
const LABELS = "w-48";

export function Sidebar({ onClose }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);
  const permissions = useAuthStore((state) => state.user?.permissions);
  const policy = useIntakePolicy();
  const navGroups = navGroupsFor(permissions, policy.isSuccess ? policy.data : undefined);

  const collapsed = useSidebarStore((s) => s.collapsed);
  const openGroups = useSidebarStore((s) => s.openGroups);
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);
  const toggleGroup = useSidebarStore((s) => s.toggleGroup);

  useRevealActiveGroup(location.pathname);

  // The mobile drawer is always full width — a rail on a phone is pointless.
  const isRail = collapsed && !onClose;

  // Out fast and alone; in only once there is room. See the note above.
  const fade = cn(
    "transition-opacity motion-reduce:transition-none",
    isRail
      ? "pointer-events-none opacity-0 duration-100"
      : "opacity-100 duration-150 delay-100",
  );

  // Height collapse for the pieces that have no rail equivalent at all.
  const shrinkAway = (visible: boolean) =>
    cn(
      "grid transition-[grid-template-rows] duration-200 ease-desk motion-reduce:transition-none",
      visible ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
    );

  const unread = useQuery({
    queryKey: [...scopeKey(), "unread-count"],
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
  });

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const badge = item.href === "/notifications" ? (unread.data ?? 0) : 0;

    return (
      <NavLink
        key={item.href}
        to={item.href}
        onClick={onClose}
        title={isRail ? item.name : item.hint}
        className={({ isActive }) =>
          cn(
            // The active item carries the amber spine — the same device used on
            // rows and badges, so "where am I" reads like any other status.
            "relative flex items-center py-2 text-sm transition-colors duration-150",
            "before:absolute before:bottom-1 before:left-0 before:top-1 before:w-[3px] before:rounded-r-sm",
            isActive
              ? "bg-white/[0.06] font-semibold text-nav-fg before:bg-signal"
              : "font-medium text-nav-fg-muted before:bg-transparent hover:bg-white/[0.04] hover:text-nav-fg",
          )
        }
      >
        <span className={cn("relative flex shrink-0 items-center justify-center", RAIL)}>
          <Icon className="h-[1.05rem] w-[1.05rem] shrink-0" strokeWidth={1.75} />
          {/* In the rail the count has nowhere to go, so it becomes a dot. */}
          <span
            className={cn(
              "absolute right-3 top-0 h-1.5 w-1.5 rounded-full bg-signal transition-opacity duration-150",
              isRail && badge > 0 ? "opacity-100" : "opacity-0",
            )}
            aria-hidden
          />
        </span>

        <span className={cn("flex shrink-0 items-center gap-2 pr-3", LABELS, fade)}>
          <span className="truncate">{item.name}</span>
          {badge > 0 && (
            <span className="data ml-auto rounded-sm bg-signal px-1.5 py-px text-2xs font-semibold text-[rgb(23_26_22)]">
              {badge}
            </span>
          )}
        </span>
      </NavLink>
    );
  };

  return (
    <div
      className={cn(
        // Fills its grid column on desktop; the overlay drawer sets its own.
        "flex h-full flex-col overflow-hidden bg-nav dark:border-r dark:border-line",
        onClose ? "w-64" : "w-full",
      )}
    >
      {/* Wordmark — same two tracks as every nav item, so the logo holds its
          position exactly as the icons do. */}
      <div className="flex items-center py-5">
        <span className={cn("flex shrink-0 items-center justify-center", RAIL)}>
          <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden>
            <rect width="32" height="32" rx="6" fill="rgb(224 163 46)" />
            <rect x="7" y="7" width="3" height="18" fill="rgb(23 26 22)" />
            <rect x="13" y="9" width="12" height="3" rx="1.5" fill="rgb(23 26 22)" />
            <rect x="13" y="15" width="8" height="3" rx="1.5" fill="rgb(23 26 22 / .55)" />
            <rect x="13" y="21" width="10" height="3" rx="1.5" fill="rgb(23 26 22 / .55)" />
          </svg>
        </span>

        <div className={cn("flex shrink-0 items-center gap-2 pr-3", LABELS, fade)}>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-tight tracking-[-0.02em] text-nav-fg">
              {APP_NAME}
            </p>
            <p className="label text-[0.625rem] text-nav-fg-muted">{APP_SUBTITLE}</p>
          </div>

          {onClose ? (
            <button
              onClick={onClose}
              aria-label="Tutup menu"
              className="rounded p-1 text-nav-fg-muted hover:bg-white/10 hover:text-nav-fg lg:hidden"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            /* Beside the wordmark, where people look for it — not buried at the
               bottom under the sign-out button. */
            <button
              onClick={toggleCollapsed}
              aria-label="Perkecil menu"
              title="Perkecil menu  ⌘B"
              tabIndex={isRail ? -1 : undefined}
              className="rounded p-1.5 text-nav-fg-muted transition-colors hover:bg-white/10 hover:text-nav-fg"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* The rail's own toggle: the wordmark row has no space left for one, so
          this row grows in as that button fades out. */}
      {!onClose && (
        <div className={shrinkAway(isRail)}>
          <div className="overflow-hidden">
            <button
              onClick={toggleCollapsed}
              aria-label="Perlebar menu"
              title="Perlebar menu  ⌘B"
              tabIndex={isRail ? undefined : -1}
              className={cn(
                "mb-2 flex items-center justify-center py-2 text-nav-fg-muted transition-colors hover:bg-white/[0.06] hover:text-nav-fg",
                RAIL,
              )}
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Accordion navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden pb-4">
        {navGroups.map((group) => {
          const open = openGroups.includes(group.label);
          const hasActive = group.items.some(
            (i) =>
              location.pathname === i.href || location.pathname.startsWith(`${i.href}/`),
          );

          return (
            <div
              key={group.label}
              className={cn(
                // In the rail the headers are gone, so a rule takes over the job
                // of separating groups. Colour, not layout, so nothing shifts.
                "mb-1 border-b transition-colors duration-200 last:border-b-0",
                isRail ? "border-white/10 pb-2" : "border-transparent",
              )}
            >
              <div className={shrinkAway(!isRail)}>
                <div className="overflow-hidden">
                  {/* Offset by the rail so the header sits on the same left edge
                      as the item labels below it, and its chevron lines up with
                      their badges. */}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={open}
                    tabIndex={isRail ? -1 : undefined}
                    className={cn(
                      "ml-16 flex items-center gap-2 py-2 pr-3 text-nav-fg-muted transition-colors hover:text-nav-fg",
                      LABELS,
                      fade,
                    )}
                  >
                    <span className="label text-[0.625rem]">{group.label}</span>
                    {/* A collapsed group holding the current page still says so. */}
                    {!open && hasActive && (
                      <span className="h-1.5 w-1.5 rounded-full bg-signal" aria-hidden />
                    )}
                    <ChevronDown
                      className={cn(
                        "ml-auto h-3.5 w-3.5 transition-transform duration-200",
                        open ? "rotate-0" : "-rotate-90",
                      )}
                    />
                  </button>
                </div>
              </div>

              {/* Rail mode has no headers to expand with, so every group is open
                  there — otherwise a collapsed group would hide its icons too. */}
              <div className={shrinkAway(open || isRail)}>
                <div className="overflow-hidden">
                  <div className="flex flex-col pb-2">{group.items.map(renderItem)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/10 py-3">
        {BOTTOM_NAV.map(renderItem)}

        <button
          onClick={handleLogout}
          title={isRail ? "Keluar" : undefined}
          className="relative flex w-full items-center py-2 text-sm font-medium text-nav-fg-muted transition-colors hover:bg-white/[0.04] hover:text-nav-fg"
        >
          <span className={cn("flex shrink-0 items-center justify-center", RAIL)}>
            <LogOut className="h-[1.05rem] w-[1.05rem] shrink-0" strokeWidth={1.75} />
          </span>
          <span className={cn("flex shrink-0 items-center pr-3 text-left", LABELS, fade)}>
            Keluar
          </span>
        </button>
      </div>
    </div>
  );
}
