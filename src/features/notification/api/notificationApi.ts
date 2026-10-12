import { notificationApiHttp } from "./notificationApi.http";
import type { NotificationApi } from "./contract";

const api: NotificationApi = notificationApiHttp;

export const getNotifications = api.getNotifications.bind(api);
export const getUnreadCount = api.getUnreadCount.bind(api);
export const markAsRead = api.markAsRead.bind(api);
export const markAsUnread = api.markAsUnread.bind(api);
export const markAllAsRead = api.markAllAsRead.bind(api);
export const deleteNotification = api.deleteNotification.bind(api);
export const clearReadNotifications = api.clearReadNotifications.bind(api);
export const getNotificationSettings = api.getNotificationSettings.bind(api);
export const saveNotificationSettings = api.saveNotificationSettings.bind(api);
