import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import {
  clearReadNotifications,
  deleteNotification,
  getNotifications,
  getNotificationSettings,
  markAllAsRead,
  markAsRead,
  markAsUnread,
  saveNotificationSettings,
} from "../api/notificationApi";
import type { NotificationSettings, NotificationType } from "../types";

type FilterType = "Semua" | "Belum dibaca" | NotificationType;

export function useNotification() {
  const [activeFilter, setActiveFilter] = useState<FilterType>("Semua");

  const notifications = useQuery({
    queryKey: [...scopeKey(), "notifications"],
    queryFn: getNotifications,
  });

  const notificationSettings = useQuery({
    queryKey: [...scopeKey(), "notification-settings"],
    queryFn: getNotificationSettings,
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

  const all = notifications.data ?? [];
  const filtered = all.filter((n) => {
    if (activeFilter === "Semua") return true;
    if (activeFilter === "Belum dibaca") return !n.isRead;
    return n.type === activeFilter;
  });

  return {
    notifications: filtered,
    allNotifications: all,
    isLoading: notifications.isLoading,
    isError: notifications.isError,
    error: notifications.error as Error | null,
    activeFilter,
    setActiveFilter,
    unreadCount: all.filter((n) => !n.isRead).length,
    markAsReadMutation,
    markAsUnreadMutation,
    markAllAsReadMutation,
    deleteMutation,
    clearReadMutation,
    notificationSettings: notificationSettings.data,
    isLoadingSettings: notificationSettings.isLoading,
    saveSettingsMutation,
  };
}
