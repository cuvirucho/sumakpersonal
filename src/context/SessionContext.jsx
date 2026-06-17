/* eslint-disable react-refresh/only-export-components */
import { createContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sumak_session';

export const SessionContext = createContext({
  session: null,
  startSession: () => {},
  updateSession: () => {},
  clearSession: () => {},
});

// Lee la sesión persistida (turno en proceso) al arrancar la app.
function readStoredSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function SessionProvider({ children }) {
  const [session, setSession] = useState(readStoredSession);

  // Persiste cualquier cambio de sesión para sobrevivir a navegación y recargas.
  useEffect(() => {
    try {
      if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* almacenamiento no disponible: se ignora */
    }
  }, [session]);

  const startSession = useCallback((data) => setSession(data), []);
  const updateSession = useCallback(
    (partial) => setSession((prev) => (prev ? { ...prev, ...partial } : partial)),
    [],
  );
  const clearSession = useCallback(() => setSession(null), []);

  return (
    <SessionContext.Provider
      value={{ session, startSession, updateSession, clearSession }}
    >
      {children}
    </SessionContext.Provider>
  );
}
