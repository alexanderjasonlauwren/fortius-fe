/**
 * Atur ulang kata sandi: an administrator sets a new password for someone who
 * lost theirs, or whose phone was lost.
 *
 * The server ends every session the person has, on every device, so the dialog
 * says that before saving -- a driver mid-run is signed out of /sopir and must
 * sign in again with what the office gives them.
 */
import { useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2, Wand2 } from "lucide-react";
import { Field, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import type { UserEntity } from "@/types/domain";
import { resetPassword } from "../api/userApi";
import { generatePassword } from "../lib/password";

export function ResetPasswordDialog({ user, onClose }: { user: UserEntity | null; onClose: () => void }) {
  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed by user so reopening for someone else starts from an empty form. */}
        {user && <ResetPasswordForm key={user.id} user={user} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordForm({ user, onClose }: { user: UserEntity; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useDeskMutation({
    mutationFn: (next: string) => resetPassword(user.id, next),
    errorTitle: "Kata sandi tidak diganti",
    success: () => ({
      title: `Kata sandi ${user.nama} diganti`,
      description: "Semua sesinya sudah diakhiri. Ia masuk lagi dengan kata sandi baru.",
    }),
    onDone: onClose,
  });

  const generate = () => {
    setPassword(generatePassword());
    setVisible(true);
    setCopied(false);
    setError(null);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      // Clipboard is refused outside a secure context or without permission;
      // the password is on screen to copy by hand.
      setVisible(true);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      return;
    }
    setError(null);
    mutation.mutate(password);
  };

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Atur ulang kata sandi</DialogTitle>
        <DialogDescription>
          Kata sandi baru untuk <span className="font-medium text-ink">{user.nama}</span>
          {user.email ? <span className="data"> ({user.email})</span> : null}.
        </DialogDescription>
      </DialogHeader>

      <div className="mb-5 space-y-4">
        <Field
          label="Kata sandi baru"
          htmlFor="reset-password"
          error={error ?? undefined}
          hint="Minimal 8 karakter, mengikuti aturan kata sandi perusahaan. Sampaikan langsung ke pengguna, jangan lewat grup."
          required
        >
          <div className="flex gap-2">
            <TextInput
              id="reset-password"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              mono
              value={password}
              invalid={!!error}
              onChange={(event) => {
                setPassword(event.target.value);
                setCopied(false);
              }}
              disabled={mutation.isPending}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={visible ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
              onClick={() => setVisible((shown) => !shown)}
            >
              {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Salin kata sandi"
              onClick={copy}
              disabled={!password}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </Field>

        <Button type="button" variant="outline" size="sm" onClick={generate} disabled={mutation.isPending}>
          <Wand2 className="h-3.5 w-3.5" />
          Buat kata sandi acak
        </Button>

        <p className="rounded-sm bg-panel-sunk px-3.5 py-2.5 text-xs leading-relaxed text-ink">
          Semua sesi {user.nama} di perangkat mana pun berakhir begitu kata sandi diganti, termasuk aplikasi
          sopir. Ia harus masuk lagi dengan kata sandi baru ini.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" type="button" onClick={onClose} disabled={mutation.isPending}>
          Batal
        </Button>
        <Button type="submit" disabled={mutation.isPending || !password}>
          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {mutation.isPending ? "Menyimpan…" : "Ganti kata sandi"}
        </Button>
      </DialogFooter>
    </form>
  );
}
