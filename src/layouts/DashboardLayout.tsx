import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useSidebarShortcut, useSidebarStore } from "@/hooks/useSidebar";
import { useScope } from "@/features/tenancy/useScope";
import { LinkTenantBanner } from "@/features/tenancy/LinkTenantBanner";
import { getBranches, getTenants } from "@/features/tenancy/api/tenancyApi";
import { setBranchRegistry, setTenantRegistry } from "@/features/tenancy/tenantRegistry";
import { getSettings } from "@/features/settings/api/settingsApi";
import { hydrateLexicon, setLexicon } from "@/lib/lexicon";
import { getActingTenant, scopeKey } from "@/lib/scope";
import { cn } from "@/lib/utils";

export function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const collapsed = useSidebarStore((s) => s.collapsed);

  // Establishes the active branch before any child query runs.
  // The tenant list, fetched through whichever adapter this build uses and
  // handed to the registry that useScope reads synchronously. Done here because
  // the layout owns the session and renders above every screen that needs a
  // scope.
  const tenantList = useQuery({
    queryKey: ["tenants", "registry"],
    queryFn: getTenants,
    staleTime: 5 * 60_000,
  });
  if (tenantList.data) setTenantRegistry(tenantList.data);

  // Same pattern for branches. A tenant switch empties the registry and clears
  // the cache, so this refetches for the new tenant.
  const branchList = useQuery({
    queryKey: ["branches", "registry"],
    queryFn: () => getBranches(getActingTenant()),
    staleTime: 5 * 60_000,
  });
  if (branchList.data) setBranchRegistry(branchList.data);

  const scope = useScope();
  const { branchId } = scope;

  // This tenant's vocabulary. Set during render rather than in an
  // effect, the same way useScope sets the active scope: print templates and
  // toast strings read it synchronously and cannot wait for a commit.
  const settings = useQuery({
    queryKey: [...scopeKey(), "settings"],
    queryFn: getSettings,
    staleTime: 5 * 60_000,
  });
  // Hydrate from this tenant's cache first, so the first paint after a switch
  // shows neutral words rather than the tenant we just left.
  hydrateLexicon(scope.tenant?.id ?? "");
  if (settings.data) setLexicon(settings.data.istilah, scope.tenant?.id ?? "");

  useSidebarShortcut();

  // Lock the page behind the mobile drawer. (The drawer closes itself: every
  // nav item calls onClose.)
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  return (
    <div
      className="app-shell min-h-screen bg-paper"
      data-sidebar={collapsed ? "collapsed" : "expanded"}
    >
      <a
        href="#konten"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[2100] focus:rounded-md focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink-on"
      >
        Lompat ke konten
      </a>

      {/* Above the header (z-1001, which clears Leaflet's 1000-deep panes).
          At z-40 the scrim and drawer slid UNDER the header, which hid the
          drawer's own wordmark and put its close button behind the header —
          untappable, with the hamburger sitting on top of it. */}
      {sidebarOpen && (
        <div
          className="animate-in-fade fixed inset-0 z-[1100] bg-ink/50 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Desktop sidebar is a grid column — its width is the grid's job now. */}
      <aside className="sticky top-0 hidden h-screen overflow-hidden lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer stays an overlay. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-[1101] transform transition-transform duration-300 ease-desk lg:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        {/* Keyed on the scope: pages do not read the URL themselves, so without
            a remount their query keys would keep the scope they were last
            rendered with and quietly show the previous tenant's or branch's
            data. */}
        <main
          id="konten"
          key={`${scope.tenant?.id ?? ""}:${branchId ?? "semua"}`}
          className="flex-1 px-4 pb-14 pt-6 sm:px-6 lg:px-7"
        >
          <LinkTenantBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
