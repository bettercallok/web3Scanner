import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

export const API = import.meta.env.VITE_API_BASE_URL || "";
export const WS_BASE =
  import.meta.env.VITE_WS_BASE_URL ||
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;

export const ACCESS_KEY = "access_token";
export const REFRESH_KEY = "refresh_token";

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

export function storeTokens(access: string | null, refresh?: string | null) {
  try {
    if (access) localStorage.setItem(ACCESS_KEY, access);
    else localStorage.removeItem(ACCESS_KEY);
    if (refresh !== undefined) {
      if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
      else localStorage.removeItem(REFRESH_KEY);
    }
  } catch {
    /* storage unavailable (private mode) — tokens live in memory only */
  }
  if (access) axios.defaults.headers.common["Authorization"] = `Bearer ${access}`;
  else delete axios.defaults.headers.common["Authorization"];
}

/** WebSocket URL for a scan's progress channel, authenticated via ?token=. */
export function scanSocketUrl(jobId: string): string {
  const token = getAccessToken();
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${WS_BASE}/ws/scan/${jobId}/${qs}`;
}

/**
 * Flatten a DRF error response ({detail}, {field: [msgs]}, or [msgs]) into a
 * single human-readable string.
 */
export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  const e = err as AxiosError<any>;
  const data = e?.response?.data;
  if (e?.response?.status === 429) return "Too many requests — please wait a moment and try again.";
  if (!data) return e?.message && !e?.response ? "Could not reach the server." : fallback;
  if (typeof data === "string") return data.slice(0, 300);
  if (typeof data.detail === "string") return data.detail;
  const parts: string[] = [];
  const walk = (val: unknown, key?: string) => {
    if (Array.isArray(val)) val.forEach((v) => walk(v, key));
    else if (val && typeof val === "object") Object.entries(val).forEach(([k, v]) => walk(v, k));
    else if (val != null) parts.push(key && key !== "non_field_errors" ? `${key}: ${val}` : String(val));
  };
  walk(data);
  return parts.length ? parts.join(" · ") : fallback;
}

/** Download an authenticated endpoint as a file (anchor hrefs can't send the JWT header). */
export async function downloadFile(url: string, fallbackName: string) {
  const res = await axios.get(url, { responseType: "blob" });
  const disposition: string = res.headers["content-disposition"] || "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const name = match?.[1] || fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/* ─── Silent access-token refresh ────────────────────────────────
 * Access tokens are short-lived (60 min). On a 401 we try the refresh token
 * once, replay the original request, and only log out if refresh fails.
 * Concurrent 401s share one in-flight refresh. */
let refreshing: Promise<string | null> | null = null;
let onAuthFailure: (() => void) | null = null;

export function setAuthFailureHandler(fn: () => void) {
  onAuthFailure = fn;
}

async function refreshAccessToken(): Promise<string | null> {
  let refresh: string | null = null;
  try {
    refresh = localStorage.getItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
  if (!refresh) return null;
  try {
    // Bare axios call without the interceptor's retry flag recursion.
    const res = await axios.post(
      `${API}/api/accounts/token/refresh/`,
      { refresh },
      { headers: { Authorization: "" }, _skipAuthRefresh: true } as any
    );
    storeTokens(res.data.access, res.data.refresh ?? refresh);
    return res.data.access;
  } catch {
    return null;
  }
}

let installed = false;
export function installAuthInterceptor() {
  if (installed) return;
  installed = true;
  axios.interceptors.response.use(
    (r) => r,
    async (error: AxiosError) => {
      const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean; _skipAuthRefresh?: boolean }) | undefined;
      const isAuthEndpoint = original?.url?.includes("/api/accounts/login/") || original?.url?.includes("/api/accounts/token/refresh/");
      if (error.response?.status !== 401 || !original || original._retried || original._skipAuthRefresh || isAuthEndpoint) {
        throw error;
      }
      original._retried = true;
      refreshing = refreshing ?? refreshAccessToken().finally(() => (refreshing = null));
      const token = await refreshing;
      if (!token) {
        storeTokens(null, null);
        onAuthFailure?.();
        throw error;
      }
      original.headers = original.headers ?? {};
      (original.headers as any)["Authorization"] = `Bearer ${token}`;
      return axios(original);
    }
  );
}
