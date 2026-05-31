import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { apiGet, apiPost } from "./api";

interface AuthState {
  userId: number | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet("/api/auth/me")
      .then((data) => setUserId(data.userId))
      .catch(() => setUserId(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    await apiPost("/api/auth/login", { email, password });
    const data = await apiGet("/api/auth/me");
    setUserId(data.userId);
  }

  async function logout() {
    await apiPost("/api/auth/logout", {});
    setUserId(null);
  }

  return (
    <AuthContext.Provider value={{ userId, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
