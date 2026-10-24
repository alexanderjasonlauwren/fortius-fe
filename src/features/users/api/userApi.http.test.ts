import { beforeEach, describe, expect, it, vi } from "vitest";

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
}));

const { getUsersWithAccess } = await import("./userApi.http");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const BRANCH_ID = "22222222-2222-4222-8222-222222222222";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    username: "manager",
    email: "manager@fortius.local",
    full_name: "Operations Manager",
    status: "atv",
    version: 2,
    created_at: "2026-01-05T02:00:00Z",
    updated_at: "2026-09-25T02:00:00Z",
    roles: [],
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
});

describe("users access adapter", () => {
  it("sends the selected UI role as stable backend role codes", async () => {
    getList.mockResolvedValue({ items: [], pagination: {} });

    await getUsersWithAccess({ role: "admin" });

    expect(getList).toHaveBeenCalledWith("/users/access", {
      search: undefined,
      pageSize: 100,
      filters: [
        { field: "role_code", operator: "in", value: "super_admin,tenant_admin" },
      ],
    });
  });

  it("maps real roles, branches and the successful-login timestamp", async () => {
    getList.mockResolvedValue({
      items: [
        wire({
          last_login_at: "2026-09-25T01:30:00Z",
          roles: [
            { code: "ops_manager", name: "Operations Manager", scope_type: "tenant" },
            {
              code: "dispatcher",
              name: "Dispatcher",
              scope_type: "branch",
              branch_id: BRANCH_ID,
              branch_name: "Pool Salatiga",
            },
          ],
        }),
      ],
      pagination: {},
    });

    const [user] = await getUsersWithAccess({ role: "Semua" });

    expect(user.roleCodes).toEqual(["ops_manager", "dispatcher"]);
    expect(user.roleNames).toEqual(["Operations Manager", "Dispatcher"]);
    expect(user.role).toBe("manager");
    expect(user.cabang).toBe("Semua cabang");
    expect(user.branchIds).toEqual([BRANCH_ID]);
    expect(user.terakhirMasuk).toBe("2026-09-25T01:30:00Z");
  });

  it("keeps a never-signed-in user honest instead of inventing activity", async () => {
    getList.mockResolvedValue({ items: [wire()], pagination: {} });

    const [user] = await getUsersWithAccess();

    expect(user.terakhirMasuk).toBeUndefined();
    expect(user.roleNames).toEqual([]);
    expect(user.cabang).toBe("");
  });
});

// Plan 3.4: roles are granted through the API (regression 2026-10-24: no
// screen or route could give anyone a role).
describe("role grants", () => {
  beforeEach(() => {
    getOne.mockReset();
    send.mockReset();
  });

  it("lists grantable roles and a user's grants in domain shape", async () => {
    const { listGrantableRoles, getUserRoles } = await import("./userApi.http");
    getOne.mockResolvedValueOnce([{ id: "r1", code: "finance_officer", name: "Finance Officer", is_system: true }]);
    expect(await listGrantableRoles()).toEqual([{ id: "r1", code: "finance_officer", name: "Finance Officer", isSystem: true }]);
    expect(getOne).toHaveBeenLastCalledWith("/roles");

    getOne.mockResolvedValueOnce([{
      id: "g1", role_id: "r1", role_code: "finance_officer", role_name: "Finance Officer",
      scope_type: "branch", branch_id: BRANCH_ID, branch_name: "Pool Salatiga", created_at: "2026-10-24T00:00:00Z",
    }]);
    expect(await getUserRoles(USER_ID)).toEqual([{
      id: "g1", roleId: "r1", roleCode: "finance_officer", roleName: "Finance Officer",
      scope: "branch", branchId: BRANCH_ID, branchName: "Pool Salatiga",
    }]);
    expect(getOne).toHaveBeenLastCalledWith(`/users/${USER_ID}/roles`);
  });

  it("grants tenant-wide or in one branch, and revokes by grant", async () => {
    const { grantRole, revokeRole } = await import("./userApi.http");
    send.mockResolvedValue({ id: "g2", role_id: "r1", role_code: "x", role_name: "X", scope_type: "tenant", created_at: "" });
    await grantRole(USER_ID, { roleId: "r1", scope: "tenant" });
    expect(send).toHaveBeenLastCalledWith("post", `/users/${USER_ID}/roles`, { role_id: "r1", scope_type: "tenant" });
    await grantRole(USER_ID, { roleId: "r1", scope: "branch", branchId: BRANCH_ID });
    expect(send).toHaveBeenLastCalledWith("post", `/users/${USER_ID}/roles`, { role_id: "r1", scope_type: "branch", branch_id: BRANCH_ID });

    send.mockResolvedValue(null);
    await revokeRole(USER_ID, "g2");
    expect(send).toHaveBeenLastCalledWith("delete", `/users/${USER_ID}/roles/g2`);
  });

  // The backend refuses a user with no password, so the console's create
  // form could never succeed.
  it("sends the initial password when creating a user", async () => {
    const { createOrUpdateUser } = await import("./userApi.http");
    send.mockResolvedValue(wire());
    await createOrUpdateUser({ nama: "Kasir Dua", email: "kasir2@fortius.local", password: "Rahasia-2026!" });
    expect(send.mock.calls[0][2]).toMatchObject({ username: "kasir2", password: "Rahasia-2026!" });
  });
});
