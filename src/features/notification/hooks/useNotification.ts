import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import {
  clearReadNotifications,
  deleteNotification,
  getNotifications,
  getNotificationSettings,
  getUnreadCount,
  markAllAsRead,
  markAsRead,
  markAsUnread,
  saveNotificationSettings,
  sendTestNotification,
} from "../api/notificationApi";
import { listGrantableRoles } from "@/features/users/api/userApi";
import { holds } from "@/features/rbac/holds";
import { PERMISSIONS } from "@/features/rbac/permissions";
import type { NotificationSettings, NotificationType, OutsideChannel } from "../types";

type FilterType = "Semua" | "Belum dibaca" | NotificationType;

export function useNotification() {
  const [activeFilter, setActiveFilter] = useState<FilterType>("Semua");

  // Each tab is its own server read; the badge is the server's own count,
  // not a count over whatever was loaded.
  const notifications = useQuery({
    queryKey: [...scopeKey(), "notifications", activeFilter],
    queryFn: () => getNotifications(activeFilter),
  });
  const unread = useQuery({ queryKey: [...scopeKey(), "unread-count"], queryFn: getUnreadCount });

  const canViewRules = holds(PERMISSIONS.REMINDER_SETTINGS_VIEW);
  const notificationSettings = useQuery({
    queryKey: [...scopeKey(), "notification-settings"],
    queryFn: getNotificationSettings,
    enabled: canViewRules,
  });
  // The recipient picker. Without the permission to list roles, the panel
  // still shows the codes already chosen.
  const roles = useQuery({
    queryKey: [...scopeKey(), "grantable-roles"],
    queryFn: listGrantableRoles,
    enabled: canViewRules && holds(PERMISSIONS.ROLES_VIEW),
  });

  const markAsReadMutation = useDeskMutation({
    mutationFn: markAsRead,
    errorTitle: "Gagal menandai notifikasi",
  });

  const markAsUnreadMutation = useDeskMutation({
    mutationFn: markAsUnread,
    errorTitle: "Gagal menandai notifikasi",
  });

  const markAllAsReadMutation = useDeskMutation({
    mutationFn: markAllAsRead,
    errorTitle: "Gagal menandai notifikasi",
    success: (count) =>
      count === 0
        ? { title: "Tidak ada notifikasi yang belum dibaca", tone: "info" }
        : { title: `${count} notifikasi ditandai sudah dibaca` },
  });

  const deleteMutation = useDeskMutation({
    mutationFn: deleteNotification,
    errorTitle: "Gagal menghapus notifikasi",
    success: "Notifikasi dihapus",
  });

  const clearReadMutation = useDeskMutation({
    mutationFn: clearReadNotifications,
    errorTitle: "Gagal membersihkan notifikasi",
    success: (count) =>
      count === 0
        ? { title: "Tidak ada notifikasi terbaca untuk dibersihkan", tone: "info" }
        : { title: `${count} notifikasi terbaca dihapus` },
  });

  const saveSettingsMutation = useDeskMutation({
    mutationFn: (settings: NotificationSettings) => saveNotificationSettings(settings),
    errorTitle: "Gagal menyimpan aturan notifikasi",
    success: "Aturan notifikasi disimpan",
  });

  const testChannelMutation = useDeskMutation({
    mutationFn: (channel: OutsideChannel) => sendTestNotification(channel),
    errorTitle: "Pesan uji tidak terkirim",
    success: (sentTo) => ({ title: "Pesan uji terkirim", description: `Ke ${sentTo}.` }),
    invalidate: [],
  });


  return {
    notifications: notifications.data?.items ?? [],
    /** Older notifications of this tab exist beyond those shown. */
    more: notifications.data?.more ?? false,
    isLoading: notifications.isLoading,
    isError: notifications.isError,
    error: notifications.error as Error | null,
    activeFilter,
    setActiveFilter,
    unreadCount: unread.data ?? 0,
    markAsReadMutation,
    markAsUnreadMutation,
    markAllAsReadMutation,
    deleteMutation,
    clearReadMutation,
    canViewRules,
    canEditRules: holds(PERMISSIONS.REMINDER_SETTINGS_EDIT),
    notificationSettings: notificationSettings.data,
    isLoadingSettings: notificationSettings.isLoading,
    roles: roles.data ?? [],
    saveSettingsMutation,
    testChannelMutation,
  };
}
