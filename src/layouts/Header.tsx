import { scopeKey } from "@/lib/scope";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell,
  Check,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/features/auth/store/authStore";
import {
  getNotifications,
  markAllAsRead,
} from "@/features/notification/api/notificationApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { relativeTime } from "@/lib/format";
import { sectionFor, titleFor } from "./nav";
import { CommandPalette } from "./CommandPalette";
import { ScopeSwitcher } from "@/features/tenancy/ScopeSwitcher";
import { describeRoles } from "@/features/rbac/access";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const notifications = useQuery({
    queryKey: [...scopeKey(), "notifications"],
    queryFn: getNotifications,
    refetchInterval: 60_000,
  });
  const unread = (notifications.data ?? []).filter((n) => !n.isRead);

  const markAll = useDeskMutation({
    mutationFn: markAllAsRead,
    errorTitle: "Gagal menandai notifikasi",
    success: (count) =>
      count === 0
        ? { title: "Semua notifikasi sudah dibaca", tone: "info" }
        : { title: `${count} notifikasi ditandai sudah dibaca` },
  });

  // ⌘K / Ctrl-K opens search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close the popovers on an outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node))
        setBellOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const section = sectionFor(location.pathname);

  return (
    <>
      {/* Sticky inside the content column, so there is no left offset to keep
          in sync with the sidebar. */}
      <header className="sticky top-0 z-[1001] flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-panel/85 px-4 backdrop-blur-md lg:px-7">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            onClick={onMenuClick}
            aria-label="Buka menu navigasi"
            className="shrink-0 rounded-md p-2 text-ink-muted transition-colors hover:bg-panel-raised hover:text-ink lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            {/* Hidden on phones: it restates the nav group the user just came
                from, and at 414px there is no room for it — uppercased with
                letter-spacing it wraps to two lines and pushes the title out of
                the 64px bar entirely. */}
            {section && (
              <p className="label hidden truncate text-[0.625rem] leading-tight text-ink-muted sm:block">
                {section}
              </p>
            )}
            <h1 className="truncate text-base font-semibold tracking-[-0.01em] text-ink">
              {titleFor(location.pathname)}
            </h1>
          </div>
        </div>

        {/* shrink-0 so the title block yields first and truncates. Without it
            nothing arbitrates between the two clusters and they collide. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <ScopeSwitcher />

          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-2 rounded-md border border-line px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink sm:flex"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Cari</span>
            <kbd className="data rounded-sm border border-line px-1 text-[0.625rem]">
              ⌘K
            </kbd>
          </button>

          {/* From sm up this is a bar icon. On phones it moves into the account
              menu: theme is a set-once preference, and the 34px it costs here is
              the difference between the page title fitting and not. */}
          <button
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Ganti ke tema terang" : "Ganti ke tema gelap"}
            className="hidden rounded-md p-2 text-ink-muted transition-colors hover:bg-panel-raised hover:text-ink sm:block"
          >
            {theme === "dark" ? (
              <Sun className="h-[1.1rem] w-[1.1rem]" />
            ) : (
              <Moon className="h-[1.1rem] w-[1.1rem]" />
            )}
          </button>

          {/* Notifications */}
          <div className="relative" ref={bellRef}>
            <button
              onClick={() => setBellOpen((v) => !v)}
              aria-label={`Notifikasi${unread.length ? `, ${unread.length} belum dibaca` : ""}`}
              aria-expanded={bellOpen}
              className={cn(
                "relative rounded-md p-2 transition-colors hover:bg-panel-raised",
                bellOpen ? "bg-panel-raised text-ink" : "text-ink-muted hover:text-ink",
              )}
            >
              <Bell className="h-[1.1rem] w-[1.1rem]" />
              {unread.length > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-signal ring-2 ring-panel" />
              )}
            </button>

            {/* On phones this is a sheet pinned to the viewport, not a dropdown
                hung off the bell. Anchoring it right-0 to the button put its
                left edge off-screen (the avatar sits between the bell and the
                screen edge), and left overflow cannot be scrolled to — the
                first ~40px of every notification was simply unreachable.
                Clamping the width alone did not fix it; the anchor was wrong. */}
            {bellOpen && (
              <div className="animate-in-up fixed inset-x-4 top-[4.5rem] overflow-hidden rounded-md border border-line bg-panel shadow-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[22rem]">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <p className="label text-2xs text-ink-muted">
                    Notifikasi{unread.length > 0 && ` · ${unread.length} baru`}
                  </p>
                  {unread.length > 0 && (
                    <button
                      onClick={() => markAll.mutate(undefined as never)}
                      className="flex items-center gap-1 text-xs font-semibold text-ink-muted transition-colors hover:text-ink"
                    >
                      <Check className="h-3 w-3" />
                      Tandai semua
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto">
                  {(notifications.data ?? []).length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-ink-muted">
                      Tidak ada notifikasi. Peringatan kuota dan keterlambatan
                      akan muncul di sini.
                    </p>
                  ) : (
                    (notifications.data ?? []).slice(0, 6).map((n) => (
                      <button
                        key={n.id}
                        onClick={() => {
                          setBellOpen(false);
                          navigate(n.href ?? "/notifications");
                        }}
                        className={cn(
                          "spine flex w-full flex-col gap-0.5 border-b border-line px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-panel-sunk",
                          n.type === "Alert"
                            ? "text-rust"
                            : n.type === "Pengingat"
                              ? "text-signal"
                              : "text-draft",
                        )}
                      >
                        <span className="flex items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              "truncate text-sm text-ink",
                              !n.isRead && "font-semibold",
                            )}
                          >
                            {n.title}
                          </span>
                          <span className="data shrink-0 text-2xs text-ink-muted">
                            {relativeTime(n.timestamp)}
                          </span>
                        </span>
                        <span className="line-clamp-2 text-xs leading-relaxed text-ink-muted">
                          {n.message}
                        </span>
                      </button>
                    ))
                  )}
                </div>

                <Link
                  to="/notifications"
                  onClick={() => setBellOpen(false)}
                  className="block border-t border-line px-4 py-2.5 text-center text-xs font-semibold text-ink transition-colors hover:bg-panel-sunk"
                >
                  Lihat semua notifikasi
                </Link>
              </div>
            )}
          </div>

          {/* Account */}
          <div className="relative pl-1.5" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu akun"
              aria-expanded={menuOpen}
              className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 transition-colors hover:bg-panel-raised"
            >
              <span className="hidden text-right sm:block">
                <span className="block text-xs font-semibold leading-tight text-ink">
                  {user?.name ?? "Pengguna"}
                </span>
                <span className="block text-2xs capitalize leading-tight text-ink-muted">
                  {describeRoles(user?.roles)}
                </span>
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-ink text-2xs font-bold text-ink-on">
                {getInitials(user?.name ?? "SD")}
              </span>
            </button>

            {menuOpen && (
              <div className="animate-in-up absolute right-0 top-full mt-2 w-56 overflow-hidden rounded-md border border-line bg-panel py-1 shadow-pop">
                <div className="border-b border-line px-4 py-3">
                  <p className="truncate text-sm font-semibold text-ink">
                    {user?.name}
                  </p>
                  <p className="data truncate text-2xs text-ink-muted">
                    {user?.email}
                  </p>
                </div>
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-panel-sunk hover:text-ink"
                >
                  <UserRound className="h-4 w-4" />
                  Profil saya
                </Link>
                <Link
                  to="/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-panel-sunk hover:text-ink"
                >
                  <Settings className="h-4 w-4" />
                  Pengaturan
                </Link>
                {/* Below sm these two stand in for their bar icons. Labelled,
                    because an icon alone in a menu row reads as decoration.
                    Search earns its place here rather than in the bar: at 320px
                    the 34px it cost left the page title no room at all, and the
                    ⌘K hint it carried is meaningless on a phone. */}
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setPaletteOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-panel-sunk hover:text-ink sm:hidden"
                >
                  <Search className="h-4 w-4" />
                  Cari
                </button>
                <button
                  onClick={toggleTheme}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-ink-muted transition-colors hover:bg-panel-sunk hover:text-ink sm:hidden"
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                  {theme === "dark" ? "Tema terang" : "Tema gelap"}
                </button>
                <button
                  onClick={() => {
                    logout();
                    navigate("/login", { replace: true });
                  }}
                  className="flex w-full items-center gap-2.5 border-t border-line px-4 py-2 text-sm text-rust-ink transition-colors hover:bg-rust-soft"
                >
                  <LogOut className="h-4 w-4" />
                  Keluar
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
