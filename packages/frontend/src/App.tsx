import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
  type RouteObject,
} from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.js";
import { useAuth } from "./auth/auth-context.js";
import { LandingPage } from "./pages/LandingPage.js";
import { SessionPage } from "./pages/SessionPage.js";
import { ResultsPage } from "./pages/ResultsPage.js";
import { AdminGuard } from "./admin/AdminGuard.js";
import { AdminLayout } from "./admin/AdminLayout.js";
import { LlmSettingsPage } from "./admin/LlmSettingsPage.js";
import { IngestPage } from "./admin/IngestPage.js";
import { ReviewPage } from "./admin/ReviewPage.js";

/**
 * Routes that require an authenticated user — while the auth state is
 * loading, render nothing (LandingPage's TopBar handles the blank
 * state); once resolved, send anonymous users back to / where they
 * can sign in.
 */
function Protected({
  children,
}: {
  children: React.ReactElement;
}): React.ReactElement | null {
  const { state } = useAuth();
  if (state.status === "loading") return null;
  if (state.status === "anonymous") return <Navigate to="/" replace />;
  return children;
}

const routes: RouteObject[] = [
  { path: "/", element: <LandingPage /> },
  {
    path: "/sessions/:id",
    element: (
      <Protected>
        <SessionPage />
      </Protected>
    ),
  },
  {
    path: "/sessions/:id/results",
    element: (
      <Protected>
        <ResultsPage />
      </Protected>
    ),
  },
  {
    path: "/admin",
    element: (
      <AdminGuard>
        <AdminLayout />
      </AdminGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/llm" replace /> },
      { path: "llm", element: <LlmSettingsPage /> },
      { path: "ingest", element: <IngestPage /> },
      { path: "review", element: <ReviewPage /> },
    ],
  },
];

const router = createBrowserRouter(routes);

export function App(): React.ReactElement {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
