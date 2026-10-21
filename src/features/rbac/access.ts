import { PERMISSIONS } from "./permissions";

/**
 * How a session's authority is described on screen.
 *
 * Both of these used to be a lookup keyed on one role name -- `ROLE_LABEL[role]`
 * and `ROLE_SUMMARY[role]` -- which worked only while the console pretended a
 * person had exactly one role and only while those names were the mock's own.
 * Against the API both assumptions fail: a person may hold several, and the
 * names are whatever the tenant called them.
 */

/**
 * The roles a person holds, as one line.
 *
 * The names come from the server and are the tenant's own words, so they are
 * shown as given rather than translated. An empty list is a real state -- a
 * user created but not yet granted anything -- and says so instead of showing
 * a role they do not have.
 */
export function describeRoles(roles: readonly string[] = []): string {
  return roles.length > 0 ? roles.join(", ") : "Belum ada peran";
}

/**
 * What this person can actually do, in a sentence.
 *
 * Derived from the permission set rather than from a role name, because the
 * permission set is what the server will enforce. A prose summary attached to a
 * role name was a promise the code could not keep: rename the role, or grant it
 * one more permission, and the sentence quietly became wrong.
 *
 * Deliberately coarse. This is orientation on a settings page, not a
 * specification -- the precise answer is the permission list itself, and a
 * screen that tried to render all 155 would be read by nobody.
 */
export function describeAccess(permissions: readonly string[] = []): string {
  if (permissions.length === 0) {
    return "Belum ada akses. Minta admin memberi peran di halaman Pengguna & Akses.";
  }

  const held = new Set(permissions);
  const canWrite = permissions.some(
    (p) => !p.includes(".read.") && !p.includes(".export."),
  );

  if (held.has(PERMISSIONS.USERS_EDIT) && held.has(PERMISSIONS.SETTINGS_EDIT)) {
    return "Akses penuh, termasuk pengaturan perusahaan dan manajemen pengguna.";
  }
  if (!canWrite) {
    return `Hanya membaca, pada ${permissions.length} izin. Tidak dapat mengubah data apa pun.`;
  }
  return `${permissions.length} izin di perusahaan ini, termasuk hak ubah.`;
}
