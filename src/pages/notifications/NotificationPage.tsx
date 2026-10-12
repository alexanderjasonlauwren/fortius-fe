import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Info,
  Mail,
  MessageSquare,
  Monitor,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
  Undo2,
} from "lucide-react";
import { useNotification } from "@/features/notification/hooks/useNotification";
import {
  CHANNEL_LABEL,
  RULE_META,
  type NotifChannel,
  type NotificationSettings,
} from "@/features/notification/types";
import { ROLE_LABEL } from "@/features/users/api/userApi";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import {
  Field,
  SegmentedControl,
  TextInput,
  TextareaInput,
  Toggle,
} from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateId, formatDateTimeId, relativeTime } from "@/lib/format";
import type { UserEntity } from "@/types/domain";
import { outletLabel } from "@/lib/lexicon";
import { useResettableState } from "@/hooks/useResettableState";

const TYPE_STYLE = {
  Alert: { spine: "text-rust", icon: TriangleAlert, iconClass: "text-rust-ink" },
  Pengingat: { spine: "text-signal", icon: Bell, iconClass: "text-signal-ink" },
  Sistem: { spine: "text-draft", icon: Info, iconClass: "text-ink-muted" },
} as const;

const CHANNEL_ICON: Record<NotifChannel, typeof Monitor> = {
  app: Monitor,
  whatsapp: MessageSquare,
  email: Mail,
};

const ROLES: UserEntity["role"][] = [
  "admin",
  "manager",
  "finance",
  "staff",
  "viewer",
  "driver",
];

/** Groups the inbox the way people scan it: today, yesterday, then older. */
function dayBucket(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff <= 0) return "Hari ini";
  if (diff === 1) return "Kemarin";
  if (diff < 7) return "Minggu ini";
  return formatDateId(iso);
}

