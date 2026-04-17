import { NavLink, Outlet } from "react-router-dom";
import { TopBar } from "../components/TopBar.js";

/**
 * Shared chrome for every /admin/* page. Same cream-paper aesthetic as
 * the student pages, plus a tab row for the three admin surfaces.
 */
export function AdminLayout(): React.ReactElement {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-page)" }}
    >
      <TopBar />
      <div
        className="border-b"
        style={{ borderColor: "var(--color-rule)" }}
      >
        <nav
          className="max-w-[1280px] mx-auto px-6 flex gap-6 font-sans"
          aria-label="Admin sections"
        >
          <AdminTab to="/admin/llm" label="LLM settings" />
          <AdminTab to="/admin/ingest" label="Ingest" />
          <AdminTab to="/admin/review" label="Review queue" />
        </nav>
      </div>
      <main className="flex-1 max-w-[1280px] mx-auto w-full px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}

function AdminTab({
  to,
  label,
}: {
  to: string;
  label: string;
}): React.ReactElement {
  return (
    <NavLink
      to={to}
      end
      className="py-3 text-sm font-semibold no-underline"
      style={({ isActive }) => ({
        color: isActive ? "var(--color-accent)" : "var(--color-ink-muted)",
        borderBottom: `2px solid ${
          isActive ? "var(--color-accent)" : "transparent"
        }`,
      })}
    >
      {label}
    </NavLink>
  );
}
