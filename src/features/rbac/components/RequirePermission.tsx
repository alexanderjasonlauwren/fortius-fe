import { Link } from "react-router-dom";
import { ShieldOff } from "lucide-react";
import { useAuthStore } from "@/features/auth/store/authStore";
import { landingPathFor, usesDriverConsole } from "@/layouts/nav";
import { Panel } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

/**
 * Gates a route on a permission, or on several.
 *
 * The sidebar hides what a role cannot use, but hiding a link is not access
 * control — a sopir who types /ledger reached the general ledger, which is the
 * whole finance position of the agency. `ProtectedRoute` only ever asked
 * whether someone was signed in.
 *
 * Renders a stated refusal rather than redirecting: a silent bounce to the
 * dashboard reads as a broken link, and leaves the person guessing whether the
 * page exists.
 *
 * # Why this takes a list
 *
 * Some endpoints require more than one permission, and `authorizer.Require` on
 * the backend is an AND. `GET /monitoring/board` wants both
 * `read.deliveries` and `read.gps_tracks`, because the board carries where a
 * named person is right now. Gating the route on the first alone let three
 * roles that hold it — warehouse_staff, finance_officer, auditor_viewer —
 * open a page whose only request answers 403.
 *
 * The prop shape mirrors `CanAccess` deliberately, rather than inventing a
 * second vocabulary for the same idea one directory apart.
 */
export function RequirePermission({
  permission,
  permissions: required,
  requireAll = true,
  children,
}: {
  permission?: string;
  /** Several permissions. Defaults to requiring all of them, matching the
   * backend's own AND; pass requireAll={false} for any-of. */
  permissions?: readonly string[];
  requireAll?: boolean;
  children: React.ReactNode;
}) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const permissions = useAuthStore((s) => s.user?.permissions);

  const granted = permission
    ? hasPermission(permission)
    : required
      ? requireAll
        ? required.every((code) => hasPermission(code))
        : required.some((code) => hasPermission(code))
      : true;

  if (granted) return <>{children}</>;
  return <AccessRefused permissions={permissions} />;
}

/**
 * Gates an office page away from the driver console.
 *
 * For a page whose grant a sopir holds for another reason: the driver role
 * reads the tenant (`iam.read.tenants`) so the run can show the agency's name
 * and labels, and the settings page is gated on that same read -- so a
 * permission check alone let a driver open the agency's profile, legal
 * identity and operating rules. The backend still refuses any write.
 */
export function RequireOfficeConsole({ children }: { children: React.ReactNode }) {
  const permissions = useAuthStore((s) => s.user?.permissions);
  if (!usesDriverConsole(permissions)) return <>{children}</>;
  return <AccessRefused permissions={permissions} />;
}

function AccessRefused({ permissions }: { permissions?: readonly string[] }) {
  return (
    <Panel spine="text-rust">
      <EmptyState
        icon={ShieldOff}
        title="Halaman ini di luar akses Anda"
        description="Peran akun Anda tidak mencakup halaman ini. Hubungi admin agen bila Anda memang memerlukannya."
        action={
          <Button asChild size="sm">
            <Link to={landingPathFor(permissions)}>Kembali ke halaman Anda</Link>
          </Button>
        }
      />
    </Panel>
  );
}
