import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { authApi } from "../api/authApi";
import { useAuthStore } from "../store/authStore";

const MIN_LENGTH = 8;

/**
 * Changes the signed-in user's own password.
 *
 * The server ends every session of the user's on success, this one included,
 * so the dialog signs out and sends the user to the login page rather than
 * leaving a console that fails on its next token refresh.
 */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");

  const tooShort = next.length > 0 && next.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== next;
  const ready = current !== "" && next.length >= MIN_LENGTH && confirm === next;

  const close = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    onClose();
  };

  const change = useDeskMutation({
    mutationFn: () => authApi.changePassword(current, next),
    errorTitle: "Kata sandi tidak diubah",
    success: () => ({
      title: "Kata sandi diubah",
      description: "Semua sesi diakhiri. Masuk kembali dengan kata sandi baru.",
    }),
    invalidate: [],
    onDone: async () => {
      close();
      await logout();
      navigate("/login", { replace: true });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !change.isPending && close()}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) change.mutate(undefined as never);
          }}
        >
          <DialogHeader>
            <DialogTitle>Ubah kata sandi</DialogTitle>
            <DialogDescription>
              Setelah diubah, semua sesi Anda berakhir, termasuk yang ini. Masuk kembali dengan
              kata sandi baru.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <Field label="Kata sandi saat ini" htmlFor="pw-current" required>
              <TextInput
                id="pw-current"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field
              label="Kata sandi baru"
              htmlFor="pw-next"
              required
              hint={`Minimal ${MIN_LENGTH} karakter, dan tidak sama dengan kata sandi terakhir Anda.`}
              error={tooShort ? `Minimal ${MIN_LENGTH} karakter.` : undefined}
            >
              <TextInput
                id="pw-next"
                type="password"
                autoComplete="new-password"
                invalid={tooShort}
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
            </Field>
            <Field
              label="Ulangi kata sandi baru"
              htmlFor="pw-confirm"
              required
              error={mismatch ? "Tidak sama dengan kata sandi baru." : undefined}
            >
              <TextInput
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                invalid={mismatch}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={close} disabled={change.isPending}>
              Batal
            </Button>
            <Button type="submit" disabled={!ready || change.isPending}>
              Ubah kata sandi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
