import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getCurrentUser, goToLogin, logout } from "../api/auth.js";
import { AuthContext, type AuthContextValue, type AuthState } from "./auth-context.js";

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    const user = await getCurrentUser();
    setState(user ? { status: "authenticated", user } : { status: "anonymous" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getCurrentUser();
      if (!cancelled) {
        setState(
          user ? { status: "authenticated", user } : { status: "anonymous" },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login: goToLogin,
      logout,
      refresh,
    }),
    [state, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
