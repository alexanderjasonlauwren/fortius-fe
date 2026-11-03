/**
 * Notifications and reminder configuration, against the real API.
 *
 * `internal/controller/notification`: the inbox over `notify.notifications`,
 * the rules over `notify.reminder_settings` with each rule's recipients and
 * channels (`routes`), and the outside channels over
 * `notify.channel_settings` (`/notification-channels`).
 *
 * The rules panel saves to two resources, channels first: a channel the
 * installation cannot send over is refused there (CHANNEL_NOT_CONFIGURED)
 * before any rule is written.
 */
import { getAllPages, getList, getOne, send } from "@/lib/api";
import type {
  Notification,
  NotificationSettings,
  OutsideChannel,
  ReminderRule,
  ReminderRuleKey,
} from "../types";
import type { InboxPage, InboxTab, NotificationApi } from "./contract";

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

/** Mirrors the backend's notification.ReminderRuleRoute. */
interface RouteWire {
  rule: string;
  role_codes: string[];
  channels: string[];
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
  plan_unconfirmed_enabled: boolean;
  plan_unconfirmed_hour: number;
  order_pending_enabled: boolean;
  order_pending_threshold: number;
  routes: RouteWire[];
  version: number;
}

/** Mirrors the backend's notification.ChannelSettingsResponse. */
interface ChannelSettingsResponse {
  email: { enabled: boolean; sender_name: string; available: boolean };
  whatsapp: { enabled: boolean; sender_number: string; template: string; available: boolean };
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

/** Each rule's wire name, toggle and threshold fields. */
const RULE_WIRE: Record<
  ReminderRuleKey,
  { rule: string; enabled: keyof ReminderSettingsResponse; threshold: keyof ReminderSettingsResponse }
> = {
  saExpiry: { rule: "sa_expiry", enabled: "sa_expiry_enabled", threshold: "sa_expiry_days_before" },
  quotaLow: { rule: "quota_low", enabled: "quota_low_enabled", threshold: "quota_low_threshold_pct" },
  stockLow: { rule: "stock_low", enabled: "stock_low_enabled", threshold: "stock_threshold_pct" },
  paymentPending: {
    rule: "payment_pending",
    enabled: "payment_pending_enabled",
    threshold: "payment_pending_days",
  },
  deliveryDelay: {
    rule: "delivery_delay",
    enabled: "delivery_delay_enabled",
    threshold: "delivery_delay_minutes",
  },
  planUnconfirmed: {
    rule: "plan_unconfirmed",
    enabled: "plan_unconfirmed_enabled",
    threshold: "plan_unconfirmed_hour",
  },
  orderPending: {
    rule: "order_pending",
    enabled: "order_pending_enabled",
    threshold: "order_pending_threshold",
  },
};

const RULE_KEYS = Object.keys(RULE_WIRE) as ReminderRuleKey[];

/** Which rule raised a notification, from what it is about. */
const SUBJECT_RULE: Record<string, ReminderRuleKey> = {
  "reminder:schedule_agreements": "saExpiry",
  "quota:branches": "quotaLow",
  "alert:products": "stockLow",
  "payment:payments": "paymentPending",
  "delivery:deliveries": "deliveryDelay",
  "reminder:distribution_orders": "planUnconfirmed",
  "approval:orders": "orderPending",
};

function toNotification(row: NotificationResponse): Notification {
  return {
    id: row.id,
    type: TYPE_TO_DOMAIN[row.type] ?? "Sistem",
    title: row.title,
    message: row.message,
    timestamp: row.created_at,
    isRead: row.is_read,
    // Only a console path: an absolute or protocol-relative ("//host") URL in
    // a notification is not ours to follow.
    href: row.action_url && /^\/(?!\/)/.test(row.action_url) ? row.action_url : undefined,
    rule: SUBJECT_RULE[`${row.type}:${row.subject_table ?? ""}`],
  };
}

/** The wire types each inbox tab covers. */
const TAB_TYPES: Record<string, string> = {
  Pengingat: "reminder",
  Alert: "alert,approval,delivery,payment,quota",
  Sistem: "system",
};

/**
 * One inbox tab. Unread is read whole -- it is what must not be missed, and
 * users clear it -- and every other tab is the newest 100 of its own types,
 * with `more` saying older ones exist. Both used to be filters over the
 * newest 100 of everything, so an older unread notice could not be found
 * (fixed 2026-11-02).
 */
async function getNotifications(tab: InboxTab = "Semua"): Promise<InboxPage> {
  const sort = [{ field: "created_at", direction: "desc" as const }];
  if (tab === "Belum dibaca") {
    const { items, truncated } = await getAllPages<NotificationResponse>("/notifications", {
      sort, filters: [{ field: "is_read", operator: "eq", value: "false" }],
    });
    return { items: items.map(toNotification), more: truncated };
  }
  const types = TAB_TYPES[tab];
  const page = await getList<NotificationResponse>("/notifications", {
    pageSize: 100,
    sort,
    filters: types
      ? [{ field: "type", operator: types.includes(",") ? "in" : "eq", value: types }]
      : undefined,
  });
  return { items: page.items.map(toNotification), more: page.pagination.has_next };
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

const OUTSIDE: OutsideChannel[] = ["whatsapp", "email"];

function toSettings(rules: ReminderSettingsResponse, channels: ChannelSettingsResponse): NotificationSettings {
  const routes = new Map(rules.routes.map((r) => [r.rule, r]));
  const out = {} as Record<ReminderRuleKey, ReminderRule>;
  for (const key of RULE_KEYS) {
    const wire = RULE_WIRE[key];
    const route = routes.get(wire.rule);
    out[key] = {
      aktif: rules[wire.enabled] as boolean,
      ambang: rules[wire.threshold] as number,
      penerima: route?.role_codes ?? [],
      kanal: (route?.channels ?? []).filter((c): c is OutsideChannel =>
        OUTSIDE.includes(c as OutsideChannel),
      ),
    };
  }
  return {
    rules: out,
    whatsapp: {
      aktif: channels.whatsapp.enabled,
      nomorPengirim: channels.whatsapp.sender_number,
      templatePengingat: channels.whatsapp.template,
      tersedia: channels.whatsapp.available,
    },
    email: {
      aktif: channels.email.enabled,
      pengirim: channels.email.sender_name,
      tersedia: channels.email.available,
    },
    versi: { aturan: rules.version, kanal: channels.version },
  };
}

async function getNotificationSettings(): Promise<NotificationSettings> {
  const [rules, channels] = await Promise.all([
    getOne<ReminderSettingsResponse>("/reminder-settings"),
    getOne<ChannelSettingsResponse>("/notification-channels"),
  ]);
  return toSettings(rules, channels);
}

/**
 * Saves at the versions read. A save from a stale screen is refused
 * (STALE_VERSION) instead of silently replacing someone else's.
 */
async function saveNotificationSettings(settings: NotificationSettings): Promise<NotificationSettings> {
  const channels = await send<ChannelSettingsResponse>("put", "/notification-channels", {
    version: settings.versi.kanal,
    email_enabled: settings.email.aktif,
    email_sender_name: settings.email.pengirim,
    whatsapp_enabled: settings.whatsapp.aktif,
    whatsapp_sender_number: settings.whatsapp.nomorPengirim,
    whatsapp_template: settings.whatsapp.templatePengingat,
  });

  const body: Record<string, unknown> = { version: settings.versi.aturan };
  for (const key of RULE_KEYS) {
    const wire = RULE_WIRE[key];
    body[wire.enabled] = settings.rules[key].aktif;
    body[wire.threshold] = settings.rules[key].ambang;
  }
  body.routes = RULE_KEYS.map((key) => ({
    rule: RULE_WIRE[key].rule,
    role_codes: settings.rules[key].penerima,
    channels: settings.rules[key].kanal,
  }));
  const rules = await send<ReminderSettingsResponse>("put", "/reminder-settings", body);
  return toSettings(rules, channels);
}

/** Sends a test over one channel to the caller's own address; answers where it went. */
async function sendTestNotification(channel: OutsideChannel): Promise<string> {
  const { sent_to } = await send<{ channel: string; sent_to: string }>(
    "post",
    "/notification-channels/test",
    { channel },
  );
  return sent_to;
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
  sendTestNotification,
};
