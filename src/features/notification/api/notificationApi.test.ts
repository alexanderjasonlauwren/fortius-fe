import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for notifications and reminder settings,
 * following orderApi.test.ts's own pattern.
 */

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();

const getAllPages = vi.fn();
vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getAllPages: (...args: unknown[]) => getAllPages(...args),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const { notificationApiHttp } = await import("./notificationApi.http");

const ID = "11111111-1111-4111-8111-111111111111";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    type: "reminder",
    severity: "warning",
    title: "Agreement mendekati kedaluwarsa",
    message: "SA-001 berakhir pada 14 September 2026.",
    subject_table: "schedule_agreements",
    subject_id: 5,
    is_read: false,
    created_at: "2026-09-11T00:00:00Z",
    ...overrides,
  };
}

function settingsWire(overrides: Record<string, unknown> = {}) {
  return {
    sa_expiry_enabled: true,
    sa_expiry_days_before: 7,
    stock_low_enabled: true,
    stock_threshold_pct: 20,
    payment_pending_enabled: true,
    payment_pending_days: 3,
    delivery_delay_enabled: true,
    delivery_delay_minutes: 60,
    quota_low_enabled: true,
    quota_low_threshold_pct: 15,
    plan_unconfirmed_enabled: false,
    plan_unconfirmed_hour: 15,
    order_pending_enabled: true,
    order_pending_threshold: 10,
    routes: [
      { rule: "sa_expiry", role_codes: [], channels: [] },
      { rule: "payment_pending", role_codes: ["finance_officer"], channels: ["email"] },
    ],
    version: 1,
    ...overrides,
  };
}

function channelsWire(overrides: Record<string, unknown> = {}) {
  return {
    email: { enabled: true, sender_name: "PT Agen", available: true },
    whatsapp: { enabled: false, sender_number: "0812", template: "", available: false },
    version: 2,
    ...overrides,
  };
}

/** getOne answers each settings resource by its path. */
function settingsReads(rules = settingsWire(), channels = channelsWire()) {
  getOne.mockImplementation((path: string) =>
    Promise.resolve(path === "/notification-channels" ? channels : rules),
  );
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
});

describe("getNotifications", () => {
  it("maps the type vocabulary onto the console's own three categories", async () => {
    getList.mockResolvedValue({
      pagination: { has_next: false },
      items: [
        wire({ id: "1", type: "reminder" }),
        wire({ id: "2", type: "alert" }),
        wire({ id: "3", type: "system" }),
        wire({ id: "4", type: "payment" }),
      ],
    });
    const { items: rows } = await notificationApiHttp.getNotifications();
    expect(rows.map((r) => r.type)).toEqual(["Pengingat", "Alert", "Sistem", "Alert"]);
  });

  it("tags a schedule-agreement reminder with the saExpiry rule", async () => {
    getList.mockResolvedValue({ pagination: { has_next: false }, items: [wire()] });
    expect((await notificationApiHttp.getNotifications()).items[0].rule).toBe("saExpiry");
  });

  it("leaves rule undefined for anything that is not a known reminder shape", async () => {
    getList.mockResolvedValue({ pagination: { has_next: false }, items: [wire({ type: "alert", subject_table: undefined })] });
    expect((await notificationApiHttp.getNotifications()).items[0].rule).toBeUndefined();
  });

  it("tags each generated reminder with the rule that raised it", async () => {
    getList.mockResolvedValue({
      pagination: { has_next: false },
      items: [
        wire({ type: "alert", subject_table: "products" }),
        wire({ type: "quota", subject_table: "branches" }),
        wire({ type: "reminder", subject_table: "distribution_orders" }),
        wire({ type: "approval", subject_table: "orders" }),
      ],
    });
    const { items } = await notificationApiHttp.getNotifications();
    expect(items.map((n) => n.rule)).toEqual(["stockLow", "quotaLow", "planUnconfirmed", "orderPending"]);
  });

  it("links Buka to the reminder's console path, and to nothing outside the console", async () => {
    getList.mockResolvedValue({
      pagination: { has_next: false },
      items: [
        wire({ action_url: "/inventory" }),
        wire({ action_url: "https://evil.test/" }),
        wire({ action_url: "//evil.test/" }),
        wire(),
      ],
    });
    const { items } = await notificationApiHttp.getNotifications();
    expect(items.map((n) => n.href)).toEqual(["/inventory", undefined, undefined, undefined]);
  });
});

// Regression 2026-11-02: "Belum dibaca" and the type tabs filtered the newest
// 100 of everything, so an older unread notice could not be found.
describe("inbox tabs", () => {
  it("reads every unread notification, through every page", async () => {
    getAllPages.mockResolvedValue({ items: [wire({ id: "u1", is_read: false })], truncated: false });
    const page = await notificationApiHttp.getNotifications("Belum dibaca");
    expect(page.items.map((n) => n.id)).toEqual(["u1"]);
    expect(page.more).toBe(false);
    expect(getAllPages.mock.calls[0][1].filters).toEqual([{ field: "is_read", operator: "eq", value: "false" }]);
  });

  it("asks for a tab's own types, and says when older ones exist", async () => {
    getList.mockResolvedValue({ items: [], pagination: { has_next: true } });
    const page = await notificationApiHttp.getNotifications("Alert");
    expect(getList.mock.calls[0][1].filters).toEqual([
      { field: "type", operator: "in", value: "alert,approval,delivery,payment,quota" },
    ]);
    expect(page.more).toBe(true);
  });
});

