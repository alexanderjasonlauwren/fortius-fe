/**
 * What every notification adapter must provide.
 *
 * Split out of a single `notificationApi.ts` because the backend models
 * this as two real resources (`internal/controller/notification`, over
 * `notify.notifications` and `notify.reminder_settings`) with a lifecycle
 * -- same reasoning as every other feature's contract.
 */
import type { Notification, NotificationSettings } from "../types";

export interface NotificationApi {
  getNotifications(): Promise<Notification[]>;
  getUnreadCount(): Promise<number>;
  markAsRead(id: string): Promise<void>;
  markAsUnread(id: string): Promise<void>;
  markAllAsRead(): Promise<number>;
  deleteNotification(id: string): Promise<void>;
  clearReadNotifications(): Promise<number>;
  getNotificationSettings(): Promise<NotificationSettings>;
  saveNotificationSettings(settings: NotificationSettings): Promise<NotificationSettings>;
}
