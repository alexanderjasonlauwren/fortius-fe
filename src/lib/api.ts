import axios, { AxiosError, type AxiosRequestConfig } from "axios";

import { listQueryString, type ListParams } from "./listQuery";
import {
  clearSessionTokens,
  getAccessToken,
  getRefreshToken,
  setSessionTokens,
  type SessionTokens,
} from "./tokens";

export const apiClient = axios.create({
  // Includes the version segment, because every path in every adapter is
  // written relative to it ("/users", "/profile"). The default was
  // ":3000/api" — the wrong port and one segment short of the router's
  // /api/v1 group, so every request 404'd. It went unnoticed because nothing
  // had run against the API: the auth store was mock-only, so no build could
  // get past the login screen to find out.
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8007/api/v1",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

// Request interceptor - Add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

/* ------------------------------------------------------------------------- *
 * Silent refresh
 *
 * Access tokens last 15 minutes, so without this a user is thrown back to the
 * login screen four times an hour. On a 401 the client exchanges its refresh
 * token for a new session and replays the original request once.
 *
 * The single-flight guard below is not an optimisation — it is required for
 * correctness. The server rotates the refresh token on every use and treats a
 * second presentation of the same token as a replay, which revokes the whole
 * session family. A page that fires six requests on load and gets six 401s
 * would send six refreshes with the same token: the first succeeds, the other
 * five look exactly like a stolen token being reused, and the user is logged
 * out of every device. So the first 401 refreshes and the rest wait on it.
 * ------------------------------------------------------------------------- */

/** In-flight refresh, shared by every request that hits a 401 while it runs. */
let refreshInFlight: Promise<string> | null = null;

/** Requests that already retried once, so a persistent 401 cannot loop. */
const RETRIED = Symbol("retried");
type RetriableConfig = AxiosRequestConfig & { [RETRIED]?: boolean };

/**
 * Called when the session cannot be recovered. Assigned by the auth store so
 * this module does not have to know how the app navigates.
 */
let onSessionExpired: () => void = () => {
  clearSessionTokens();
  window.location.href = "/login";
};

export function setSessionExpiredHandler(handler: () => void): void {
  onSessionExpired = handler;
}

async function refreshSession(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error("no refresh token");

  // A bare axios call, not apiClient: going through the instance would attach
  // the dead access token and re-enter this interceptor on failure.
  const response = await axios.post<Envelope<SessionTokens>>(
    `${apiClient.defaults.baseURL}/auth/refresh`,
    { refresh_token: refreshToken },
    { headers: { "Content-Type": "application/json" } },
  );

  const tokens = response.data.data;
  setSessionTokens(tokens);
  return tokens.token;
}

/**
 * Exchanges the refresh token at `path` for a new session and stores it.
 * Returns the new access token.
 *
 * For exchanges other than a plain refresh, such as POST /auth/switch-tenant.
 * It runs under the same single-flight slot as the silent refresh, for the
 * same reason: both spend the refresh token, and two exchanges presenting one
 * token look to the server like a stolen token being replayed. A refresh
 * already running is waited out first so this presents the token it produced;
 * requests that 401 meanwhile wait on this exchange instead of starting one.
 *
 * A bare axios call, like `refreshSession`: through apiClient, a 401 would
 * re-enter the interceptor, which would wait on this very exchange.
 */
export async function exchangeSession<T extends SessionTokens>(
  path: string,
  body: (refreshToken: string) => Record<string, unknown>,
): Promise<string> {
  if (refreshInFlight) await refreshInFlight.catch(() => undefined);

  const post = (accessToken: string | null) => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new Error("no refresh token");
    return axios.post<Envelope<T>>(`${apiClient.defaults.baseURL}${path}`, body(refreshToken), {
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
  };

  const run = (async () => {
    let response;
    try {
      response = await post(getAccessToken());
    } catch (error) {
      // The exchange route itself needs a live access token. An expired one
      // is renewed once here, inside the slot, and the exchange retried with
      // the rotated refresh token.
      if (!(error instanceof AxiosError) || error.response?.status !== 401) throw error;
      response = await post(await refreshSession());
    }
    const tokens = response.data.data;
    setSessionTokens(tokens);
    return tokens.token;
  })();

  refreshInFlight = run;
  try {
    return await run;
  } catch (error) {
    throw toApiError(error);
  } finally {
    if (refreshInFlight === run) refreshInFlight = null;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;

    const recoverable =
      error.response?.status === 401 &&
      original !== undefined &&
      !original[RETRIED] &&
      getRefreshToken() !== null;

    if (!recoverable) {
      if (error.response?.status === 401) onSessionExpired();
      return Promise.reject(error);
    }

    original[RETRIED] = true;

    try {
      // Whoever arrives first starts the refresh; everyone else awaits it.
      refreshInFlight = refreshInFlight ?? refreshSession();
      const token = await refreshInFlight;

      original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
      return apiClient.request(original);
    } catch (refreshError) {
      // The refresh itself failed: expired, revoked, or a replay the server
      // refused. Nothing left to try.
      onSessionExpired();
      return Promise.reject(refreshError);
    } finally {
      // Cleared in finally, not on success: leaving a rejected promise cached
      // would make every later 401 fail against the same stale error.
      refreshInFlight = null;
    }
  },
);

/* ------------------------------------------------------------------------- *
 * Response envelope
 *
 * The backend wraps every response. The envelope is worth keeping — request_id
 * is what turns "it broke" into a log line — but no feature module should ever
 * see it. Unwrapping happens here, once, so components work with plain data.
 * ------------------------------------------------------------------------- */

export interface Pagination {
  page: number;
  page_size: number;
  /**
   * Absent when the server did not count.
   *
   * A missing total is not zero. High-volume lists skip COUNT(*) entirely
   * because it costs more than the page itself — so render "many" or just
   * next/previous, never "0 results".
   */
  total_items?: number;
  total_pages?: number;
  /** total_items is a floor, not exact: render as `1000+`. */
  total_is_floor?: boolean;
  has_next: boolean;
  has_prev: boolean;
  /** Pass back as `cursor` for the next page. Empty on the last page. */
  next_cursor?: string;
}

/** One field-level validation failure, as returned in error.details. */
export interface Violation {
  field: string;
  rule: string;
  message: string;
}

interface Envelope<T> {
  success: boolean;
  message: string;
  timestamp: string;
  request_id: string;
  data: T;
  pagination?: Pagination;
  error?: { code: string; details?: Violation[] };
}

export interface Page<T> {
  items: T[];
  pagination: Pagination;
}

/**
 * An error carrying what the server actually said.
 *
 * `code` is the stable string to branch on — never the message, which is
 * user-facing prose and will be translated. `STALE_VERSION` in particular means
 * the record moved under the user: reload and let them redo the edit, rather
 * than showing a generic failure.
 *
 * `requestId` should appear in any error surface a user can screenshot. It is
 * the only thing that finds the matching server log.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly violations: Violation[];

  constructor(init: {
    message: string;
    code: string;
    status?: number;
    requestId?: string;
    violations?: Violation[];
  }) {
    super(init.message);
    this.name = "ApiError";
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
    this.violations = init.violations ?? [];
  }
}

function toApiError(error: unknown): ApiError {
  const axiosError = error as AxiosError<Envelope<unknown>>;
  const envelope = axiosError.response?.data;

  if (envelope && typeof envelope === "object" && "success" in envelope) {
    return new ApiError({
      message: envelope.message || "Request failed",
      code: envelope.error?.code ?? "UNKNOWN",
      status: axiosError.response?.status,
      requestId: envelope.request_id,
      violations: envelope.error?.details,
    });
  }

  // No envelope: the request never reached the API (network, timeout, proxy).
  return new ApiError({
    message: axiosError.message || "Network error",
    code: "NETWORK",
    status: axiosError.response?.status,
  });
}

/** GET one resource, unwrapped. */
export async function getOne<T>(path: string): Promise<T> {
  try {
    const response = await apiClient.get<Envelope<T>>(path);
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * GET a collection using the shared list convention.
 *
 * Pagination is returned alongside the items rather than discarded: a list that
 * throws away total_items cannot render a pager, and every caller that needs
 * one ends up refetching to count.
 */
export async function getList<T>(path: string, params: ListParams = {}): Promise<Page<T>> {
  try {
    const response = await apiClient.get<Envelope<T[]>>(`${path}${listQueryString(params)}`);
    const { data, pagination } = response.data;
    return {
      items: data ?? [],
      pagination: pagination ?? {
        page: 1,
        page_size: data?.length ?? 0,
        has_next: false,
        has_prev: false,
      },
    };
  } catch (error) {
    throw toApiError(error);
  }
}

/**
 * POST a file as multipart form data, unwrapped.
 *
 * Separate from `send` because of the Content-Type: the client instance sets
 * `application/json` by default, and a multipart body sent under that header is
 * rejected by the server before it reaches a handler. Deleting the header lets
 * the browser write its own, boundary included — which is the only way to get a
 * boundary that matches the body.
 *
 * The timeout is raised over the default because this one carries bytes: 10
 * seconds is generous for a JSON round trip and short for an upload on a phone
 * tethered at a depot.
 */
export async function upload<T>(
  path: string,
  file: File,
  field = "file",
  timeout = 60_000,
  fields?: Record<string, string>,
): Promise<T> {
  const form = new FormData();
  form.append(field, file);
  for (const [name, value] of Object.entries(fields ?? {})) {
    form.append(name, value);
  }
  try {
    const response = await apiClient.request<Envelope<T>>({
      method: "post",
      url: path,
      data: form,
      timeout,
      headers: { "Content-Type": undefined },
    });
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

/** POST / PUT / DELETE, unwrapped. */
export async function send<T>(
  method: "post" | "put" | "patch" | "delete",
  path: string,
  body?: unknown,
  // Per-call timeout override. Omitted, the instance default (10s) applies.
  // A few endpoints legitimately run long -- e.g. a SIM3LON sync drives a
  // headless browser through a login and several page loads -- and must not be
  // aborted at the default that suits an ordinary write.
  options?: { timeout?: number },
): Promise<T> {
  try {
    const response = await apiClient.request<Envelope<T>>({
      method,
      url: path,
      data: body,
      timeout: options?.timeout,
    });
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}
