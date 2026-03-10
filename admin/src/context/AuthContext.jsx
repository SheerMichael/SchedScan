/**
 * AuthContext — global authentication state for the admin dashboard.
 *
 * Provides
 * --------
 *   isAuthenticated : boolean   – true when a valid access token is in storage
 *   adminUser       : object    – { id, email, first_name, last_name } | null
 *   isLoading       : boolean   – true while the initial auth check runs
 *   login           : async fn  – authenticates and stores tokens
 *   logout          : async fn  – blacklists refresh token and clears storage
 *   error           : string    – last login error message, or null
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authApi, tokenStorage, parseApiError } from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [adminUser, setAdminUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // checking stored tokens on first load
  const [error, setError] = useState(null);

  // -----------------------------------------------------------------------
  // Restore session from localStorage on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    const storedUser = tokenStorage.getUser();
    const storedAccess = tokenStorage.getAccess();

    if (storedUser && storedAccess) {
      setAdminUser(storedUser);
    }
    setIsLoading(false);
  }, []);

  // -----------------------------------------------------------------------
  // Listen for session expiry events dispatched by the axios interceptor
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handleExpiry = () => {
      setAdminUser(null);
      tokenStorage.clear();
    };
    window.addEventListener("admin_session_expired", handleExpiry);
    return () => window.removeEventListener("admin_session_expired", handleExpiry);
  }, []);

  // -----------------------------------------------------------------------
  // Login
  // -----------------------------------------------------------------------
  /**
   * @param {boolean} persist  true → keep session across browser restarts.
   */
  const login = useCallback(async (email, password, persist = true) => {
    setError(null);
    try {
      const data = await authApi.login(email, password, persist);
      setAdminUser(data.user);
      return { success: true };
    } catch (err) {
      const { message } = parseApiError(err);
      setError(message);
      return { success: false, message };
    }
  }, []);

  // -----------------------------------------------------------------------
  // Logout
  // -----------------------------------------------------------------------
  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAdminUser(null);
    }
  }, []);

  const value = {
    isAuthenticated: adminUser !== null,
    adminUser,
    isLoading,
    error,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Convenience hook. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