export function NotificationPage() {
  const {
    notifications,
    allNotifications,
    isLoading,
    activeFilter,
    setActiveFilter,
    unreadCount,
    markAsReadMutation,
    markAsUnreadMutation,
    markAllAsReadMutation,
    deleteMutation,
    clearReadMutation,
    notificationSettings,
    isLoadingSettings,
    saveSettingsMutation,
  } = useNotification();

  const [form, setForm] = useResettableState<NotificationSettings | null>(
    [notificationSettings],
    () => (notificationSettings ? structuredClone(notificationSettings) : null),
  );

  const dirty =
    !!form &&
    !!notificationSettings &&
    JSON.stringify(form) !== JSON.stringify(notificationSettings);

  const count = (type: string) =>
    type === "Semua"
      ? allNotifications.length
      : type === "Belum dibaca"
        ? unreadCount
        : allNotifications.filter((n) => n.type === type).length;

  const readCount = allNotifications.length - unreadCount;

  // Group the visible list by day.
  const grouped = useMemo(() => {
    const map = new Map<string, typeof notifications>();
    for (const n of notifications) {
      const key = dayBucket(n.timestamp);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    return [...map.entries()];
  }, [notifications]);

  const patchRule = (key: string, patch: Record<string, unknown>) =>
    setForm((f) =>
      f
        ? {
            ...f,
            rules: {
              ...f.rules,
              [key]: { ...f.rules[key as keyof typeof f.rules], ...patch },
            },
          }
        : f,
    );

  const toggleIn = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifikasi"
        description="Peringatan yang dihasilkan sistem, dan aturan yang menentukan kapan peringatan itu dibuat serta siapa yang menerimanya."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => clearReadMutation.mutate(undefined as never)}
              disabled={readCount === 0 || clearReadMutation.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Bersihkan terbaca
            </Button>
            <Button
              onClick={() => markAllAsReadMutation.mutate(undefined as never)}
              disabled={unreadCount === 0 || markAllAsReadMutation.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tandai semua dibaca
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        {/* ── Inbox ── */}
        <div className="space-y-4 xl:col-span-3">
          <SegmentedControl
            value={activeFilter}
            onChange={setActiveFilter}
            options={[
              { value: "Semua" as const, label: "Semua", count: count("Semua") },
              {
                value: "Belum dibaca" as const,
                label: "Belum dibaca",
                count: count("Belum dibaca"),
              },
              { value: "Alert" as const, label: "Peringatan", count: count("Alert") },
              {
                value: "Pengingat" as const,
                label: "Pengingat",
                count: count("Pengingat"),
              },
              { value: "Sistem" as const, label: "Sistem", count: count("Sistem") },
            ]}
          />

          <Panel>
            {isLoading ? (
              <div className="space-y-4 p-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <EmptyState
                icon={BellOff}
                title={
                  activeFilter === "Semua"
                    ? "Tidak ada notifikasi"
                    : `Tidak ada notifikasi ${activeFilter.toLowerCase()}`
                }
                description="Peringatan muncul di sini sesuai aturan di samping. Aturan yang dimatikan tidak akan menghasilkan notifikasi sama sekali."
              />
            ) : (
              grouped.map(([bucket, items]) => (
                <section key={bucket}>
                  <p className="label border-b border-line bg-panel-sunk px-5 py-2 text-2xs text-ink-muted">
                    {bucket} · {items.length}
                  </p>
                  <ul className="divide-y divide-line">
                    {items.map((n) => {
                      const style = TYPE_STYLE[n.type];
                      const Icon = style.icon;
                      const meta = RULE_META.find((r) => r.key === n.rule);
                      return (
                        <li
                          key={n.id}
                          className={cn(
                            "spine flex gap-3 px-5 py-4 transition-colors hover:bg-panel-sunk",
                            style.spine,
                            !n.isRead && "bg-panel-sunk/60",
                          )}
                        >
                          <Icon
                            className={cn("mt-0.5 h-4 w-4 shrink-0", style.iconClass)}
                            strokeWidth={1.75}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <p
                                className={cn(
                                  "text-sm text-ink",
                                  !n.isRead && "font-semibold",
                                )}
                              >
                                {n.title}
                              </p>
                              <p
                                className="data shrink-0 text-2xs text-ink-muted"
                                title={formatDateTimeId(n.timestamp)}
                              >
                                {relativeTime(n.timestamp)}
                              </p>
                            </div>
                            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                              {n.message}
                            </p>
                            {meta && (
                              <p className="mt-1.5 text-2xs text-ink-muted">
                                Dari aturan{" "}
                                <span className="font-medium text-ink">{meta.label}</span>
                              </p>
                            )}
                            <div className="mt-2.5 flex flex-wrap items-center gap-1">
                              {n.href && (
                                <Button asChild variant="outline" size="xs">
                                  <Link
                                    to={n.href}
                                    onClick={() =>
                                      !n.isRead && markAsReadMutation.mutate(n.id)
                                    }
                                  >
                                    Buka
                                  </Link>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() =>
                                  n.isRead
                                    ? markAsUnreadMutation.mutate(n.id)
                                    : markAsReadMutation.mutate(n.id)
                                }
                              >
                                {n.isRead ? (
                                  <>
                                    <Undo2 className="h-3 w-3" />
                                    Tandai belum dibaca
                                  </>
                                ) : (
                                  <>
                                    <Check className="h-3 w-3" />
                                    Tandai dibaca
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={() => deleteMutation.mutate(n.id)}
                                className="hover:bg-rust-soft hover:text-rust-ink"
                              >
                                <Trash2 className="h-3 w-3" />
                                Hapus
                              </Button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))
            )}
          </Panel>
        </div>

        {/* ── Rules and channels, together ── */}
        <div className="space-y-4 xl:col-span-2">
          <Panel className="xl:sticky xl:top-[4.75rem]">
            <PanelHeader
              title="Aturan notifikasi"
              hint="Menentukan kapan peringatan dibuat, siapa yang menerimanya, dan lewat kanal apa"
              actions={
                dirty && (
                  <>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        notificationSettings &&
                        setForm(structuredClone(notificationSettings))
                      }
                    >
                      Urungkan
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => form && saveSettingsMutation.mutate(form)}
                      disabled={saveSettingsMutation.isPending}
                    >
                      Simpan
                    </Button>
                  </>
                )
              }
            />

            {isLoadingSettings || !form ? (
              <PanelBody className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </PanelBody>
            ) : (
              <div className="max-h-[34rem] divide-y divide-line overflow-y-auto">
                {RULE_META.map((meta) => {
                  const rule = form.rules[meta.key];
                  if (!rule) return null;
                  return (
                    <div key={meta.key} className="px-5">
                      <Toggle
                        label={meta.label}
                        description={meta.description}
                        checked={rule.aktif}
                        onChange={(aktif) => patchRule(meta.key, { aktif })}
                      />

                      {/* Parameters only matter while the rule is on. */}
                      {rule.aktif && (
                        <div className="space-y-3 pb-4 pl-0">
                          {meta.ambangLabel && (
                            <Field
                              label={meta.ambangLabel}
                              htmlFor={`ambang-${meta.key}`}
                              hint={meta.ambangSatuan}
                            >
                              <TextInput
                                id={`ambang-${meta.key}`}
                                type="number"
                                mono
                                min={meta.ambangMin}
                                max={meta.ambangMax}
                                value={rule.ambang}
                                onChange={(e) =>
                                  patchRule(meta.key, { ambang: Number(e.target.value) })
                                }
                              />
                            </Field>
                          )}

                          <div>
                            <p className="label mb-1.5 text-2xs text-ink-muted">
                              Penerima
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {ROLES.map((role) => {
                                const on = rule.penerima.includes(role);
                                return (
                                  <button
                                    key={role}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() =>
                                      patchRule(meta.key, {
                                        penerima: toggleIn(rule.penerima, role),
                                      })
                                    }
                                    className={cn(
                                      "rounded-sm border px-2 py-1 text-2xs font-medium transition-colors",
                                      on
                                        ? "border-ink bg-ink text-ink-on"
                                        : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
                                    )}
                                  >
                                    {ROLE_LABEL[role]}
                                  </button>
                                );
                              })}
                            </div>
                            {rule.penerima.length === 0 && (
                              <p className="mt-1.5 text-2xs font-medium text-rust-ink">
                                Tidak ada penerima — peringatan ini tidak akan sampai
                                ke siapa pun.
                              </p>
                            )}
                          </div>

                          <div>
                            <p className="label mb-1.5 text-2xs text-ink-muted">Kanal</p>
                            <div className="flex flex-wrap gap-1.5">
                              {(["app", "whatsapp", "email"] as NotifChannel[]).map(
                                (ch) => {
                                  const on = rule.kanal.includes(ch);
                                  const ChIcon = CHANNEL_ICON[ch];
                                  const available =
                                    ch === "app" ||
                                    (ch === "whatsapp" && form.whatsapp.aktif) ||
                                    (ch === "email" && form.email.aktif);
                                  return (
                                    <button
                                      key={ch}
                                      type="button"
                                      aria-pressed={on}
                                      disabled={!available}
                                      title={
                                        available
                                          ? undefined
                                          : "Kanal ini sedang nonaktif di bawah"
                                      }
                                      onClick={() =>
                                        patchRule(meta.key, {
                                          kanal: toggleIn(rule.kanal, ch),
                                        })
                                      }
                                      className={cn(
                                        "flex items-center gap-1.5 rounded-sm border px-2 py-1 text-2xs font-medium transition-colors disabled:opacity-45",
                                        on
                                          ? "border-signal bg-signal-soft text-signal-ink"
                                          : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
                                      )}
                                    >
                                      <ChIcon className="h-3 w-3" />
                                      {CHANNEL_LABEL[ch]}
                                    </button>
                                  );
                                },
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Channels live here too — "what notifies me" and "how I am told"
              are one decision, and used to be split across two pages. */}
          {form && (
            <Panel>
              <PanelHeader title="Kanal pengiriman" />
              <PanelBody className="space-y-4">
                <div className="divide-y divide-line">
                  <Toggle
                    label="WhatsApp"
                    description={`Pesan otomatis ke ${outletLabel()} dan tim lapangan.`}
                    checked={form.whatsapp.aktif}
                    onChange={(aktif) =>
                      setForm({ ...form, whatsapp: { ...form.whatsapp, aktif } })
                    }
                  />
                  <Toggle
                    label="Email"
                    description="Ringkasan dan peringatan ke alamat tim kantor."
                    checked={form.email.aktif}
                    onChange={(aktif) =>
                      setForm({ ...form, email: { ...form.email, aktif } })
                    }
                  />
                </div>

                {form.whatsapp.aktif && (
                  <>
                    <Field label="Nomor pengirim WhatsApp" htmlFor="wa-nomor">
                      <TextInput
                        id="wa-nomor"
                        mono
                        value={form.whatsapp.nomorPengirim}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            whatsapp: {
                              ...form.whatsapp,
                              nomorPengirim: e.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                    <Field
                      label="Templat pesan"
                      htmlFor="wa-templat"
                      hint={`Penanda isian: {${outletLabel()}}, {jumlah}, {tanggal}, {jam}.`}
                    >
                      <TextareaInput
                        id="wa-templat"
                        rows={3}
                        value={form.whatsapp.templatePengingat}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            whatsapp: {
                              ...form.whatsapp,
                              templatePengingat: e.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                  </>
                )}

                {form.email.aktif && (
                  <>
                    <Field label="Alamat pengirim email" htmlFor="mail-from">
                      <TextInput
                        id="mail-from"
                        type="email"
                        mono
                        value={form.email.pengirim}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            email: { ...form.email, pengirim: e.target.value },
                          })
                        }
                      />
                    </Field>
                  </>
                )}

                {dirty && (
                  <p className="flex items-center gap-2 rounded-md border border-line bg-signal-soft px-3 py-2 text-xs text-ink">
                    <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                    Ada perubahan aturan yang belum disimpan.
                  </p>
                )}
              </PanelBody>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
