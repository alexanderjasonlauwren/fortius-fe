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
    channels: ["in_app"],
    version: 1,
    ...overrides,
  };
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

  it("has no href -- subject_id is an internal id, not a routable UUID", async () => {
    getList.mockResolvedValue({ pagination: { has_next: false }, items: [wire()] });
    expect((await notificationApiHttp.getNotifications()).items[0].href).toBeUndefined();
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
  it("maps the five real rules and disables the two the schema has no column for", async () => {
    getOne.mockResolvedValue(settingsWire());
    const settings = await notificationApiHttp.getNotificationSettings();

    expect(settings.rules.saExpiry).toEqual({ aktif: true, ambang: 7, penerima: [], kanal: ["app"] });
    expect(settings.rules.planUnconfirmed.aktif).toBe(false);
    expect(settings.rules.orderPending.aktif).toBe(false);
  });

  it("has no sender configuration -- whatsapp and email stay off", async () => {
    getOne.mockResolvedValue(settingsWire());
    const settings = await notificationApiHttp.getNotificationSettings();
    expect(settings.whatsapp.aktif).toBe(false);
    expect(settings.email.aktif).toBe(false);
  });

  it("reads the current version before saving and sends only the five real fields", async () => {
    getOne.mockResolvedValue(settingsWire({ version: 6 }));
    send.mockResolvedValue(settingsWire({ version: 7, sa_expiry_days_before: 14 }));

    const settings = await notificationApiHttp.getNotificationSettings();
    settings.rules.saExpiry.ambang = 14;
    await notificationApiHttp.saveNotificationSettings(settings);

    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("put");
    expect(path).toBe("/reminder-settings");
    expect(body.version).toBe(6);
    expect(body.sa_expiry_days_before).toBe(14);
    // penerima/kanal have nowhere to go -- confirm they are not sent.
    expect(body.penerima).toBeUndefined();
    expect(body.kanal).toBeUndefined();
  });
});
