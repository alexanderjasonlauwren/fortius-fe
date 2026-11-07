/**
 * What every notification adapter must provide.
 *
 * Split out of a single `notificationApi.ts` because the backend models
 * this as two real resources (`internal/controller/notification`, over
 * `notify.notifications` and `notify.reminder_settings`) with a lifecycle
 * -- same reasoning as every other feature's contract.
 */
import type { Notification, NotificationSettings, NotificationType } from "../types";

export interface NotificationApi {
  /** One inbox tab: unread in full, every other tab its newest 100. */
  getNotifications(tab?: InboxTab): Promise<InboxPage>;
  getUnreadCount(): Promise<number>;
  markAsRead(id: string): Promise<void>;
  markAsUnread(id: string): Promise<void>;
  markAllAsRead(): Promise<number>;
  deleteNotification(id: string): Promise<void>;
  clearReadNotifications(): Promise<number>;
  getNotificationSettings(): Promise<NotificationSettings>;
  saveNotificationSettings(settings: NotificationSettings): Promise<NotificationSettings>;
}

export type InboxTab = "Semua" | "Belum dibaca" | NotificationType;

export interface InboxPage {
  items: Notification[];
  /** Older notifications of this tab exist beyond what was read. */
  more: boolean;
}