describe("unread count and inbox actions", () => {
  it("unwraps the count", async () => {
    getOne.mockResolvedValue({ count: 4 });
    expect(await notificationApiHttp.getUnreadCount()).toBe(4);
  });

  it("marks read and unread by id", async () => {
    send.mockResolvedValue(undefined);
    await notificationApiHttp.markAsRead(ID);
    expect(send.mock.calls[0]).toEqual(["post", `/notifications/${ID}/read`]);

    await notificationApiHttp.markAsUnread(ID);
    expect(send.mock.calls[1]).toEqual(["post", `/notifications/${ID}/unread`]);
  });

  it("deletes by id", async () => {
    send.mockResolvedValue(undefined);
    await notificationApiHttp.deleteNotification(ID);
    expect(send.mock.calls[0]).toEqual(["delete", `/notifications/${ID}`]);
  });

  it("markAllAsRead and clearReadNotifications return the count", async () => {
    send.mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 2 });
    expect(await notificationApiHttp.markAllAsRead()).toBe(3);
    expect(await notificationApiHttp.clearReadNotifications()).toBe(2);
  });
});

describe("reminder settings", () => {
  it("maps all seven rules with their routes; an unrouted rule has no recipients or channels", async () => {
    settingsReads();
    const settings = await notificationApiHttp.getNotificationSettings();

    expect(settings.rules.saExpiry).toEqual({ aktif: true, ambang: 7, penerima: [], kanal: [] });
    expect(settings.rules.paymentPending).toEqual({
      aktif: true, ambang: 3, penerima: ["finance_officer"], kanal: ["email"],
    });
    expect(settings.rules.orderPending).toEqual({ aktif: true, ambang: 10, penerima: [], kanal: [] });
    expect(settings.rules.planUnconfirmed.ambang).toBe(15);
    expect(settings.versi).toEqual({ aturan: 1, kanal: 2 });
  });

  it("reads each channel's availability, so an unavailable one can be shown as such", async () => {
    settingsReads();
    const settings = await notificationApiHttp.getNotificationSettings();
    expect(settings.email).toEqual({ aktif: true, pengirim: "PT Agen", tersedia: true });
    expect(settings.whatsapp).toMatchObject({ aktif: false, nomorPengirim: "0812", tersedia: false });
  });

  it("saves channels first, then every rule with its route, at the versions read", async () => {
    settingsReads(settingsWire({ version: 6 }), channelsWire({ version: 4 }));
    send.mockImplementation((_method: string, path: string) =>
      Promise.resolve(path === "/notification-channels" ? channelsWire({ version: 5 }) : settingsWire({ version: 7 })),
    );

    const settings = await notificationApiHttp.getNotificationSettings();
    settings.rules.saExpiry.ambang = 14;
    settings.rules.stockLow.penerima = ["warehouse_staff"];
    settings.rules.stockLow.kanal = ["email"];
    const saved = await notificationApiHttp.saveNotificationSettings(settings);

    expect(send.mock.calls.map((c) => c[1])).toEqual(["/notification-channels", "/reminder-settings"]);
    expect(send.mock.calls[0][2]).toMatchObject({ version: 4, email_enabled: true, email_sender_name: "PT Agen" });
    const body = send.mock.calls[1][2];
    expect(body.version).toBe(6);
    expect(body.sa_expiry_days_before).toBe(14);
    expect(body.order_pending_enabled).toBe(true);
    expect(body.routes).toHaveLength(7);
    expect(body.routes).toContainEqual({ rule: "stock_low", role_codes: ["warehouse_staff"], channels: ["email"] });
    expect(saved.versi).toEqual({ aturan: 7, kanal: 5 });
  });

  it("does not fetch a fresher version before saving: a stale screen must be refused", async () => {
    settingsReads();
    send.mockImplementation((_method: string, path: string) =>
      Promise.resolve(path === "/notification-channels" ? channelsWire() : settingsWire()),
    );
    const settings = await notificationApiHttp.getNotificationSettings();
    getOne.mockClear();
    await notificationApiHttp.saveNotificationSettings(settings);
    expect(getOne).not.toHaveBeenCalled();
  });

  it("sends a test over a channel and answers where it went", async () => {
    send.mockResolvedValue({ channel: "email", sent_to: "admin@agen.test" });
    expect(await notificationApiHttp.sendTestNotification("email")).toBe("admin@agen.test");
    expect(send.mock.calls[0]).toEqual(["post", "/notification-channels/test", { channel: "email" }]);
  });
});
