import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import axios from "axios";
import {
  API,
  REFRESH_KEY,
  getAccessToken,
  installAuthInterceptor,
  setAuthFailureHandler,
  storeTokens,
} from "../api";

export interface User {
  id: number;
  username: string;
  email: string;
  date_joined?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, refresh: string) => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

installAuthInterceptor();
// Apply a stored token before the first render so early requests are authenticated.
const initialToken = getAccessToken();
if (initialToken) storeTokens(initialToken);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(initialToken);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    storeTokens(null, null);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setAuthFailureHandler(clearSession);
  }, [clearSession]);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/accounts/profile/`);
      setUser(res.data);
    } catch {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    if (token) {
      refreshProfile().finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [token, refreshProfile]);

  const login = (accessToken: string, refreshToken: string) => {
    storeTokens(accessToken, refreshToken);
    setIsLoading(true);
    setToken(accessToken);
  };

  const logout = async () => {
    let refresh: string | null = null;
    try {
      refresh = localStorage.getItem(REFRESH_KEY);
    } catch {
      /* ignore */
    }
    if (refresh) {
      // Revoke server-side so a stolen refresh token stops working.
      await axios.post(`${API}/api/accounts/logout/`, { refresh }).catch(() => undefined);
    }
    clearSession();
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, refreshProfile, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
