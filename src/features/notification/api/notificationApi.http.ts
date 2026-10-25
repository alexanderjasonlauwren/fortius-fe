/**
 * Notifications and reminder configuration, against the real API.
 *
 * `internal/controller/notification` over `notify.notifications` and
 * `notify.reminder_settings`.
 *
 * # What the real reminder settings do not carry
 *
 * The mock's `NotificationSettings.rules` has seven keys, each with its own
 * `penerima` (which roles receive it) and `kanal` (in-app/WhatsApp/email).
 * `notify.reminder_settings` has five toggles and one tenant-wide
 * `channels` array -- no per-rule recipients, no per-rule channels. Saving
 * here writes only the five real toggle/threshold pairs; `penerima` and
 * `kanal` on every rule are always the same placeholder on read and are
 * silently not persisted on write. `planUnconfirmed` and `orderPending`
 * have no column at all -- they read as permanently disabled and saving
 * them changes nothing server-side.
 *
 * `whatsapp` and `email` sender configuration and `sendTestNotification`
 * have no backend behind them either -- WhatsApp is explicitly out of
 * scope for this build (D3's own decision to skip it), and there is no
 * email-sending infrastructure. Both stay mock-only.
 *
 * # `href` is absent
 *
 * `NotificationResponse.subject_id` is the row's internal numeric id, not
 * a UUID any console route can link to -- resolving one would be a lookup
 * per notification on a list screen. A notification's title and message
 * carry the content; "Buka" has nowhere to go yet.
 */
import { getList, getOne, send } from "@/lib/api";
import type { Notification, NotificationSettings, ReminderRule, ReminderRuleKey } from "../types";
import type { NotificationApi } from "./contract";

/** Mirrors the backend's notification.NotificationResponse. */
interface NotificationResponse {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  subject_table?: string;
  subject_id?: number;
  action_url?: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

/** Mirrors the backend's notification.ReminderSettingsResponse. */
interface ReminderSettingsResponse {
  sa_expiry_enabled: boolean;
  sa_expiry_days_before: number;
  stock_low_enabled: boolean;
  stock_threshold_pct: number;
  payment_pending_enabled: boolean;
  payment_pending_days: number;
  delivery_delay_enabled: boolean;
  delivery_delay_minutes: number;
  quota_low_enabled: boolean;
  quota_low_threshold_pct: number;
  channels: string[];
  version: number;
}

const TYPE_TO_DOMAIN: Record<string, Notification["type"]> = {
  reminder: "Pengingat",
  alert: "Alert",
  system: "Sistem",
  // approval/delivery/payment/quota have no console category of their
  // own yet -- "something needs attention" is closer than a made-up one.
  approval: "Alert",
  delivery: "Alert",
  payment: "Alert",
  quota: "Alert",
};

/** The only rule this build's job actually raises -- see reminders.go's
 *  own header for why the other four are deferred. */
function ruleFor(row: NotificationResponse): ReminderRuleKey | undefined {
  if (row.type === "reminder" && row.subject_table === "schedule_agreements") return "saExpiry";
  return undefined;
}

function toNotification(row: NotificationResponse): Notification {
  return {
    id: row.id,
    type: TYPE_TO_DOMAIN[row.type] ?? "Sistem",
    title: row.title,
    message: row.message,
    timestamp: row.created_at,
    isRead: row.is_read,
    href: undefined,
    rule: ruleFor(row),
  };
}

async function getNotifications(): Promise<Notification[]> {
  const page = await getList<NotificationResponse>("/notifications", {
    pageSize: 100,
    sort: [{ field: "created_at", direction: "desc" }],
  });
  return page.items.map(toNotification);
}

async function getUnreadCount(): Promise<number> {
  const { count } = await getOne<{ count: number }>("/notifications/unread-count");
  return count;
}

async function markAsRead(id: string): Promise<void> {
  await send("post", `/notifications/${id}/read`);
}

async function markAsUnread(id: string): Promise<void> {
  await send("post", `/notifications/${id}/unread`);
}

async function markAllAsRead(): Promise<number> {
  const { count } = await send<{ count: number }>("post", "/notifications/mark-all-read");
  return count;
}

async function deleteNotification(id: string): Promise<void> {
  await send("delete", `/notifications/${id}`);
}

async function clearReadNotifications(): Promise<number> {
  const { count } = await send<{ count: number }>("post", "/notifications/clear-read");
  return count;
}

/** The console's placeholder for a rule the schema has no recipients or
 *  channels concept for -- see this file's own header. */
function placeholderRule(aktif: boolean, ambang: number): ReminderRule {
  return { aktif, ambang, penerima: [], kanal: ["app"] };
}

function toSettings(row: ReminderSettingsResponse): NotificationSettings {
  return {
    rules: {
      saExpiry: placeholderRule(row.sa_expiry_enabled, row.sa_expiry_days_before),
      quotaLow: placeholderRule(row.quota_low_enabled, row.quota_low_threshold_pct),
      stockLow: placeholderRule(row.stock_low_enabled, row.stock_threshold_pct),
      paymentPending: placeholderRule(row.payment_pending_enabled, row.payment_pending_days),
      deliveryDelay: placeholderRule(row.delivery_delay_enabled, row.delivery_delay_minutes),
      // No column in notify.reminder_settings -- always off, and saving
      // them changes nothing server-side. See this file's own header.
      planUnconfirmed: placeholderRule(false, 8),
      orderPending: placeholderRule(false, 10),
    },
    // No sender config exists server-side; mock-shaped defaults so the
    // settings screen has something to render. sendTestNotification and
    // the channel toggles below stay mock-only regardless of what a
    // caller sets here.
    whatsapp: { aktif: false, nomorPengirim: "", templatePengingat: "" },
    email: { aktif: false, pengirim: "" },
  };
}

async function getNotificationSettings(): Promise<NotificationSettings> {
  return toSettings(await getOne<ReminderSettingsResponse>("/reminder-settings"));
}

async function saveNotificationSettings(settings: NotificationSettings): Promise<NotificationSettings> {
  const current = await getOne<ReminderSettingsResponse>("/reminder-settings");
  const { rules } = settings;
  const saved = await send<ReminderSettingsResponse>("put", "/reminder-settings", {
    version: current.version,
    sa_expiry_enabled: rules.saExpiry.aktif,
    sa_expiry_days_before: rules.saExpiry.ambang,
    stock_low_enabled: rules.stockLow.aktif,
    stock_threshold_pct: rules.stockLow.ambang,
    payment_pending_enabled: rules.paymentPending.aktif,
    payment_pending_days: rules.paymentPending.ambang,
    delivery_delay_enabled: rules.deliveryDelay.aktif,
    delivery_delay_minutes: rules.deliveryDelay.ambang,
    quota_low_enabled: rules.quotaLow.aktif,
    quota_low_threshold_pct: rules.quotaLow.ambang,
    channels: current.channels,
  });
  return toSettings(saved);
}

export const notificationApiHttp: NotificationApi = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAsUnread,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  getNotificationSettings,
  saveNotificationSettings,
};
