/**
 * api.js — Axios client for the SchedScan admin dashboard.
 *
 * Responsibilities
 * ----------------
 * 1. Attaches the JWT access token to every request via an interceptor.
 * 2. Automatically refreshes expired access tokens (silent retry on 401).
 * 3. Exposes typed service functions for every admin API endpoint.
 *
 * Token storage keys
 * ------------------
 *   admin_access     : short-lived JWT access token
 *   admin_refresh    : long-lived JWT refresh token
 *   admin_user       : JSON-stringified { id, email, first_name, last_name }
 */

import axios from "axios";

// ---------------------------------------------------------------------------
// Base configuration
// ---------------------------------------------------------------------------

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// ---------------------------------------------------------------------------
// Token helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the active storage backend.
 * When "Remember this device" is unchecked the tokens live in sessionStorage
 * so they are wiped when the tab closes.  Otherwise they persist in
 * localStorage.
 */
function _storage() {
  // If sessionStorage has tokens it means the user chose NOT to persist.
  if (sessionStorage.getItem("admin_access")) return sessionStorage;
  return localStorage;
}

export const tokenStorage = {
  getAccess:  () => _storage().getItem("admin_access"),
  getRefresh: () => _storage().getItem("admin_refresh"),
  getUser: () => {
    try {
      const raw = _storage().getItem("admin_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /**
   * Store tokens.
   * @param {string}  access
   * @param {string}  refresh
   * @param {object}  user
   * @param {boolean} persist  true → localStorage (survive browser restart),
   *                           false → sessionStorage (cleared on tab close).
   *                           Defaults to true so the refresh interceptor
   *                           (which doesn't know the user's preference)
   *                           keeps writing to whichever backend is active.
   */
  set: (access, refresh, user, persist = true) => {
    const target = persist ? localStorage : sessionStorage;
    // Always clear both backends first so we never have stale tokens
    // sitting in the "other" storage.
    localStorage.removeItem("admin_access");
    localStorage.removeItem("admin_refresh");
    localStorage.removeItem("admin_user");
    sessionStorage.removeItem("admin_access");
    sessionStorage.removeItem("admin_refresh");
    sessionStorage.removeItem("admin_user");

    target.setItem("admin_access", access);
    target.setItem("admin_refresh", refresh);
    target.setItem("admin_user", JSON.stringify(user));
  },

  clear: () => {
    localStorage.removeItem("admin_access");
    localStorage.removeItem("admin_refresh");
    localStorage.removeItem("admin_user");
    sessionStorage.removeItem("admin_access");
    sessionStorage.removeItem("admin_refresh");
    sessionStorage.removeItem("admin_user");
  },
};

// ---------------------------------------------------------------------------
// Request interceptor — attach access token
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use(
  (config) => {
    const token = tokenStorage.getAccess();
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ---------------------------------------------------------------------------
// Response interceptor — silent token refresh on 401
// ---------------------------------------------------------------------------

let _isRefreshing = false;
let _pendingQueue = []; // resolvers waiting for the new token

function _processQueue(error, token = null) {
  _pendingQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  _pendingQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh for 401 responses that haven't been retried yet,
    // and skip the refresh endpoint itself to prevent infinite loops.
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url.includes("/auth/token/refresh/") &&
      !originalRequest.url.includes("/admin/login/")
    ) {
      const refreshToken = tokenStorage.getRefresh();
      if (!refreshToken) {
        tokenStorage.clear();
        window.dispatchEvent(new Event("admin_session_expired"));
        return Promise.reject(error);
      }

      if (_isRefreshing) {
        // Queue this request until the ongoing refresh completes.
        return new Promise((resolve, reject) => {
          _pendingQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest.headers["Authorization"] = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      _isRefreshing = true;

      try {
        const { data } = await axios.post(`${BASE_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });

        const newAccess = data.access;
        // simplejwt rotates the refresh token when ROTATE_REFRESH_TOKENS=True
        const newRefresh = data.refresh || refreshToken;
        const user = tokenStorage.getUser();
        // Preserve the current storage backend (session vs local)
        const persist = !sessionStorage.getItem("admin_access");

        tokenStorage.set(newAccess, newRefresh, user, persist);
        apiClient.defaults.headers.common["Authorization"] = `Bearer ${newAccess}`;

        _processQueue(null, newAccess);
        originalRequest.headers["Authorization"] = `Bearer ${newAccess}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        _processQueue(refreshError, null);
        tokenStorage.clear();
        window.dispatchEvent(new Event("admin_session_expired"));
        return Promise.reject(refreshError);
      } finally {
        _isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise API errors into a plain object { message, status, data }. */
export function parseApiError(err) {
  if (err.response) {
    const data = err.response.data;
    const message =
      data?.detail ||
      data?.error ||
      data?.message ||
      (typeof data === "string" ? data : "An unexpected error occurred.");
    return { message, status: err.response.status, data };
  }
  if (err.request) {
    return { message: "No response from server. Check your connection.", status: null, data: null };
  }
  return { message: err.message || "Unknown error.", status: null, data: null };
}

// ---------------------------------------------------------------------------
// Admin Authentication
// ---------------------------------------------------------------------------

export const authApi = {
  /**
   * Authenticate as admin.  Stores tokens on success.
   * @returns {{ user, access, refresh }}
   */
  /**
   * @param {boolean} persist  true to survive browser restart (localStorage).
   */
  login: async (email, password, persist = true) => {
    const { data } = await apiClient.post("/admin/login/", { email, password });
    tokenStorage.set(data.access, data.refresh, data.user, persist);
    return data;
  },

  /**
   * Blacklist the current refresh token and clear local storage.
   */
  logout: async () => {
    const refresh = tokenStorage.getRefresh();
    try {
      if (refresh) {
        await apiClient.post("/auth/logout/", { refresh });
      }
    } finally {
      tokenStorage.clear();
    }
  },
};

// ---------------------------------------------------------------------------
// User Management
// ---------------------------------------------------------------------------

export const usersApi = {
  /**
   * Paginated user list.
   * params: { search, user_type, is_active, page, page_size }
   */
  list: (params = {}) => apiClient.get("/admin/users/", { params }),

  /** Single user detail. */
  get: (id) => apiClient.get(`/admin/users/${id}/`),

  /** User activity/relationship detail for admin modal. */
  getActivity: (id) => apiClient.get(`/admin/users/${id}/activity/`),

  /**
   * Toggle active status.
   * @param {number} id
   * @param {boolean} isActive
   */
  setActive: (id, isActive) =>
    apiClient.patch(`/admin/users/${id}/`, { is_active: isActive }),

  /** Toggle faculty verification status. */
  setVerified: (id, isVerified) =>
    apiClient.patch(`/admin/users/${id}/`, { is_verified: isVerified }),

  /**
   * Change a user's account type.
   * @param {number} id
   * @param {'student'|'faculty'|'parent'} userType
   * NOTE: This is intentionally removed — arbitrary role changes are no longer
   * supported through the admin dashboard. Faculty status is granted exclusively
   * through the faculty schedule upload → approval workflow.
   */
  // setUserType is deprecated and removed.
};

// ---------------------------------------------------------------------------
// Faculty Verification — Notification-Driven Queue
// ---------------------------------------------------------------------------

export const pendingVerificationsApi = {
  /**
   * List faculty users who uploaded a schedule but are not yet verified.
   * params: { search, page, page_size }
   */
  list: (params = {}) => apiClient.get('/admin/pending-verifications/', { params }),

  /**
   * Approve a faculty verification request.
   * @param {number} id  faculty user id
   */
  approve: (id) => apiClient.post(`/admin/pending-verifications/${id}/approve/`),

  /**
   * Reject a faculty verification request.
   * @param {number} id      faculty user id
   * @param {string} reason  optional rejection reason forwarded to the user
   */
  reject: (id, reason = '') => apiClient.post(`/admin/pending-verifications/${id}/reject/`, { reason }),
};

// ---------------------------------------------------------------------------
// Parent-Student Link Management
// ---------------------------------------------------------------------------

export const parentLinksApi = {
  /**
   * Paginated parent-student links.
   * params: { search, status, page, page_size }
   */
  list: (params = {}) => apiClient.get("/admin/parent-links/", { params }),

  /**
   * Create a link between a parent and student.
   * @param {{ parent_id: number, student_number: string }} data
   */
  create: (data) => apiClient.post("/admin/parent-links/", data),

  /** Revoke an existing link by id. */
  revoke: (id) => apiClient.delete(`/admin/parent-links/${id}/`),
};

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export const analyticsApi = {
  /** Aggregate stats for analytics screen. */
  summary: () => apiClient.get("/admin/analytics/"),

  /**
   * Time-series chart data.
   * @param {number} days  1-90
   */
  chart: (days = 7) => apiClient.get("/admin/analytics/chart/", { params: { days } }),
};

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

export const holidaysApi = {
  /**
   * List holidays.
   * params: { year, month }
   */
  list: (params = {}) => apiClient.get("/admin/holidays/", { params }),

  /** Create a holiday.
   * @param {{ name, date, holiday_type }} data
   */
  create: (data) => apiClient.post("/admin/holidays/", data),

  /** Full or partial update. */
  update: (id, data) => apiClient.patch(`/admin/holidays/${id}/`, data),

  /** Delete by id. */
  delete: (id) => apiClient.delete(`/admin/holidays/${id}/`),
};

// ---------------------------------------------------------------------------
// Calendar Events
// ---------------------------------------------------------------------------

export const calendarEventsApi = {
  /**
   * List calendar events.
   * params: { year, month }
   */
  list: (params = {}) => apiClient.get("/admin/calendar-events/", { params }),

  /**
   * Create a calendar event.
   * @param {{ title, description, date, start_time, end_time, location, event_type, visibility }} data
   */
  create: (data) => apiClient.post("/admin/calendar-events/", data),

  /** Full or partial update. */
  update: (id, data) => apiClient.patch(`/admin/calendar-events/${id}/`, data),

  /** Delete by id. */
  delete: (id) => apiClient.delete(`/admin/calendar-events/${id}/`),
};

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export const auditApi = {
  /** @param {number} limit  max 200 */
  list: (limit = 50) => apiClient.get("/admin/audit-log/", { params: { limit } }),
};

// ---------------------------------------------------------------------------
// Extraction Health Monitoring
// ---------------------------------------------------------------------------

export const extractionApi = {
  /**
   * Aggregated extraction stats.
   * @param {number} days  1-365 (default 30)
   */
  analytics: (days = 30) =>
    apiClient.get("/admin/extraction/analytics/", { params: { days } }),

  /**
   * Daily success/failure chart data.
   * @param {number} days  1-90 (default 7)
   */
  chart: (days = 7) =>
    apiClient.get("/admin/extraction/analytics/chart/", { params: { days } }),

  /**
   * Paginated list of failed extraction logs.
   * params: { search, page, page_size }
   */
  failed: (params = {}) =>
    apiClient.get("/admin/extraction/failed/", { params }),

  /**
   * Paginated list of extraction jobs for queue visibility.
   * params: { search, status, upload_type, llm_failure_reason, user_id, date_from, date_to, page, page_size }
   */
  jobs: (params = {}) =>
    apiClient.get("/admin/extraction/jobs/", { params }),
};

// ---------------------------------------------------------------------------
// Incident Reports
// ---------------------------------------------------------------------------

export const incidentsApi = {
  /**
   * Paginated list of incident reports.
   * params: { search, status, page, page_size }
   */
  list: (params = {}) =>
    apiClient.get("/admin/incidents/", { params }),

  /** Get a single incident report. */
  get: (id) => apiClient.get(`/admin/incidents/${id}/`),

  /**
   * Update status and/or admin_notes.
   * @param {number} id
   * @param {{ status?: string, admin_notes?: string }} data
   */
  update: (id, data) =>
    apiClient.patch(`/admin/incidents/${id}/`, data),
};

export default apiClient;
