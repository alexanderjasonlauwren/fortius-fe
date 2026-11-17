import { ApiError } from "@/lib/api";

/**
 * What the login form says when signing in fails.
 *
 * The server's codes are stable and its messages may not be: the proxy's own
 * throttle answers before the API is reached, and older builds answered in
 * English. Unknown and wrong-password look the same on purpose -- naming
 * which one it was tells an attacker which accounts exist.
 */
export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Tidak dapat masuk. Periksa koneksi lalu coba lagi.";
  }
  switch (error.code) {
    case "ACCOUNT_LOCKED":
      return "Akun dikunci sementara karena terlalu banyak percobaan. Coba lagi nanti atau hubungi admin.";
    case "ACCOUNT_INACTIVE":
      return "Akun ini tidak aktif. Hubungi admin.";
  }
  if (error.status === 429) {
    const seconds = error.retryAfterSeconds;
    return seconds
      ? `Terlalu banyak percobaan masuk. Coba lagi dalam ${seconds} detik.`
      : "Terlalu banyak percobaan masuk. Coba lagi sebentar lagi.";
  }
  if (error.status === 401 || error.code === "INVALID_CREDENTIALS") {
    return "Email/username atau kata sandi salah.";
  }
  if (error.code === "NETWORK") {
    return "Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.";
  }
  return "Tidak dapat masuk saat ini. Coba lagi sebentar lagi.";
}
