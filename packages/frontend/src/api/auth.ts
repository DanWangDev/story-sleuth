import { apiFetch, ApiError } from "./client.js";

/**
 * Subset of the hub's user claims the frontend renders. The backend
 * returns these directly via auth-client's /api/auth/me.
 */
export interface CurrentUser {
  sub: string;
  email?: string;
  username?: string;
  display_name?: string;
  role: "student" | "parent" | "admin";
  apps?: string[];
}

/**
 * Fetch the currently-authenticated user. Returns null on 401 so
 * callers can branch on "logged in / logged out" without catching.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await apiFetch<CurrentUser>("/api/auth/me");
  } catch (err) {
    if (err instanceof ApiError && err.is_unauthorized) return null;
    throw err;
  }
}

/**
 * Send the user to the hub login page. return_to tells the hub where
 * to bounce them after they authenticate; defaults to the current URL.
 */
export function goToLogin(return_to?: string): void {
  const target = return_to ?? window.location.pathname + window.location.search;
  const params = new URLSearchParams({ return_to: target });
  window.location.assign(`/api/auth/login?${params.toString()}`);
}

/**
 * Logout via a form POST so the browser follows the backend's redirect
 * chain (destroys local session → redirects to hub end-session →
 * hub back-channel-logs-out all other apps). Matches writing-buddy.
 */
export function logout(): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/api/auth/logout";
  document.body.appendChild(form);
  form.submit();
}
