import { createContext, useState, useEffect, useCallback } from 'react';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(() => {
    return fetch('/auth/me', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setUser(data);
        return data;
      })
      .catch(() => {
        setUser(null);
        return null;
      });
  }, []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const logout = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
    setUser(null);
  };

  const handleUnauthorized = useCallback(() => {
    fetch('/auth/logout', { method: 'POST', credentials: 'include' })
      .catch(() => {})
      .finally(() => {
        setUser(null);
        window.location.href = '/';
      });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, handleUnauthorized, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}
