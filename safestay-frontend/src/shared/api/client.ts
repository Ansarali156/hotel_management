import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import toast from 'react-hot-toast';

// In dev, proxy via Vite (/api → localhost:4000).
// In production, VITE_API_BASE_URL must be set — no hardcoded fallback.
let baseURL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

// Auto-append /api/v1 if VITE_API_BASE_URL was set to just the host (any provider)
if (import.meta.env.VITE_API_BASE_URL && !baseURL.endsWith('/api/v1')) {
  baseURL = baseURL.replace(/\/$/, '') + '/api/v1';
}

const client = axios.create({
  baseURL,
  withCredentials: false,
  headers: { 'Content-Type': 'application/json' },
});

// ── Auth session helpers ─────────────────────────────────────────────────────
// Centralised because both portals touch the same keys and the interceptor
// below needs a single source of truth for the refresh token.

const AUTH_KEYS = {
  access: 'auth_token', // legacy name kept so existing reads keep working
  refresh: 'refresh_token',
  portal: 'auth_portal', // 'HOTEL' | 'POLICE' — picks the correct refresh endpoint
} as const;

export type AuthPortal = 'HOTEL' | 'POLICE';

/** Persist the access+refresh pair returned by a login or rotation. */
export function saveAuthSession(
  portal: AuthPortal,
  accessToken: string,
  refreshToken?: string
): void {
  try {
    sessionStorage.setItem(AUTH_KEYS.access, accessToken);
    sessionStorage.setItem(AUTH_KEYS.portal, portal);
    if (refreshToken) sessionStorage.setItem(AUTH_KEYS.refresh, refreshToken);
  } catch {
    /* storage full / disabled — next request will 401 and redirect */
  }
}

export function getAccessToken(): string | null {
  try { return sessionStorage.getItem(AUTH_KEYS.access); } catch { return null; }
}

export function getRefreshToken(): string | null {
  try { return sessionStorage.getItem(AUTH_KEYS.refresh); } catch { return null; }
}

export function getAuthPortal(): AuthPortal | null {
  try {
    const v = sessionStorage.getItem(AUTH_KEYS.portal);
    return v === 'HOTEL' || v === 'POLICE' ? v : null;
  } catch { return null; }
}

/** Clear every auth-scoped key we've ever written. */
export function clearAuthSession(): void {
  const keys = [
    AUTH_KEYS.access,
    AUTH_KEYS.refresh,
    AUTH_KEYS.portal,
    'hotel_id',
    'hotel_name',
    'police_badge',
    'police_officer_id',
    'police_full_name',
    'police_station_id',
    'police_jurisdiction',
  ];
  for (const k of keys) {
    try { sessionStorage.removeItem(k); } catch { /* ignore */ }
  }
}

// Attach JWT token from sessionStorage to every request
client.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Silent refresh on 401 ────────────────────────────────────────────────────
// When a protected endpoint rejects the access token, try rotating via the
// portal-appropriate refresh endpoint, then replay the original request.
// Only a refresh *failure* bounces the user to the login page.
//
// Single-flight guard: if twenty calls 401 simultaneously, we fire ONE refresh
// and everyone awaits that promise, so we don't waste refresh tokens.

let isRedirecting = false;
let refreshInFlight: Promise<string | null> | null = null;

const PUBLIC_PATHS = ['/hotel/login', '/police/login', '/login', '/'];

function clearSessionAndRedirect(loginPath: string) {
  if (isRedirecting) return;
  isRedirecting = true;

  clearAuthSession();

  if (typeof window !== 'undefined' && !PUBLIC_PATHS.includes(window.location.pathname)) {
    window.location.replace(loginPath);
  }
  // Reset after a tick so subsequent 401s during hot reload still work
  setTimeout(() => { isRedirecting = false; }, 1000);
}

/**
 * Exchange the stored refresh token for a fresh access+refresh pair.
 * Returns the new access token on success, null otherwise.
 * All callers share a single in-flight promise.
 */
async function runRefresh(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  const portal = getAuthPortal();
  if (!refreshToken || !portal) return null;

  const path = portal === 'HOTEL' ? '/auth/hotel/refresh' : '/auth/police/refresh';

  refreshInFlight = (async () => {
    try {
      // Use a plain axios call (no interceptors) so a 401 here doesn't recurse.
      const res = await axios.post<{ data: { accessToken: string; refreshToken: string } }>(
        `${baseURL}${path}`,
        { refreshToken },
        { headers: { 'Content-Type': 'application/json' } }
      );
      const { accessToken, refreshToken: newRefresh } = res.data.data;
      saveAuthSession(portal, accessToken, newRefresh);
      return accessToken;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

type RetryableConfig = AxiosRequestConfig & { _retry?: boolean };

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const original = error.config as RetryableConfig | undefined;

    // Don't try to refresh the refresh endpoint itself — that's how you
    // get an infinite loop when the refresh token is bad.
    const isRefreshCall =
      typeof original?.url === 'string' &&
      (original.url.includes('/auth/hotel/refresh') ||
        original.url.includes('/auth/police/refresh'));

    if (status === 401 && original && !original._retry && !isRefreshCall) {
      original._retry = true;
      const newAccess = await runRefresh();
      if (newAccess) {
        original.headers = original.headers ?? {};
        (original.headers as Record<string, string>).Authorization = `Bearer ${newAccess}`;
        return client.request(original);
      }

      // Refresh failed — send the user to the right login page.
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const loginPath = pathname.startsWith('/police') ? '/police/login' : '/hotel/login';
      clearSessionAndRedirect(loginPath);
    } else if (status === 401) {
      // Either we already retried, or the failing call IS the refresh.
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const loginPath = pathname.startsWith('/police') ? '/police/login' : '/hotel/login';
      clearSessionAndRedirect(loginPath);
    } else if (status === 429) {
      // Rate limited — surface as a toast so the user knows why the UI just
      // froze, instead of silently failing (N-09). Backend message is
      // "Too many requests" but we want a friendlier nudge.
      try {
        toast.error('Too many requests — please slow down and try again in a moment.', {
          id: 'global-429',
          duration: 6000,
        });
      } catch { /* ignore */ }
    } else if (status && status >= 400) {
      // Surface server crashes and validation errors globally (N-03). 
      // Page-level handlers can still toast their own friendlier message; react-hot-toast dedupes by id.
      const data: any = error.response?.data;
      
      let msg = data?.error || data?.message || 'Server error — please try again';
      
      // If it's a validation error with details, append the specific fields
      if (data?.code === 'VALIDATION_ERROR' && Array.isArray(data?.details)) {
        const detailsStr = data.details.map((d: any) => `${d.field}: ${d.message}`).join(', ');
        if (detailsStr) {
          msg = `Validation failed: ${detailsStr}`;
        }
      }

      try { toast.error(msg, { id: 'global-err', duration: 6000 }); } catch { /* ignore */ }
    }
    return Promise.reject(error);
  }
);

export default client;
