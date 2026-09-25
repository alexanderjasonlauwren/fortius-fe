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
