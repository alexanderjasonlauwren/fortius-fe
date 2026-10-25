import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Loader2, TriangleAlert } from "lucide-react";
import { useAuthStore } from "@/features/auth/store/authStore";
import { landingPathFor } from "@/layouts/nav";
import { Field, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { APP_NAME, APP_SUBTITLE } from "@/utils/constants";
import { cn } from "@/lib/utils";

/**
 * The hero is the dispatch rail, drawn flat: the same device the console opens
 * on, so the product's one memorable idea is present before you sign in. It is
 * an illustration, so lanes are numbered trucks, not invented drivers.
 */
const RAIL: { name: string; blocks: [number, number, string][] }[] = [
  {
    name: "Truk 01",
    blocks: [
      [4, 18, "done"],
      [26, 18, "done"],
      [50, 16, "run"],
    ],
  },
  {
    name: "Truk 02",
    blocks: [
      [12, 17, "done"],
      [36, 18, "run"],
      [62, 17, "queue"],
    ],
  },
  {
    name: "Truk 03",
    blocks: [
      [8, 16, "done"],
      [44, 18, "queue"],
      [70, 16, "queue"],
    ],
  },
  {
    name: "Truk 04",
    blocks: [
      [20, 18, "done"],
      [48, 15, "late"],
    ],
  },
];

const BLOCK_TONE: Record<string, string> = {
  done: "bg-[#2E6A55]",
  run: "bg-[#E0A32E]",
  queue: "bg-white/12",
  late: "bg-[#B03F27]",
};

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await login(email, password);
      // Read after the store settles: a sopir belongs on their run, not on a
      // dashboard of trucks that are not theirs.
      navigate(landingPathFor(useAuthStore.getState().user?.permissions), {
        replace: true,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-panel">
      {/* ── Hero ── */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[rgb(23_26_22)] p-12 lg:flex lg:w-[52%]">
        <div className="relative z-10 flex items-center gap-3">
          <svg viewBox="0 0 32 32" className="h-9 w-9" aria-hidden>
            <rect width="32" height="32" rx="6" fill="#E0A32E" />
            <rect x="7" y="7" width="3" height="18" fill="#171A16" />
            <rect x="13" y="9" width="12" height="3" rx="1.5" fill="#171A16" />
            <rect x="13" y="15" width="8" height="3" rx="1.5" fill="#171A16" opacity=".55" />
            <rect x="13" y="21" width="10" height="3" rx="1.5" fill="#171A16" opacity=".55" />
          </svg>
          <div>
            <p className="text-lg font-bold leading-tight tracking-[-0.02em] text-[#F4F5F0]">
              {APP_NAME}
            </p>
            <p className="label text-[0.625rem] text-[#9AA093]">{APP_SUBTITLE}</p>
          </div>
        </div>

        <div className="relative z-10">
          {/*
            "muatan", not "tabung". This is the one screen with no tenant, so
            there is no lexicon to ask -- whoever is looking at it has not
            signed in yet and the console does not know which business they
            run. A vertical's noun here is the first thing a water depot sees,
            and it cannot be swapped later the way every noun behind the login
            can. "Muatan" is the console's own generic word for a load, already
            on the planning screen.
          */}
          <h2 className="max-w-md text-[2.5rem] font-bold leading-[1.08] tracking-[-0.035em] text-[#F4F5F0]">
            Setiap muatan punya
            <br />
            jam berangkatnya.
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#9AA093]">
            Konsol operasional untuk agen distribusi: kuota pasokan, rencana rute,
            posisi armada, dan verifikasi pembayaran dalam satu papan.
          </p>

          {/* Dispatch rail motif */}
          <div className="mt-10 max-w-lg rounded-md border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="label text-[0.625rem] text-[#9AA093]">
                Papan berangkat
              </span>
              <span className="data text-[0.625rem] text-[#9AA093]">
                06:00 s.d. 18:00
              </span>
            </div>

            <div className="space-y-2.5">
              {RAIL.map((lane) => (
                <div key={lane.name} className="flex items-center gap-3">
                  <div className="w-28 shrink-0">
                    <p className="truncate text-[0.6875rem] font-medium text-[#F4F5F0]">
                      {lane.name}
                    </p>
                    <p className="data truncate text-[0.5625rem] text-[#9AA093]">
                      {lane.blocks.length} rit
                    </p>
                  </div>
                  <div className="relative h-4 flex-1 rounded-sm bg-white/[0.04]">
                    {lane.blocks.map(([left, width, tone], i) => (
                      <span
                        key={i}
                        className={cn("absolute inset-y-0 rounded-sm", BLOCK_TONE[tone])}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      />
                    ))}
                    {/* "now" marker */}
                    <span className="absolute inset-y-[-4px] left-[58%] w-px bg-[#E0A32E]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className="relative z-10 text-xs text-[#9AA093]">
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </div>

      {/* ── Form ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <p className="text-xl font-bold tracking-[-0.02em] text-ink">{APP_NAME}</p>
            <p className="label text-2xs text-ink-muted">{APP_SUBTITLE}</p>
          </div>

          <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink">Masuk</h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            Gunakan akun yang terdaftar di konsol agen Anda.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <Field label="Email" htmlFor="email" required>
              <TextInput
                id="email"
                type="email"
                mono
                autoComplete="username"
                placeholder="nama@perusahaan.id"
                value={email}
                invalid={!!error}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>

            <Field label="Kata sandi" htmlFor="password" required>
              <div className="relative">
                <TextInput
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Minimal 6 karakter"
                  value={password}
                  invalid={!!error}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-ink-muted transition-colors hover:text-ink"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </Field>

            {error && (
              <p
                role="alert"
                className="spine flex items-start gap-2.5 rounded-md bg-rust-soft px-3.5 py-2.5 text-rust"
              >
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rust-ink" />
                <span className="text-xs leading-relaxed text-ink">{error}</span>
              </p>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? "Memeriksa…" : "Masuk ke konsol"}
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
