import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    api
      .get('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [logout]);

  const login = async (username, password) => {
    const d = await api.post('/auth/login', { username, password });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  };

  const register = async (body) => {
    const d = await api.post('/auth/register', body);
    setToken(d.token);
    setUser(d.user);
    return d.user;
  };

  const hasRole = (role) => !!user && user.roles.includes(role);

  return <AuthContext.Provider value={{ user, loading, login, register, logout, hasRole }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// Where each user lands after login.
export function homePath(user) {
  if (!user) return '/login';
  if (user.roles.includes('KYC_OFFICER')) return '/officer/queue';
  if (user.roles.includes('COMPLIANCE_OFFICER')) return '/dashboard';
  return '/my';
}
