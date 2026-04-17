import { Link } from "react-router-dom";
import { useAuth } from "../auth/auth-context.js";

interface TopBarProps {
  right?: React.ReactNode;
}

/**
 * Site-wide top bar. Wordmark on the left (always a link back to
 * landing), caller-supplied content on the right for page-specific
 * affordances (e.g. session timer). Sign-in / sign-out lives here
 * so it's reachable from every page.
 */
export function TopBar({ right }: TopBarProps): React.ReactElement {
  const { state, logout } = useAuth();

  return (
    <header
      className="border-b border-rule bg-paper"
      style={{ borderColor: "var(--color-rule)", background: "var(--color-paper)" }}
    >
      <div className="max-w-[1280px] mx-auto px-6 py-4 flex items-center justify-between">
        <Link
          to="/"
          className="font-serif text-2xl font-bold tracking-tight no-underline"
          style={{ color: "var(--color-ink)" }}
        >
          Story <span style={{ color: "var(--color-accent)" }}>Sleuth</span>
        </Link>
        <div className="flex items-center gap-4">
          {right}
          {state.status === "authenticated" && (
            <button
              type="button"
              onClick={logout}
              className="text-sm text-ink-muted hover:text-ink"
              style={{ color: "var(--color-ink-muted)" }}
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
