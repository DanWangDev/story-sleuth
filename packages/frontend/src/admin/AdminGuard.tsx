import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/auth-context.js";

/**
 * Admin-only route guard. Loading → render nothing. Anonymous or
 * student/parent → bounce to /. Admin → render children. The backend
 * is the authoritative enforcer (every /api/admin/* call goes through
 * requireAdmin); this is purely a UX gate so non-admins never see
 * admin chrome.
 */
export function AdminGuard({
  children,
}: {
  children: React.ReactElement;
}): React.ReactElement | null {
  const { state } = useAuth();
  if (state.status === "loading") return null;
  if (state.status === "anonymous") return <Navigate to="/" replace />;
  if (state.user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}
